/**
 * 衛星が太陽に照らされているかの判定
 *
 * 本アプリの根幹。「夜だから見える」ではなく
 * 「観測地は暗く、かつ衛星だけが太陽光を浴びている」ときにだけ衛星は見える。
 *
 * ISS が見えるのはまさに日没直後・日の出直前で、
 * 地上は暗いのに高度400kmはまだ陽が当たっている時間帯である。
 * 単純な「地球の夜側にいるか」で判定すると、この一番おいしい時間帯を
 * まるごと取りこぼす。
 *
 * 計算は satellite.js の `shadowFraction` に任せる。
 * これは本影／半影を「衛星から見た太陽円盤のうち地球に隠された面積の割合」として
 * 円‐円交差面積で厳密に求めるモデルで、自前の線形近似より正確。
 */

import { shadowFraction } from 'satellite.js';
import type { AU, EciVec3, Kilometer } from 'satellite.js';
import type { Illumination } from './types.js';

/**
 * 半影と判定する境界値。
 * shadowFraction は 0（完全日照）〜1（本影）の連続値を返すので、
 * 両端に微小なマージンを取って3状態に分類する。
 */
const FULLY_LIT_THRESHOLD = 0.001;
const FULLY_SHADOWED_THRESHOLD = 0.999;

/**
 * 衛星の日照状態を返す。
 *
 * @param sunAu 太陽位置（AU・ECI）。sun.ts の sunPositionAu で得る
 * @param satelliteKm 衛星位置（km・ECI）。SGP4 の出力そのまま
 */
export function illuminationOf(
  sunAu: EciVec3<AU>,
  satelliteKm: EciVec3<Kilometer>,
): Illumination {
  // 太陽円盤のうち地球に覆われている割合（0=全部見えている, 1=完全に隠れている）
  const obscured = shadowFraction(sunAu, satelliteKm);
  const sunlitFraction = 1 - obscured;

  if (obscured <= FULLY_LIT_THRESHOLD) {
    return { state: 'sunlit', sunlitFraction: 1 };
  }
  if (obscured >= FULLY_SHADOWED_THRESHOLD) {
    return { state: 'umbra', sunlitFraction: 0 };
  }
  return { state: 'penumbra', sunlitFraction };
}

/** 衛星が光って見える状態か（半影でも部分的には光る） */
export function isVisiblyLit(illumination: Illumination): boolean {
  return illumination.state !== 'umbra';
}
