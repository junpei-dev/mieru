/**
 * 予報の組み立て
 *
 * 「軌道計算」と「天気」と「採点」を束ねて、アプリと通知が使う最終形にする。
 * PWA も GitHub Actions のバッチも、入口はこの関数ひとつ。
 * 二重実装を避けることが要件 NFR-9 の目的そのもの。
 */

import {
  FORECAST_DAYS,
  MIN_STORED_GEOMETRIC_QUALITY,
  MIN_STORED_PASSES,
  MS_PER_DAY,
} from './constants.js';
import { findPasses } from './passes.js';
import { fetchWeatherSeries, sampleWeatherAt } from './weather.js';
import type { WeatherSeries } from './weather.js';
import { geometricQuality, toScoredPass } from './scoring.js';
import { isFresh, ageInDays } from './tle.js';
import type { OrbitalElements } from './tle.js';
import { resolveSatelliteSpec } from './satellites.js';
import type { ObserverSite, Pass, PassesDocument, ScoredPass } from './types.js';

export interface BuildForecastOptions {
  site: ObserverSite;
  /** 追跡する衛星の軌道要素 */
  elements: OrbitalElements[];
  /** 予報の起点。既定は現在時刻 */
  fromMs?: number;
  /** 予報日数。既定7日 */
  days?: number;
  /** 取得済みの天気系列。未指定なら内部で取得する */
  weather?: WeatherSeries | null;
  /** テスト用の fetch 差し替え */
  fetchImpl?: typeof fetch;
}

/**
 * 指定地点の可視パスを計算し、天気を突き合わせて採点する。
 *
 * 天気の取得に失敗しても例外は投げない。
 * 各パスの score.weatherKnown が false になり、通知側がそれを見て送信を止める。
 */
export async function buildForecast(
  options: BuildForecastOptions,
): Promise<PassesDocument> {
  const {
    site,
    elements,
    fromMs = Date.now(),
    days = FORECAST_DAYS,
    fetchImpl = fetch,
  } = options;

  const toMs = fromMs + days * MS_PER_DAY;

  // 天気は1地点1回だけ取得し、全パスで使い回す（APIへの負荷を最小化）
  const weather =
    options.weather !== undefined
      ? options.weather
      : await fetchWeatherSeries(site, days, fetchImpl);

  const passes: Pass[] = [];
  for (const element of elements) {
    // 古い軌道要素は静かに使わない。方角が数度ずれた予報は害にしかならない
    if (!isFresh(element, fromMs)) continue;

    // 判別できない衛星は飛ばす。
    // 以前は ISS の定義を流用していたが、ISSは -1.8等と極めて明るいため、
    // 暗い衛星を「金星より明るい」と予報してしまう致命的なバグになる。
    const spec = resolveSatelliteSpec(element.noradId, element.objectName);
    if (!spec) continue;

    passes.push(
      ...findPasses({
        satrec: element.satrec,
        spec,
        site,
        startMs: fromMs,
        endMs: toMs,
      }),
    );
  }

  passes.sort((a, b) => a.culmination.timeMs - b.culmination.timeMs);

  const allScored: ScoredPass[] = passes.map((pass) =>
    toScoredPass(
      pass,
      weather ? sampleWeatherAt(weather, pass.culmination.timeMs) : null,
    ),
  );

  // 見に行く価値のないパスは残さない。
  // 追跡衛星が増えると、仰角が低い・暗い・深夜といった理由で
  // 誰も見ないパスが大量に出て、予報が実質ノイズになる。
  const worthwhile = allScored.filter(
    (scored) =>
      geometricQuality(scored.score.factors) >= MIN_STORED_GEOMETRIC_QUALITY,
  );

  // 全部落ちた場合でも「次のチャンス」を示せるよう、良いものから最低限は残す
  const scoredPasses =
    worthwhile.length >= MIN_STORED_PASSES
      ? worthwhile
      : [...allScored]
          .sort(
            (a, b) =>
              geometricQuality(b.score.factors) -
              geometricQuality(a.score.factors),
          )
          .slice(0, MIN_STORED_PASSES)
          .sort((a, b) => a.pass.culmination.timeMs - b.pass.culmination.timeMs);

  return {
    schemaVersion: 1,
    locationId: site.id,
    site,
    generatedAtMs: fromMs,
    validUntilMs: toMs,
    scoredPasses,
  };
}

/** 軌道要素の鮮度レポート。運用監視の表示に使う */
export function describeElementsFreshness(
  elements: OrbitalElements[],
  nowMs: number = Date.now(),
): { noradId: string; ageDays: number; fresh: boolean }[] {
  return elements.map((element) => ({
    noradId: element.noradId,
    ageDays: Number(ageInDays(element, nowMs).toFixed(2)),
    fresh: isFresh(element, nowMs),
  }));
}
