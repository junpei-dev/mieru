/**
 * 見かけの等級（明るさ）の推定
 *
 * 等級は「数値が小さいほど明るい」。
 *   -4等 = 金星    -1.5等 = シリウス    0等 = ベガ    6等 = 肉眼の限界
 *
 * 衛星の明るさを決めるのは2つ。
 *   1. 距離        … 遠いほど暗い（距離の2乗に反比例）
 *   2. 位相角      … 「満月」に近い角度ほど明るい
 *
 * 位相角とは、衛星の位置から見て「太陽の方向」と「観測者の方向」がなす角。
 * 0°なら太陽を背にした観測者が衛星の全面を見ている＝満月状態で最も明るい。
 * 180°なら衛星の裏側しか見えない＝新月状態でほぼ光らない。
 */

import { angleBetweenRad, subtract, clamp } from './geometry.js';
import type { Vec3, Illumination } from './types.js';

/**
 * 等級の式で使う定数。
 *
 * mag = stdMag - 15.75 + 2.5 * log10(range^2 / k)
 *
 * この -15.75 は「stdMag を 距離1000km・照らされ率50% のときの等級」として
 * 定義するための正規化項。実際 range=1000, k=0.5 を入れると
 *   -15.75 + 2.5*log10(1000^2 / 0.5) = -15.75 + 2.5*6.301 = 0
 * となり補正項が消えて mag = stdMag になる。
 */
const MAGNITUDE_NORMALIZATION = -15.75;

/** 照らされ率の下限。0 に近いと log10 が発散するので下駄を履かせる */
const MIN_ILLUMINATED_FRACTION = 1e-4;

/**
 * 位相角[rad]を計算する。
 *
 * @param satelliteKm 衛星位置（ECI, km）
 * @param sunKm       太陽位置（ECI, km）
 * @param observerKm  観測者位置（ECI, km）
 */
export function phaseAngleRad(
  satelliteKm: Vec3,
  sunKm: Vec3,
  observerKm: Vec3,
): number {
  const satToSun = subtract(sunKm, satelliteKm);
  const satToObserver = subtract(observerKm, satelliteKm);
  return angleBetweenRad(satToSun, satToObserver);
}

/**
 * 見かけの等級を返す。影の中（umbra）なら null。
 *
 * @param standardMagnitude 衛星固有の標準等級（satellites.ts のカタログ値）
 * @param rangeKm           観測者から衛星までの距離
 * @param phaseRad          位相角
 * @param illumination      日照状態。半影なら光量が落ちる分を等級に反映する
 */
export function apparentMagnitude(
  standardMagnitude: number,
  rangeKm: number,
  phaseRad: number,
  illumination: Illumination,
): number | null {
  // 本影の中では太陽光を全く反射しないので、そもそも見えない
  if (illumination.state === 'umbra') return null;

  // 照らされ率（0=新月状態, 1=満月状態）
  const phaseFraction = (1 + Math.cos(phaseRad)) / 2;

  // 半影にいるときは太陽円盤の一部が地球に隠れているぶん暗くなる。
  // 日照率を掛けて実効的な明るさに反映する。
  const effectiveFraction = clamp(
    phaseFraction * illumination.sunlitFraction,
    MIN_ILLUMINATED_FRACTION,
    1,
  );

  return (
    standardMagnitude +
    MAGNITUDE_NORMALIZATION +
    2.5 * Math.log10((rangeKm * rangeKm) / effectiveFraction)
  );
}

/**
 * 等級を一般の人に伝わる日本語にする。
 * 「-3.4等」と言われても分からないので、身近な天体に例える。
 */
export function describeMagnitudeJa(magnitude: number): string {
  if (magnitude <= -3.5) return '金星より明るい';
  if (magnitude <= -2.5) return '金星なみに明るい';
  if (magnitude <= -1.0) return 'シリウスより明るい';
  if (magnitude <= 0.5) return '一等星なみ';
  if (magnitude <= 2.0) return '北斗七星なみ';
  if (magnitude <= 3.5) return 'やや暗い星なみ';
  if (magnitude <= 5.0) return '暗い。街明かりでは厳しい';
  return '肉眼ではほぼ見えない';
}
