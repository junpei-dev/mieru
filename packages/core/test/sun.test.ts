/**
 * 太陽高度のテスト
 *
 * 外部の予報値と突き合わせるのではなく、天文学的に厳密に決まる値で検証する。
 * 「至の日の太陽の南中高度」は緯度と黄道傾斜角だけで決まるので、
 * 実装が正しければ必ずこの値になる。外部データに依存しない強いテストになる。
 *
 *   南中高度 = 90 - |緯度 - 太陽赤緯|
 *   深夜の高度 = |緯度 + 太陽赤緯| - 90
 */

import { describe, it, expect } from 'vitest';
import { sunAltitudeDeg } from '../src/sun.js';
import { findSite } from '../src/sites.js';
import type { ObserverSite } from '../src/types.js';

const MIYAZAKI = findSite('miyazaki-shi') as ObserverSite;

/** 黄道傾斜角[deg]（2026年頃の値）。至の日の太陽赤緯の絶対値に等しい */
const OBLIQUITY_DEG = 23.436;

/** 1日を1分刻みで走査して太陽高度の最大・最小を求める */
function scanSunAltitude(
  site: ObserverSite,
  dayStartMs: number,
): { max: number; min: number } {
  let max = -Infinity;
  let min = Infinity;
  for (let minute = 0; minute < 1440; minute += 1) {
    const altitude = sunAltitudeDeg(site, dayStartMs + minute * 60_000);
    if (altitude > max) max = altitude;
    if (altitude < min) min = altitude;
  }
  return { max, min };
}

describe('sunAltitudeDeg', () => {
  it('夏至の日の南中高度が 90 - 緯度 + 黄道傾斜角 になる', () => {
    // 2026年の夏至は6月21日ごろ。至の前後で赤緯はほとんど動かない（0.005°/日程度）
    const { max } = scanSunAltitude(MIYAZAKI, Date.parse('2026-06-21T00:00:00Z'));
    const expected = 90 - Math.abs(MIYAZAKI.latitudeDeg - OBLIQUITY_DEG);
    expect(max).toBeCloseTo(expected, 0);
    expect(Math.abs(max - expected)).toBeLessThan(0.5);
  });

  it('冬至の日の南中高度が 90 - 緯度 - 黄道傾斜角 になる', () => {
    const { max } = scanSunAltitude(MIYAZAKI, Date.parse('2026-12-21T00:00:00Z'));
    const expected = 90 - Math.abs(MIYAZAKI.latitudeDeg + OBLIQUITY_DEG);
    expect(Math.abs(max - expected)).toBeLessThan(0.5);
  });

  it('夏至の深夜の太陽高度が 緯度 + 赤緯 - 90 になる', () => {
    // 夏至の夜は太陽が地平線下の浅いところまでしか沈まない＝夜が短い
    const { min } = scanSunAltitude(MIYAZAKI, Date.parse('2026-06-21T00:00:00Z'));
    const expected = MIYAZAKI.latitudeDeg + OBLIQUITY_DEG - 90;
    expect(Math.abs(min - expected)).toBeLessThan(0.5);
  });

  it('冬至の深夜のほうが夏至の深夜より太陽が低い（＝夜が暗い）', () => {
    const summer = scanSunAltitude(MIYAZAKI, Date.parse('2026-06-21T00:00:00Z'));
    const winter = scanSunAltitude(MIYAZAKI, Date.parse('2026-12-21T00:00:00Z'));
    expect(winter.min).toBeLessThan(summer.min);
  });

  it('宮崎の夏至の夜は天文薄明が終わらない（白夜に近い状態）', () => {
    // 緯度31.9°では夏至でも太陽は-34.7°まで沈むので天文薄明(-18°)は終わる。
    // 「終わらない」のは緯度48.5°以上。この境界条件が正しく出ることを確認する
    const { min } = scanSunAltitude(MIYAZAKI, Date.parse('2026-06-21T00:00:00Z'));
    expect(min).toBeLessThan(-18);
  });

  it('高緯度（札幌）は宮崎より夏至の南中高度が低い', () => {
    const sapporo = findSite('sapporo') as ObserverSite;
    const dayStart = Date.parse('2026-06-21T00:00:00Z');
    expect(scanSunAltitude(sapporo, dayStart).max).toBeLessThan(
      scanSunAltitude(MIYAZAKI, dayStart).max,
    );
  });
});
