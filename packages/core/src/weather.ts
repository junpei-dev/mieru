/**
 * 天気（雲量）の取得 — Open-Meteo クライアント
 *
 * APIキー不要・CORS対応なので、ブラウザからも Node からも同じコードで叩ける。
 *
 * 設計上の最重要ポイント：
 *   取得に失敗したら例外を投げず `null` を返す（FR-3.3）。
 *   呼び出し側は null を「天気不明」として扱い、通知を止める。
 *   「たぶん晴れているだろう」で通知するのが、このアプリで最もやってはいけないこと。
 */

import type { ObserverSite, WeatherSnapshot } from './types.js';
import { MS_PER_HOUR } from './constants.js';

const OPEN_METEO_ENDPOINT = 'https://api.open-meteo.com/v1/forecast';

/** 1時間刻みの予報系列。パス時刻に合わせて補間して使う */
export interface WeatherSeries {
  fetchedAtMs: number;
  /** 各要素の時刻（UTCエポックms）。昇順 */
  timesMs: number[];
  cloudTotalPct: number[];
  cloudLowPct: number[];
  cloudMidPct: number[];
  cloudHighPct: number[];
  visibilityM: (number | null)[];
  precipitationProbabilityPct: (number | null)[];
}

/** Open-Meteo のレスポンス（必要な部分だけ） */
interface OpenMeteoResponse {
  hourly?: {
    time?: number[];
    cloud_cover?: (number | null)[];
    cloud_cover_low?: (number | null)[];
    cloud_cover_mid?: (number | null)[];
    cloud_cover_high?: (number | null)[];
    visibility?: (number | null)[];
    precipitation_probability?: (number | null)[];
  };
}

/** null を含む配列を数値配列にする。欠損は fallback で埋める */
function toNumbers(
  values: (number | null)[] | undefined,
  length: number,
  fallback: number,
): number[] {
  const result: number[] = [];
  for (let i = 0; i < length; i += 1) {
    const value = values?.[i];
    result.push(typeof value === 'number' ? value : fallback);
  }
  return result;
}

function toNullableNumbers(
  values: (number | null)[] | undefined,
  length: number,
): (number | null)[] {
  const result: (number | null)[] = [];
  for (let i = 0; i < length; i += 1) {
    const value = values?.[i];
    result.push(typeof value === 'number' ? value : null);
  }
  return result;
}

/**
 * 指定地点の時間別天気を取得する。失敗時は null。
 *
 * @param forecastDays 取得日数（1〜16）。Open-Meteo の上限に合わせる
 * @param fetchImpl    テスト時に差し替えるための fetch 実装
 */
export async function fetchWeatherSeries(
  site: ObserverSite,
  forecastDays = 7,
  fetchImpl: typeof fetch = fetch,
): Promise<WeatherSeries | null> {
  const params = new URLSearchParams({
    latitude: site.latitudeDeg.toFixed(4),
    longitude: site.longitudeDeg.toFixed(4),
    hourly: [
      'cloud_cover',
      'cloud_cover_low',
      'cloud_cover_mid',
      'cloud_cover_high',
      'visibility',
      'precipitation_probability',
    ].join(','),
    // unixtime で受け取るとタイムゾーン解釈のバグが入り込む余地がなくなる
    timeformat: 'unixtime',
    timezone: 'UTC',
    forecast_days: String(Math.min(16, Math.max(1, forecastDays))),
  });

  try {
    const response = await fetchImpl(`${OPEN_METEO_ENDPOINT}?${params}`);
    if (!response.ok) return null;

    const data = (await response.json()) as OpenMeteoResponse;
    const times = data.hourly?.time;
    if (!Array.isArray(times) || times.length === 0) return null;

    const length = times.length;
    return {
      fetchedAtMs: Date.now(),
      timesMs: times.map((sec) => sec * 1000),
      // 雲量が欠損している場合は「100%（最悪）」で埋める。
      // 欠損を 0%（快晴）で埋めると、データ欠けが「見えます」通知に化ける。
      cloudTotalPct: toNumbers(data.hourly?.cloud_cover, length, 100),
      cloudLowPct: toNumbers(data.hourly?.cloud_cover_low, length, 100),
      cloudMidPct: toNumbers(data.hourly?.cloud_cover_mid, length, 0),
      cloudHighPct: toNumbers(data.hourly?.cloud_cover_high, length, 0),
      visibilityM: toNullableNumbers(data.hourly?.visibility, length),
      precipitationProbabilityPct: toNullableNumbers(
        data.hourly?.precipitation_probability,
        length,
      ),
    };
  } catch {
    // ネットワークエラー・JSONパース失敗など。すべて「天気不明」に丸める
    return null;
  }
}

/** 線形補間 */
function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/**
 * 系列から指定時刻の天気を取り出す。前後1時間の値を線形補間する。
 *
 * 系列の範囲外（7日より先など）は null を返す。
 * 範囲外を端の値で代用すると、根拠のない予報を作ることになるため。
 */
export function sampleWeatherAt(
  series: WeatherSeries,
  timeMs: number,
): WeatherSnapshot | null {
  const { timesMs } = series;
  const first = timesMs[0];
  const last = timesMs[timesMs.length - 1];
  if (first === undefined || last === undefined) return null;
  // 端から1時間以上はみ出している場合は範囲外とみなす
  if (timeMs < first - MS_PER_HOUR || timeMs > last + MS_PER_HOUR) return null;

  // 直前のインデックスを二分探索で見つける
  let low = 0;
  let high = timesMs.length - 1;
  while (high - low > 1) {
    const mid = Math.floor((low + high) / 2);
    const midTime = timesMs[mid];
    if (midTime === undefined) break;
    if (midTime <= timeMs) low = mid;
    else high = mid;
  }

  const t0 = timesMs[low];
  const t1 = timesMs[high];
  if (t0 === undefined || t1 === undefined) return null;
  const ratio = t1 === t0 ? 0 : (timeMs - t0) / (t1 - t0);
  const clampedRatio = Math.min(1, Math.max(0, ratio));

  const pick = (values: number[]): number =>
    lerp(values[low] ?? 100, values[high] ?? 100, clampedRatio);
  // 視程・降水確率は補間せず直近の値を使う（欠損しやすいため）
  const pickNullable = (values: (number | null)[]): number | null =>
    values[low] ?? values[high] ?? null;

  return {
    fetchedAtMs: series.fetchedAtMs,
    forTimeMs: timeMs,
    cloudTotalPct: pick(series.cloudTotalPct),
    cloudLowPct: pick(series.cloudLowPct),
    cloudMidPct: pick(series.cloudMidPct),
    cloudHighPct: pick(series.cloudHighPct),
    visibilityM: pickNullable(series.visibilityM),
    precipitationProbabilityPct: pickNullable(
      series.precipitationProbabilityPct,
    ),
  };
}
