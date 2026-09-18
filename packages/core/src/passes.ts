/**
 * パス探索エンジン
 *
 * 「指定した地点で、いつ・どの方角に・どれくらいの高さで衛星が見えるか」を求める。
 * 本アプリの心臓部。
 *
 * 設計は 02-design.md 4.1 の2段階法。
 *   1. 30秒ステップの粗探索で地平線をまたぐ区間を見つける
 *   2. 二分法で出没時刻を、黄金分割探索で最大仰角点を精密化する
 *
 * なぜ全時刻を細かく回さないのか：
 *   7日間を1秒刻みで回すと60万回の伝播が必要で、ブラウザでは重すぎる。
 *   30秒刻みなら2万回で済み、精密化は必要な区間だけで行えばよい。
 */

import {
  propagate,
  gstime,
  eciToEcf,
  ecfToLookAngles,
  radiansToDegrees,
} from 'satellite.js';
import type { SatRec, GeodeticLocation } from 'satellite.js';

import {
  BISECTION_ITERATIONS,
  COARSE_STEP_SEC,
  GOLDEN_SECTION_ITERATIONS,
  MAX_NAKED_EYE_MAGNITUDE,
  MAX_SUN_ALTITUDE_DEG,
  MAX_TRACK_POINTS,
  MIN_USEFUL_ELEVATION_DEG,
} from './constants.js';
import type {
  ObserverSite,
  Pass,
  SatelliteSpec,
  TrackPoint,
  Vec3,
} from './types.js';
import { siteToGeodetic, siteToEci } from './observer.js';
import { solarContext, sunAltitudeDeg } from './sun.js';
import { illuminationOf } from './shadow.js';
import { apparentMagnitude, phaseAngleRad } from './magnitude.js';

/** 内部用：ある時刻の衛星の見え方（日照や等級はまだ計算しない軽量版） */
interface RawObservation {
  timeMs: number;
  satEciKm: Vec3;
  azimuthDeg: number;
  elevationDeg: number;
  rangeKm: number;
}

export interface PassSearchOptions {
  satrec: SatRec;
  spec: SatelliteSpec;
  site: ObserverSite;
  /** 探索開始時刻（UTCエポックms） */
  startMs: number;
  /** 探索終了時刻（UTCエポックms） */
  endMs: number;
  /** これ未満の最大仰角のパスは捨てる。既定10° */
  minElevationDeg?: number;
  /** 観測地の太陽高度がこれより高ければ捨てる。既定 -6° */
  maxSunAltitudeDeg?: number;
  /**
   * これより暗いパスは捨てる[等級]。既定 4.5。
   *
   * BlueBirdのように多数機を追跡すると、暗いパスが大量に混ざって
   * 予報が「見えないものだらけ」になる。肉眼で追えないものは最初から出さない。
   */
  maxMagnitude?: number;
  /**
   * 衛星が地球の影に入っているパスを捨てるか。既定 true。
   *
   * false にすると「頭上は通るが影に入っていて光らない」パスも返る。
   * 診断用、および「今夜ISSは通りますが影の中なので見えません」という
   * 納得感のある説明をUIで出すために使う（FR-5.2）。
   */
  requireIlluminated?: boolean;
}

/**
 * ある時刻の衛星の位置・方位・仰角を求める。
 *
 * SGP4 が失敗した場合（軌道が崩壊している等）は null を返す。
 */
function observe(
  satrec: SatRec,
  geodetic: GeodeticLocation,
  timeMs: number,
): RawObservation | null {
  const date = new Date(timeMs);
  const propagated = propagate(satrec, date);
  if (!propagated) return null;

  const gmst = gstime(date);
  const ecf = eciToEcf(propagated.position, gmst);
  const look = ecfToLookAngles(geodetic, ecf);

  return {
    timeMs,
    satEciKm: propagated.position,
    azimuthDeg: radiansToDegrees(look.azimuth),
    elevationDeg: radiansToDegrees(look.elevation),
    rangeKm: look.rangeSat,
  };
}

/** 仰角だけが欲しい場面用。見つからなければ -90（＝地平線下扱い） */
function elevationAt(
  satrec: SatRec,
  geodetic: GeodeticLocation,
  timeMs: number,
): number {
  return observe(satrec, geodetic, timeMs)?.elevationDeg ?? -90;
}

/**
 * 仰角が 0° を横切る時刻を二分法で求める。
 *
 * @param beforeMs 仰角が負である側の時刻
 * @param afterMs  仰角が正である側の時刻
 */
function refineHorizonCrossing(
  satrec: SatRec,
  geodetic: GeodeticLocation,
  beforeMs: number,
  afterMs: number,
): number {
  let low = beforeMs;
  let high = afterMs;
  for (let i = 0; i < BISECTION_ITERATIONS; i += 1) {
    const mid = (low + high) / 2;
    if (elevationAt(satrec, geodetic, mid) < 0) {
      low = mid;
    } else {
      high = mid;
    }
  }
  return (low + high) / 2;
}

/** 黄金比。黄金分割探索で使う */
const INV_PHI = (Math.sqrt(5) - 1) / 2;

/**
 * 区間内で仰角が最大になる時刻を黄金分割探索で求める。
 *
 * パス内の仰角は単峰（上がって下がるだけ）なので、この方法で確実に頂点に収束する。
 * 単純に細かい刻みで走査するより、同じ精度を10分の1の計算量で得られる。
 */
function refineCulmination(
  satrec: SatRec,
  geodetic: GeodeticLocation,
  startMs: number,
  endMs: number,
): number {
  let low = startMs;
  let high = endMs;
  let x1 = high - INV_PHI * (high - low);
  let x2 = low + INV_PHI * (high - low);
  let f1 = elevationAt(satrec, geodetic, x1);
  let f2 = elevationAt(satrec, geodetic, x2);

  for (let i = 0; i < GOLDEN_SECTION_ITERATIONS; i += 1) {
    // 区間が1秒を切ったら十分
    if (high - low < 1000) break;

    if (f1 > f2) {
      high = x2;
      x2 = x1;
      f2 = f1;
      x1 = high - INV_PHI * (high - low);
      f1 = elevationAt(satrec, geodetic, x1);
    } else {
      low = x1;
      x1 = x2;
      f1 = f2;
      x2 = low + INV_PHI * (high - low);
      f2 = elevationAt(satrec, geodetic, x2);
    }
  }
  return (low + high) / 2;
}

/**
 * 軽量な観測結果に、日照状態と等級を付けて TrackPoint にする。
 *
 * 太陽位置と GMST は時刻ごとに1回だけ計算する（solarContext）。
 */
function toTrackPoint(
  raw: RawObservation,
  site: ObserverSite,
  spec: SatelliteSpec,
): TrackPoint {
  const { gmst, sunAu, sunKm } = solarContext(raw.timeMs);
  const illumination = illuminationOf(sunAu, raw.satEciKm);
  const observerEci = siteToEci(site, gmst);
  const phase = phaseAngleRad(raw.satEciKm, sunKm, observerEci);

  return {
    timeMs: raw.timeMs,
    azimuthDeg: raw.azimuthDeg,
    elevationDeg: raw.elevationDeg,
    rangeKm: raw.rangeKm,
    illumination,
    magnitude: apparentMagnitude(
      spec.standardMagnitude,
      raw.rangeKm,
      phase,
      illumination,
    ),
  };
}

/**
 * トラックから「実際に光って見えている時間」[秒]を求める。
 *
 * 影に入っていない点が連続する区間のうち、最も長いものの時間幅を返す。
 * 途中で影に入るパスでは、通過時間よりかなり短くなる。
 */
function computeVisibleDurationSec(track: TrackPoint[]): number {
  let bestSec = 0;
  let runStartMs: number | null = null;
  let runEndMs = 0;

  for (const point of track) {
    if (point.illumination.state !== 'umbra') {
      if (runStartMs === null) runStartMs = point.timeMs;
      runEndMs = point.timeMs;
    } else if (runStartMs !== null) {
      bestSec = Math.max(bestSec, (runEndMs - runStartMs) / 1000);
      runStartMs = null;
    }
  }
  if (runStartMs !== null) {
    bestSec = Math.max(bestSec, (runEndMs - runStartMs) / 1000);
  }
  return Math.round(bestSec);
}

/** パスID を作る。再計算しても同じパスなら同じIDになるよう、最大仰角時刻の「分」を使う */
function buildPassId(noradId: string, culminationMs: number): string {
  const d = new Date(culminationMs);
  const pad = (n: number, len = 2) => String(n).padStart(len, '0');
  return [
    noradId,
    '-',
    d.getUTCFullYear(),
    pad(d.getUTCMonth() + 1),
    pad(d.getUTCDate()),
    'T',
    pad(d.getUTCHours()),
    pad(d.getUTCMinutes()),
    'Z',
  ].join('');
}

/**
 * AOS〜LOS の間を等間隔にサンプリングしてトラックを作る。
 * 最大仰角点は必ず含める（描画とラベル表示で使うため）。
 */
function buildTrack(
  satrec: SatRec,
  geodetic: GeodeticLocation,
  site: ObserverSite,
  spec: SatelliteSpec,
  startMs: number,
  culminationMs: number,
  endMs: number,
): TrackPoint[] {
  const durationMs = endMs - startMs;
  // 10秒に1点を基本としつつ、上限を超えないようにする
  const desired = Math.ceil(durationMs / 10000) + 1;
  const count = Math.min(MAX_TRACK_POINTS, Math.max(8, desired));

  const timestamps: number[] = [];
  for (let i = 0; i < count; i += 1) {
    timestamps.push(startMs + (durationMs * i) / (count - 1));
  }
  // 最大仰角点を差し込んで時刻順に並べ直す
  timestamps.push(culminationMs);
  timestamps.sort((a, b) => a - b);

  const points: TrackPoint[] = [];
  for (const t of timestamps) {
    const raw = observe(satrec, geodetic, t);
    if (raw) points.push(toTrackPoint(raw, site, spec));
  }
  return points;
}

/**
 * 指定期間・指定地点の可視パスをすべて求める。
 *
 * 探索窓の端にまたがる不完全なパス（開始または終了が窓の外）は捨てる。
 * 開始時刻が分からないパスを予報しても使えないため。
 */
export function findPasses(options: PassSearchOptions): Pass[] {
  const {
    satrec,
    spec,
    site,
    startMs,
    endMs,
    minElevationDeg = MIN_USEFUL_ELEVATION_DEG,
    maxSunAltitudeDeg = MAX_SUN_ALTITUDE_DEG,
    maxMagnitude = MAX_NAKED_EYE_MAGNITUDE,
    requireIlluminated = true,
  } = options;

  const geodetic = siteToGeodetic(site);
  const stepMs = COARSE_STEP_SEC * 1000;
  const passes: Pass[] = [];

  let previousElevation = elevationAt(satrec, geodetic, startMs);
  let previousTimeMs = startMs;
  // 現在パスの中にいる場合の AOS 時刻。null なら地平線下
  let currentAosMs: number | null = null;

  for (let t = startMs + stepMs; t <= endMs; t += stepMs) {
    const elevation = elevationAt(satrec, geodetic, t);

    // 地平線を上向きに横切った → パス開始
    if (previousElevation < 0 && elevation >= 0) {
      currentAosMs = refineHorizonCrossing(satrec, geodetic, previousTimeMs, t);
    }

    // 地平線を下向きに横切った → パス終了
    if (previousElevation >= 0 && elevation < 0 && currentAosMs !== null) {
      const losMs = refineHorizonCrossing(satrec, geodetic, t, previousTimeMs);
      const pass = buildPass(
        satrec,
        geodetic,
        site,
        spec,
        currentAosMs,
        losMs,
        minElevationDeg,
        maxSunAltitudeDeg,
        maxMagnitude,
        requireIlluminated,
      );
      if (pass) passes.push(pass);
      currentAosMs = null;
    }

    previousElevation = elevation;
    previousTimeMs = t;
  }

  return passes;
}

/**
 * AOS/LOS が確定したパスについて、最大仰角・日照・等級を求めてフィルタをかける。
 * 条件を満たさなければ null を返す。
 */
function buildPass(
  satrec: SatRec,
  geodetic: GeodeticLocation,
  site: ObserverSite,
  spec: SatelliteSpec,
  aosMs: number,
  losMs: number,
  minElevationDeg: number,
  maxSunAltitudeDeg: number,
  maxMagnitude: number,
  requireIlluminated: boolean,
): Pass | null {
  const culminationMs = refineCulmination(satrec, geodetic, aosMs, losMs);

  const culminationRaw = observe(satrec, geodetic, culminationMs);
  if (!culminationRaw) return null;

  // フィルタ1：低すぎるパスは建物や山に隠れるので捨てる
  if (culminationRaw.elevationDeg < minElevationDeg) return null;

  // フィルタ2：空が明るい時間帯は、どんなに明るい衛星でも見えない
  const sunAlt = sunAltitudeDeg(site, culminationMs);
  if (sunAlt > maxSunAltitudeDeg) return null;

  // フィルタ3：衛星自身が地球の影に入っていれば光らない
  const culmination = toTrackPoint(culminationRaw, site, spec);
  if (requireIlluminated && culmination.illumination.state === 'umbra') {
    return null;
  }

  const startRaw = observe(satrec, geodetic, aosMs);
  const endRaw = observe(satrec, geodetic, losMs);
  if (!startRaw || !endRaw) return null;

  const track = buildTrack(
    satrec,
    geodetic,
    site,
    spec,
    aosMs,
    culminationMs,
    losMs,
  );

  // 等級は「小さいほど明るい」ので、最も明るい＝最小値を取る
  const magnitudes = track
    .map((p) => p.magnitude)
    .filter((m): m is number => m !== null);
  if (magnitudes.length === 0) {
    // パス全体が影の中。通常は捨てるが、診断・説明用には残す
    if (requireIlluminated) return null;
  }
  const peakMagnitude =
    magnitudes.length > 0 ? Math.min(...magnitudes) : Number.POSITIVE_INFINITY;

  // フィルタ4：肉眼で追えない暗さなら予報に載せない。
  // 「理論上は通るが見えない」情報はユーザーの時間を奪うだけ
  if (requireIlluminated && peakMagnitude > maxMagnitude) return null;

  return {
    id: buildPassId(spec.noradId, culminationMs),
    noradId: spec.noradId,
    satelliteName: spec.displayName,
    start: toTrackPoint(startRaw, site, spec),
    culmination,
    end: toTrackPoint(endRaw, site, spec),
    durationSec: Math.round((losMs - aosMs) / 1000),
    visibleDurationSec: computeVisibleDurationSec(track),
    peakMagnitude,
    sunAltitudeAtCulminationDeg: sunAlt,
    track,
  };
}
