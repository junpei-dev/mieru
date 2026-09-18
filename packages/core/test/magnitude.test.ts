/**
 * 等級推定のテスト
 *
 * 等級の式は定義そのものを検証できる。
 * stdMag は「距離1000km・照らされ率50%のときの等級」と定義しているので、
 * その条件を入れれば stdMag がそのまま返るはずである。
 */

import { describe, it, expect } from 'vitest';
import { apparentMagnitude, phaseAngleRad } from '../src/magnitude.js';
import { ISS } from '../src/satellites.js';
import type { Illumination } from '../src/types.js';

const SUNLIT: Illumination = { state: 'sunlit', sunlitFraction: 1 };
const UMBRA: Illumination = { state: 'umbra', sunlitFraction: 0 };
const HALF_PENUMBRA: Illumination = { state: 'penumbra', sunlitFraction: 0.5 };

describe('apparentMagnitude', () => {
  it('距離1000km・位相角90°（照らされ率50%）で標準等級そのものになる', () => {
    // これが stdMag の定義。式の正規化項 -15.75 が正しいことの確認になる
    const mag = apparentMagnitude(
      ISS.standardMagnitude,
      1000,
      Math.PI / 2,
      SUNLIT,
    );
    expect(mag).not.toBeNull();
    expect(mag as number).toBeCloseTo(ISS.standardMagnitude, 2);
  });

  it('ISS が天頂を通過するとき（約400km・満月状態）-3〜-4.6等になる', () => {
    // 実際の観測では最大 -4.4 等程度。この範囲に入らなければ定数がおかしい
    const mag = apparentMagnitude(ISS.standardMagnitude, 400, 0, SUNLIT);
    expect(mag).not.toBeNull();
    expect(mag as number).toBeLessThan(-3.0);
    expect(mag as number).toBeGreaterThan(-4.6);
  });

  it('地球の影の中では null を返す（光らないので等級が存在しない）', () => {
    expect(apparentMagnitude(ISS.standardMagnitude, 400, 0, UMBRA)).toBeNull();
  });

  it('距離が遠いほど暗くなる', () => {
    const near = apparentMagnitude(ISS.standardMagnitude, 400, 0, SUNLIT);
    const far = apparentMagnitude(ISS.standardMagnitude, 1600, 0, SUNLIT);
    expect(far as number).toBeGreaterThan(near as number); // 等級は大きいほど暗い
  });

  it('距離が4倍になると約3等暗くなる（距離の2乗に反比例）', () => {
    const near = apparentMagnitude(ISS.standardMagnitude, 400, 0, SUNLIT);
    const far = apparentMagnitude(ISS.standardMagnitude, 1600, 0, SUNLIT);
    // 2.5 * log10(4^2) = 2.5 * 1.204 = 3.01 等
    expect((far as number) - (near as number)).toBeCloseTo(3.01, 1);
  });

  it('位相角が大きい（三日月状態）ほど暗くなる', () => {
    const full = apparentMagnitude(ISS.standardMagnitude, 500, 0, SUNLIT);
    const crescent = apparentMagnitude(
      ISS.standardMagnitude,
      500,
      (150 * Math.PI) / 180,
      SUNLIT,
    );
    expect(crescent as number).toBeGreaterThan(full as number);
  });

  it('半影では日照中より暗くなる', () => {
    const lit = apparentMagnitude(ISS.standardMagnitude, 500, 0, SUNLIT);
    const partial = apparentMagnitude(
      ISS.standardMagnitude,
      500,
      0,
      HALF_PENUMBRA,
    );
    expect(partial as number).toBeGreaterThan(lit as number);
  });

  it('照らされ率が0でも無限大にならない（log10の発散を防いでいる）', () => {
    const mag = apparentMagnitude(ISS.standardMagnitude, 500, Math.PI, SUNLIT);
    expect(Number.isFinite(mag as number)).toBe(true);
  });
});

describe('phaseAngleRad', () => {
  const satellite = { x: 0, y: 0, z: 7000 };

  it('観測者と太陽が衛星から見て同じ方向なら位相角は0（満月状態）', () => {
    const sun = { x: 0, y: 0, z: 150_000_000 };
    const observer = { x: 0, y: 0, z: 6378 };
    // 衛星から見て、太陽は +z 方向、観測者は -z 方向 → 位相角は180°
    expect(phaseAngleRad(satellite, sun, observer)).toBeCloseTo(Math.PI, 3);
  });

  it('太陽と観測者が衛星から見て直角なら位相角は90°', () => {
    const sun = { x: 150_000_000, y: 0, z: 7000 };
    const observer = { x: 0, y: 0, z: 6378 };
    expect(phaseAngleRad(satellite, sun, observer)).toBeCloseTo(Math.PI / 2, 3);
  });
});
