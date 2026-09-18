/**
 * パスの選び方
 *
 * 予報に含まれる十数件のパスから「今夜どれを見せるか」「どれを通知するか」を決める。
 * アプリと通知で選び方が食い違うと、「アプリでは見えると言っているのに通知が来ない」
 * という不信を生むので、判断はここに集約する。
 */

import { NOTIFY_SCORE_THRESHOLD } from './constants.js';
import { isNotifiable } from './scoring.js';
import { jstDateKey, tonightWindow } from './time.js';
import type { ScoredPass } from './types.js';

/** 今夜（JST 15:00 〜 翌04:00）のパスだけを抜き出す */
export function passesTonight(
  passes: ScoredPass[],
  nowMs: number = Date.now(),
): ScoredPass[] {
  const { startMs, endMs } = tonightWindow(nowMs);
  return passes.filter(
    (p) =>
      p.pass.culmination.timeMs >= startMs && p.pass.culmination.timeMs <= endMs,
  );
}

/** スコアが最も高いパスを返す。同点なら早い時刻を優先する */
export function bestPass(passes: ScoredPass[]): ScoredPass | null {
  if (passes.length === 0) return null;
  return passes.reduce((best, current) => {
    if (current.score.total > best.score.total) return current;
    if (
      current.score.total === best.score.total &&
      current.pass.culmination.timeMs < best.pass.culmination.timeMs
    ) {
      return current;
    }
    return best;
  });
}

/**
 * 今夜の目玉となるパス。なければ null。
 * まだ過ぎていないパスだけを対象にする（終わったパスを案内しても意味がない）。
 */
export function tonightHighlight(
  passes: ScoredPass[],
  nowMs: number = Date.now(),
): ScoredPass | null {
  const upcoming = passesTonight(passes, nowMs).filter(
    (p) => p.pass.end.timeMs > nowMs,
  );
  return bestPass(upcoming);
}

/**
 * 次に「通知に値する」パスを返す。
 * 今夜がダメだったときに「次のチャンスは○日」と案内するために使う（FR-5.2）。
 */
export function nextNotworthyPass(
  passes: ScoredPass[],
  nowMs: number = Date.now(),
  threshold: number = NOTIFY_SCORE_THRESHOLD,
): ScoredPass | null {
  const candidates = passes
    .filter((p) => p.pass.start.timeMs > nowMs)
    .filter((p) => p.score.total >= threshold)
    .sort((a, b) => a.pass.culmination.timeMs - b.pass.culmination.timeMs);
  return candidates[0] ?? null;
}

/** 通知対象のパス（天気が確認できていて、しきい値以上のもの） */
export function notifiablePasses(
  passes: ScoredPass[],
  threshold: number = NOTIFY_SCORE_THRESHOLD,
): ScoredPass[] {
  return passes.filter((p) => isNotifiable(p, threshold));
}

/** JSTの日付ごとにグルーピングする。7日間一覧の表示に使う */
export function groupByJstDate(
  passes: ScoredPass[],
): { dateKey: string; passes: ScoredPass[] }[] {
  const groups = new Map<string, ScoredPass[]>();
  for (const pass of passes) {
    // 深夜1時のパスは「前日の夜」として扱いたいので、culmination ではなく
    // 「4時間戻した時刻」の日付でグルーピングする
    const key = jstDateKey(pass.pass.culmination.timeMs - 4 * 3600_000);
    const bucket = groups.get(key);
    if (bucket) bucket.push(pass);
    else groups.set(key, [pass]);
  }
  return [...groups.entries()]
    .map(([dateKey, items]) => ({ dateKey, passes: items }))
    .sort((a, b) => a.dateKey.localeCompare(b.dateKey));
}
