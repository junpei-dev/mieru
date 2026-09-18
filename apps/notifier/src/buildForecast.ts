/**
 * 予報生成バッチ
 *
 * GitHub Actions から1日1回起動される。
 *   1. CelesTrak から最新の軌道要素を取得（失敗したら前回のミラーで続行）
 *   2. 全対象地点について 7日分のパスを計算し、天気と突き合わせて採点
 *   3. 公開JSONとして apps/web/public/data/ に書き出す
 *
 * Cloudflare Pages はこのディレクトリごと配信し、
 * Cloudflare Worker はここで生成された JSON を読んで通知を判断する。
 *
 * このバッチが止まっても、PWA はブラウザ内計算に切り替わって動き続ける（NFR-4）。
 * ただし通知は止まるので、鮮度監視（Worker側）で検知する。
 */

import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  buildForecast,
  fetchElements,
  fetchWeatherSeries,
  fromMirror,
  TRACKED_SATELLITES,
  FORECAST_DAYS,
  NOTIFY_SCORE_THRESHOLD,
  isFresh,
  ageInDays,
} from '@mieru/core';
import type {
  IndexDocument,
  OrbitalElements,
  PassesDocument,
  ScoredPass,
  TleMirror,
  TrackPoint,
} from '@mieru/core';

import { FORECAST_SITES } from './locations.js';

const HERE = dirname(fileURLToPath(import.meta.url));
/** 公開ディレクトリ。Vite の public なのでビルド時にそのまま dist へコピーされる */
const DATA_DIR = join(HERE, '../../web/public/data');
const TLE_MIRROR_PATH = join(DATA_DIR, 'tle/tracked.json');

/** CelesTrak には身元の分かる User-Agent を送る（アクセス規約への配慮） */
const politeFetch: typeof fetch = (input, init) =>
  fetch(input, {
    ...init,
    headers: {
      ...(init?.headers ?? {}),
      'User-Agent': 'mieru/0.1 (satellite visibility forecast; personal use)',
    },
  });

function log(message: string): void {
  console.log(`[${new Date().toISOString()}] ${message}`);
}

/** 小数の桁を落としてJSONサイズを削る。観測精度には全く影響しない */
function round(value: number, digits: number): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function compactTrackPoint(point: TrackPoint): TrackPoint {
  return {
    timeMs: point.timeMs,
    azimuthDeg: round(point.azimuthDeg, 2),
    elevationDeg: round(point.elevationDeg, 2),
    rangeKm: round(point.rangeKm, 1),
    illumination: {
      state: point.illumination.state,
      sunlitFraction: round(point.illumination.sunlitFraction, 3),
    },
    magnitude: point.magnitude === null ? null : round(point.magnitude, 2),
  };
}

function compactScoredPass(scored: ScoredPass): ScoredPass {
  const { pass, weather, score } = scored;
  return {
    pass: {
      ...pass,
      start: compactTrackPoint(pass.start),
      culmination: compactTrackPoint(pass.culmination),
      end: compactTrackPoint(pass.end),
      peakMagnitude: round(pass.peakMagnitude, 2),
      sunAltitudeAtCulminationDeg: round(pass.sunAltitudeAtCulminationDeg, 1),
      track: pass.track.map(compactTrackPoint),
    },
    weather: weather
      ? {
          ...weather,
          cloudTotalPct: round(weather.cloudTotalPct, 0),
          cloudLowPct: round(weather.cloudLowPct, 0),
          cloudMidPct: round(weather.cloudMidPct, 0),
          cloudHighPct: round(weather.cloudHighPct, 0),
        }
      : null,
    score: {
      ...score,
      factors: Object.fromEntries(
        Object.entries(score.factors).map(([key, value]) => [
          key,
          round(value, 3),
        ]),
      ) as typeof score.factors,
    },
  };
}

async function writeJson(path: string, data: unknown): Promise<number> {
  await mkdir(dirname(path), { recursive: true });
  const body = JSON.stringify(data);
  await writeFile(path, body, 'utf8');
  return body.length;
}

/**
 * 軌道要素を取得する。
 * CelesTrak が落ちていても、前回のミラーが7日以内なら予報を作り続ける（要件R-4）。
 */
async function loadElements(): Promise<{
  elements: OrbitalElements[];
  fetchedAtMs: number;
  fromMirrorFile: boolean;
}> {
  try {
    const elements: OrbitalElements[] = [];
    for (const spec of TRACKED_SATELLITES) {
      elements.push(await fetchElements(spec.noradId, politeFetch));
      log(`TLE取得: ${spec.displayName} (NORAD ${spec.noradId})`);
    }
    return { elements, fetchedAtMs: Date.now(), fromMirrorFile: false };
  } catch (error) {
    log(`TLE取得に失敗: ${String(error)}`);
    log('前回のミラーで続行を試みます');

    const raw = await readFile(TLE_MIRROR_PATH, 'utf8');
    const mirror = JSON.parse(raw) as TleMirror;
    return {
      elements: fromMirror(mirror),
      fetchedAtMs: mirror.fetchedAtMs,
      fromMirrorFile: true,
    };
  }
}

async function main(): Promise<void> {
  const startedMs = Date.now();
  log(`予報生成を開始 (対象 ${FORECAST_SITES.length} 地点)`);

  const { elements, fetchedAtMs, fromMirrorFile } = await loadElements();

  // 古すぎる軌道要素で予報を作ると、方角が数度ずれた案内をしてしまう
  const usable = elements.filter((element) => {
    const fresh = isFresh(element, startedMs);
    if (!fresh) {
      log(
        `NORAD ${element.noradId} の元期が古すぎます (${ageInDays(element, startedMs).toFixed(1)}日前) — 除外`,
      );
    }
    return fresh;
  });

  if (usable.length === 0) {
    throw new Error(
      '使用可能な軌道要素がありません。予報を生成できないため中断します。',
    );
  }

  // 軌道要素のミラーを保存（次回のフォールバック用、およびPWAの自力計算用）
  const mirror: TleMirror = {
    schemaVersion: 1,
    fetchedAtMs,
    elements: usable.map((element) => element.omm),
  };
  await writeJson(TLE_MIRROR_PATH, mirror);
  log(`TLEミラーを保存${fromMirrorFile ? '（前回分を再保存）' : ''}`);

  let totalBytes = 0;
  let sitesWithoutWeather = 0;
  const locationIds: string[] = [];

  for (const site of FORECAST_SITES) {
    // 天気は地点ごとに1回だけ取得する
    const weather = await fetchWeatherSeries(site, FORECAST_DAYS, politeFetch);
    if (!weather) {
      sitesWithoutWeather += 1;
      log(`天気取得に失敗: ${site.name} — 天気不明として続行`);
    }

    const document = await buildForecast({
      site,
      elements: usable,
      fromMs: startedMs,
      days: FORECAST_DAYS,
      weather,
    });

    const compact: PassesDocument = {
      ...document,
      scoredPasses: document.scoredPasses.map(compactScoredPass),
    };

    const bytes = await writeJson(
      join(DATA_DIR, `passes/${site.id}.json`),
      compact,
    );
    totalBytes += bytes;
    locationIds.push(site.id);

    const notable = document.scoredPasses.filter(
      (p) => p.score.total >= NOTIFY_SCORE_THRESHOLD,
    ).length;
    log(
      `${site.name}: ${document.scoredPasses.length}件 (通知対象 ${notable}件) ${(bytes / 1024).toFixed(1)}KB`,
    );
  }

  const index: IndexDocument = {
    schemaVersion: 1,
    generatedAtMs: startedMs,
    tleFetchedAtMs: fetchedAtMs,
    tleEpochs: Object.fromEntries(
      usable.map((element) => [element.noradId, element.epochMs]),
    ),
    locationIds,
    notifyThreshold: NOTIFY_SCORE_THRESHOLD,
  };
  await writeJson(join(DATA_DIR, 'index.json'), index);

  log(
    `完了: ${locationIds.length}地点 / 合計 ${(totalBytes / 1024).toFixed(0)}KB / ${((Date.now() - startedMs) / 1000).toFixed(1)}秒`,
  );
  if (sitesWithoutWeather > 0) {
    log(`※ ${sitesWithoutWeather}地点で天気を取得できませんでした`);
  }
}

main().catch((error: unknown) => {
  console.error('予報生成に失敗しました:', error);
  process.exitCode = 1;
});
