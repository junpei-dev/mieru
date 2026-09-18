/**
 * 通知の判定ロジック
 *
 * ここで守るべき最優先事項は「送らない判断を正しくすること」。
 * 送り損ねても次のチャンスがあるが、
 * 曇っている夜に「見えます」と送ったら信用は戻らない。
 *
 * CPU制約：Cloudflare Workers 無料プランは Cron 実行でも CPU 10ms。
 * この関数群は fetch と数値比較しかしない（軌道計算は一切しない）。
 * fetch の待ち時間は CPU 時間に計上されないため、10ms に収まる。
 */

import {
  defaultSite,
  fetchWeatherSeries,
  findSite,
  nextNotworthyPass,
  passesTonight,
  pregeneratedSiteFor,
  sampleWeatherAt,
  scorePass,
  bestPass,
  isNotifiable,
  NOTIFY_SCORE_THRESHOLD,
  REMINDER_ABORT_SCORE,
  STALE_FORECAST_HOURS,
  MS_PER_HOUR,
} from '@mieru/core';
import type {
  IndexDocument,
  ObserverSite,
  PassesDocument,
  ScoredPass,
} from '@mieru/core';

import type { Env } from './env.js';
import { broadcast, fetchQuota, push } from './line.js';
import {
  listUsers,
  markSent,
  shouldAlert,
  wasSent,
  type NotificationKind,
} from './store.js';
import {
  adminAlertMessage,
  advanceMessage,
  reminderMessage,
} from './messages.js';

/** broadcast 時に確保しておく残枠。友だち数が正確に取れないための安全マージン */
const BROADCAST_RESERVE = 25;

/** リマインドを出す時間帯：開始の25〜40分前 */
const REMINDER_WINDOW_MIN = { from: 25, to: 40 };

/**
 * 通知の宛先。
 *
 * `site` はユーザーが選んだ地点、`forecastSite` は軌道予報の取得元。
 * Worker は軌道計算ができないので、事前生成されていない地点を選ばれた場合は
 * 最寄りの生成済み地点の軌道を使う（数十km離れてもパス時刻は数秒しか変わらない）。
 * ただし天気は場所で変わるため、必ず `site` 側で取り直す。
 */
interface Target {
  kind: 'broadcast' | 'user';
  /** kind === 'user' のときだけ意味を持つ */
  userId?: string;
  site: ObserverSite;
  forecastSite: ObserverSite;
  threshold: number;
}

async function fetchPasses(
  env: Env,
  locationId: string,
): Promise<PassesDocument | null> {
  try {
    const response = await fetch(
      `${env.SITE_BASE_URL}/data/passes/${locationId}.json`,
      { cf: { cacheTtl: 300 } },
    );
    if (!response.ok) return null;
    return (await response.json()) as PassesDocument;
  } catch {
    return null;
  }
}

async function fetchIndex(env: Env): Promise<IndexDocument | null> {
  try {
    const response = await fetch(`${env.SITE_BASE_URL}/data/index.json`, {
      cf: { cacheTtl: 300 },
    });
    if (!response.ok) return null;
    return (await response.json()) as IndexDocument;
  } catch {
    return null;
  }
}

function toTarget(
  site: ObserverSite,
  threshold: number,
  userId?: string,
): Target {
  return {
    kind: userId ? 'user' : 'broadcast',
    userId,
    site,
    forecastSite: pregeneratedSiteFor(site),
    threshold,
  };
}

/**
 * 通知の宛先を決める。
 *
 * ユーザー登録が1件もなければ（Phase 1）、既定地点で broadcast する。
 * broadcast は友だち全員に届くので、userId を集める仕組みがまだ無くても運用できる。
 */
async function resolveTargets(env: Env): Promise<Target[]> {
  const users = await listUsers(env);
  const active = users.filter(({ record }) => record.enabled);

  if (active.length === 0) {
    const site = findSite(env.DEFAULT_LOCATION_ID) ?? defaultSite();
    return [toTarget(site, NOTIFY_SCORE_THRESHOLD)];
  }

  return active.map(({ userId, record }) =>
    toTarget(
      findSite(record.locationId) ?? defaultSite(),
      record.threshold,
      userId,
    ),
  );
}

/** 送信枠が足りるかを確認する。足りなければ送らずに管理者へ1回だけ警告する */
async function hasQuotaFor(env: Env, needed: number): Promise<boolean> {
  try {
    const quota = await fetchQuota(env.LINE_CHANNEL_ACCESS_TOKEN);
    if (quota.remaining >= needed) return true;

    if (await shouldAlert(env, 'quota', 24 * 60 * 60)) {
      await notifyAdmin(
        env,
        `LINEの無料枠が不足しています（${quota.used}/${quota.limit ?? '∞'}通）。` +
          '今月はこれ以上の通知を送りません。',
      );
    }
    return false;
  } catch (error) {
    // 枠が確認できないときは送らない。
    // 「たぶん大丈夫だろう」で送って上限に達すると、以後1通も送れなくなる
    console.error('送信枠の確認に失敗:', error);
    return false;
  }
}

async function notifyAdmin(env: Env, reason: string): Promise<void> {
  if (!env.ADMIN_LINE_USER_ID) {
    console.error('[admin alert]', reason);
    return;
  }
  try {
    await push(
      env.LINE_CHANNEL_ACCESS_TOKEN,
      env.ADMIN_LINE_USER_ID,
      adminAlertMessage(reason),
    );
  } catch (error) {
    console.error('管理者への警告送信に失敗:', error);
  }
}

async function send(env: Env, target: Target, text: string): Promise<void> {
  if (target.kind === 'broadcast' || !target.userId) {
    await broadcast(env.LINE_CHANNEL_ACCESS_TOKEN, text);
  } else {
    await push(env.LINE_CHANNEL_ACCESS_TOKEN, target.userId, text);
  }
}

/**
 * 指定地点の最新の天気で採点し直す。
 *
 * 2つの場面で使う。
 *   1. ユーザーの地点が事前生成地点と違うとき（天気が別の場所のものだから）
 *   2. リマインド直前（朝は晴れ予報でも夕方に曇ることがある・要件R-1）
 */
async function rescoreWithWeatherAt(
  scored: ScoredPass,
  site: ObserverSite,
): Promise<ScoredPass> {
  const series = await fetchWeatherSeries(site, 2);
  if (!series) {
    // 天気が取れないなら「不明」に落とす。楽観的に古い値を使い回さない
    return { ...scored, weather: null, score: scorePass(scored.pass, null) };
  }
  const weather = sampleWeatherAt(series, scored.pass.culmination.timeMs);
  return { ...scored, weather, score: scorePass(scored.pass, weather) };
}

/** 宛先ごとの予報を取り出す。地点がズレている場合は天気を取り直す */
async function loadPassesFor(
  env: Env,
  target: Target,
  cache: Map<string, PassesDocument | null>,
): Promise<PassesDocument | null> {
  const key = target.forecastSite.id;
  if (!cache.has(key)) {
    cache.set(key, await fetchPasses(env, key));
  }
  return cache.get(key) ?? null;
}

/** ユーザーの地点と予報の地点が違うか（＝天気を取り直す必要があるか） */
function needsWeatherRefresh(target: Target): boolean {
  return target.site.id !== target.forecastSite.id;
}

// ─────────────────────────────────────────────
// 予告（毎朝 10:07 JST）
// ─────────────────────────────────────────────

export async function runAdvanceNotification(env: Env): Promise<void> {
  const targets = await resolveTargets(env);
  const needed =
    targets[0]?.kind === 'broadcast' ? BROADCAST_RESERVE : targets.length;

  const cache = new Map<string, PassesDocument | null>();
  let quotaChecked = false;

  for (const target of targets) {
    const document = await loadPassesFor(env, target, cache);
    if (!document) continue;

    // 今夜のパスのうち、通知に値するもの
    const candidates = passesTonight(document.scoredPasses, Date.now()).filter(
      (scored) => isNotifiable(scored, target.threshold),
    );
    // 複数あっても1通だけ送る。何通も届くと通知そのものが疎まれる
    let best = bestPass(candidates);
    if (!best) continue;
    if (await wasSent(env, best.pass.id, 'advance')) continue;

    // ユーザーの地点が事前生成地点と違うなら、本人の場所の天気で採点し直す
    if (needsWeatherRefresh(target)) {
      best = await rescoreWithWeatherAt(best, target.site);
      if (!isNotifiable(best, target.threshold)) continue;
    }

    if (!quotaChecked) {
      if (!(await hasQuotaFor(env, needed))) return;
      quotaChecked = true;
    }

    await send(
      env,
      target,
      advanceMessage(best, env.SITE_BASE_URL, target.site.name),
    );
    await markSent(env, best.pass.id, 'advance');
  }
}

// ─────────────────────────────────────────────
// リマインド（15分ごと）
// ─────────────────────────────────────────────

export async function runReminderNotification(env: Env): Promise<void> {
  const now = Date.now();
  const fromMs = now + REMINDER_WINDOW_MIN.from * 60_000;
  const toMs = now + REMINDER_WINDOW_MIN.to * 60_000;

  const targets = await resolveTargets(env);
  const needed =
    targets[0]?.kind === 'broadcast' ? BROADCAST_RESERVE : targets.length;

  const cache = new Map<string, PassesDocument | null>();
  let quotaChecked = false;

  for (const target of targets) {
    const document = await loadPassesFor(env, target, cache);
    if (!document) continue;

    // これから25〜40分後に始まるパス
    const upcoming = document.scoredPasses.find(
      (scored) =>
        scored.pass.start.timeMs >= fromMs &&
        scored.pass.start.timeMs <= toMs &&
        scored.score.total >= target.threshold,
    );
    if (!upcoming) continue;
    if (await wasSent(env, upcoming.pass.id, 'reminder')) continue;

    // ★ 直前の天気で、ユーザー本人の地点について採点し直す
    const fresh = await rescoreWithWeatherAt(upcoming, target.site);

    if (!fresh.score.weatherKnown || fresh.score.total < REMINDER_ABORT_SCORE) {
      // 条件が崩れた。リマインドは送らず、二度と送らないよう記録だけする
      await markSent(env, upcoming.pass.id, 'reminder');
      console.log(
        `リマインド中止: ${upcoming.pass.id} ` +
          `${upcoming.score.total}点 → ${fresh.score.total}点`,
      );
      continue;
    }

    if (!quotaChecked) {
      if (!(await hasQuotaFor(env, needed))) return;
      quotaChecked = true;
    }

    await send(env, target, reminderMessage(fresh, env.SITE_BASE_URL));
    await markSent(env, upcoming.pass.id, 'reminder');
  }
}

// ─────────────────────────────────────────────
// データ鮮度の監視（FR-7.1）
// ─────────────────────────────────────────────

/**
 * 予報が更新され続けているかを見張る。
 *
 * GitHub Actions の scheduled workflow は、リポジトリが60日間無活動だと
 * 自動的に無効化される。それに気づかないまま「通知が来ない＝見える日がない」と
 * 誤解し続けるのが最悪のパターンなので、ここで検出する。
 */
export async function checkForecastFreshness(env: Env): Promise<void> {
  const index = await fetchIndex(env);

  if (!index) {
    if (await shouldAlert(env, 'index-missing', 12 * 60 * 60)) {
      await notifyAdmin(env, '予報データ（index.json）を取得できません。');
    }
    return;
  }

  const ageHours = (Date.now() - index.generatedAtMs) / MS_PER_HOUR;
  if (ageHours > STALE_FORECAST_HOURS) {
    if (await shouldAlert(env, 'stale', 24 * 60 * 60)) {
      await notifyAdmin(
        env,
        `予報が${Math.floor(ageHours)}時間更新されていません。\n` +
          'GitHub Actions のスケジュール実行が停止している可能性があります。\n' +
          '（60日間リポジトリに活動がないと自動で無効化されます）',
      );
    }
  }
}

// ─────────────────────────────────────────────
// 動作確認用
// ─────────────────────────────────────────────

/**
 * 「いま予告を送るとしたら、どんな文面になるか」を返す。実際には送らない。
 *
 * 初回セットアップの動作確認に使う。
 * Cron（朝10:07）を待たずに済み、貴重な無料枠も消費しない。
 * 「通知が来ない」のが可視期間外なのか設定ミスなのかも、これで切り分けられる。
 */
export async function previewAdvance(
  env: Env,
): Promise<{ site: string; forecastSite: string; text: string | null; reason: string }[]> {
  const targets = await resolveTargets(env);
  const cache = new Map<string, PassesDocument | null>();
  const results: {
    site: string;
    forecastSite: string;
    text: string | null;
    reason: string;
  }[] = [];

  for (const target of targets) {
    const base = {
      site: target.site.name,
      forecastSite: target.forecastSite.name,
    };

    const document = await loadPassesFor(env, target, cache);
    if (!document) {
      results.push({
        ...base,
        text: null,
        reason: '予報JSONを取得できません。SITE_BASE_URL の設定を確認してください。',
      });
      continue;
    }

    const tonight = passesTonight(document.scoredPasses, Date.now());
    if (tonight.length === 0) {
      results.push({
        ...base,
        text: null,
        reason: `今夜このあと通過するパスがありません（7日間の総数は${document.scoredPasses.length}件）。`,
      });
      continue;
    }

    let best = bestPass(tonight);
    if (best && needsWeatherRefresh(target)) {
      best = await rescoreWithWeatherAt(best, target.site);
    }
    if (!best) continue;

    if (!isNotifiable(best, target.threshold)) {
      results.push({
        ...base,
        text: null,
        reason:
          `今夜の最高スコアは${best.score.total}点で、しきい値${target.threshold}点に届きません。` +
          `（${best.score.reasonJa}）`,
      });
      continue;
    }

    results.push({
      ...base,
      text: advanceMessage(best, env.SITE_BASE_URL, target.site.name),
      reason: `${best.score.total}点。条件を満たすので送信対象です。`,
    });
  }

  return results;
}

/** 次の好機を調べる。中止通知で「次は◯日」と案内するために使う */
export async function findNextChance(
  env: Env,
  locationId: string,
): Promise<ScoredPass | null> {
  const site = findSite(locationId) ?? defaultSite();
  const document = await fetchPasses(env, pregeneratedSiteFor(site).id);
  if (!document) return null;
  return nextNotworthyPass(document.scoredPasses, Date.now());
}

export type { NotificationKind };
