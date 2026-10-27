/**
 * スコアリングのテスト
 *
 * 最重要は「乗算特性」。1つでも致命的な因子があれば総合スコアが0に落ちること。
 * これが崩れると「雲量100%なのに通知が飛ぶ」という、
 * このアプリで最もやってはいけない失敗（要件R-1）が起きる。
 */

import { describe, it, expect } from 'vitest';
import {
  cloudFactor,
  darknessFactor,
  durationFactor,
  elevationFactor,
  convenienceFactor,
  timeOfDayOf,
  isNotifiable,
  magnitudeFactor,
  scorePass,
  toScoredPass,
} from '../src/scoring.js';
import type { Pass, TrackPoint, WeatherSnapshot } from '../src/types.js';

/** テスト用のパスを作る。既定は「理想的な条件」 */
function makePass(overrides: Partial<Pass> = {}): Pass {
  const culmination: TrackPoint = {
    // 2026-09-18 19:42 JST = 10:42 UTC。ゴールデンタイム
    timeMs: Date.parse('2026-09-18T10:42:00Z'),
    azimuthDeg: 180,
    elevationDeg: 68,
    rangeKm: 430,
    illumination: { state: 'sunlit', sunlitFraction: 1 },
    magnitude: -3.4,
    ...overrides.culmination,
  };
  return {
    id: 'test-pass',
    noradId: '25544',
    satelliteName: '国際宇宙ステーション',
    start: { ...culmination, elevationDeg: 0, azimuthDeg: 225 },
    culmination,
    end: { ...culmination, elevationDeg: 0, azimuthDeg: 45 },
    durationSec: 380,
    visibleDurationSec: 380,
    peakMagnitude: -3.4,
    sunAltitudeAtCulminationDeg: -14,
    track: [culmination],
    ...overrides,
  };
}

/** テスト用の天気。既定は快晴 */
function makeWeather(overrides: Partial<WeatherSnapshot> = {}): WeatherSnapshot {
  return {
    fetchedAtMs: Date.now(),
    forTimeMs: Date.parse('2026-09-18T10:42:00Z'),
    cloudTotalPct: 5,
    cloudLowPct: 0,
    cloudMidPct: 0,
    cloudHighPct: 5,
    visibilityM: 24000,
    precipitationProbabilityPct: 0,
    ...overrides,
  };
}

describe('個別の因子', () => {
  it('快晴の雲因子はほぼ1', () => {
    expect(cloudFactor(makeWeather())).toBeGreaterThan(0.95);
  });

  it('下層雲100%で雲因子が0になる（完全に遮られる）', () => {
    expect(cloudFactor(makeWeather({ cloudLowPct: 100 }))).toBe(0);
  });

  it('上層雲だけなら半分程度は残る（巻雲は明るい衛星なら透ける）', () => {
    const factor = cloudFactor(makeWeather({ cloudHighPct: 100 }));
    expect(factor).toBeGreaterThan(0.3);
    expect(factor).toBeLessThan(0.6);
  });

  it('同じ雲量なら下層雲のほうが上層雲より不利', () => {
    const low = cloudFactor(makeWeather({ cloudLowPct: 60, cloudHighPct: 0 }));
    const high = cloudFactor(makeWeather({ cloudLowPct: 0, cloudHighPct: 60 }));
    expect(low).toBeLessThan(high);
  });

  it('仰角因子は10°で最小、50°以上で最大になる', () => {
    expect(elevationFactor(10)).toBeCloseTo(0.15, 2);
    expect(elevationFactor(50)).toBeCloseTo(1.0, 2);
    expect(elevationFactor(85)).toBeCloseTo(1.0, 2);
    expect(elevationFactor(30)).toBeGreaterThan(elevationFactor(20));
  });

  it('等級因子は明るいほど大きく、単調に減る', () => {
    // 金星級は満点。ここから暗くなるほど下がり続けること
    expect(magnitudeFactor(-3.4)).toBeCloseTo(1.0, 2);
    const samples = [-3.4, -2, -1, 0, 1, 2, 3, 4, 5, 7].map(magnitudeFactor);
    for (let i = 1; i < samples.length; i += 1) {
      expect(samples[i]!).toBeLessThanOrEqual(samples[i - 1]!);
    }
    expect(magnitudeFactor(7)).toBeLessThan(0.1);
  });

  it('肉眼で確実に見える明るさを不当に低く評価しない', () => {
    // −0.8等（シリウス級）のBlueBirdが直線式では0.80止まりになり、
    // 晴天・仰角79°でも通知に届かなかった。実際の見つけやすさに合わせてある
    expect(magnitudeFactor(-0.8)).toBeGreaterThan(0.93);
    expect(magnitudeFactor(0)).toBeGreaterThan(0.85);
  });

  it('街中で追えない暗さは大きく減点する', () => {
    // 3等より暗い動く点を肉眼で追うのは現実的でない
    expect(magnitudeFactor(3)).toBeLessThan(0.4);
    expect(magnitudeFactor(4)).toBeLessThan(0.15);
  });

  it('暗さ因子は太陽高度 -6°より明るいと0になる', () => {
    expect(darknessFactor(-5, -3)).toBe(0);
    expect(darknessFactor(-20, 0)).toBeCloseTo(1.0, 2);
  });

  it('明るい衛星ほど薄明に強い', () => {
    // −4等のISSは太陽高度−6°の明るい薄明でもはっきり見える。
    // +2等の衛星は完全に暗くならないと見えない。
    // これを区別しないと、ISSの薄明中のパスを過小評価してしまう
    expect(darknessFactor(-7, -4)).toBeCloseTo(1.0, 1);
    expect(darknessFactor(-7, 2)).toBeLessThan(0.6);
  });

  it('時間帯は「都合」であってスコアには掛けない', () => {
    const evening = Date.parse('2026-09-18T11:00:00Z'); // 20:00 JST
    const dawn = Date.parse('2026-09-18T20:00:00Z'); // 05:00 JST 翌日
    const lateNight = Date.parse('2026-09-18T18:00:00Z'); // 03:00 JST 翌日

    expect(timeOfDayOf(evening)).toBe('evening');
    expect(timeOfDayOf(dawn)).toBe('dawn');
    expect(timeOfDayOf(lateNight)).toBe('midnight');

    expect(convenienceFactor(evening)).toBe(1.0);
    expect(convenienceFactor(dawn)).toBeGreaterThanOrEqual(0.5); // 通知される
    expect(convenienceFactor(lateNight)).toBeLessThan(0.5); // 通知されない
  });

  it('継続時間因子は4分以上で最大、短くても0.5を下回らない', () => {
    expect(durationFactor(300)).toBe(1.0);
    expect(durationFactor(60)).toBe(0.5);
  });
});

describe('scorePass — 乗算モデル', () => {
  it('理想的な条件で 70点以上（通知対象）になる', () => {
    const score = scorePass(makePass(), makeWeather());
    expect(score.total).toBeGreaterThanOrEqual(70);
    expect(score.verdict).toBe('excellent');
    expect(score.weatherKnown).toBe(true);
  });

  it('★ 雲量100%（下層）なら、他がどれだけ良くても総合0になる', () => {
    // 乗算モデルの核心。加算モデルだとここが高得点になってしまう
    const score = scorePass(makePass(), makeWeather({ cloudLowPct: 100 }));
    expect(score.total).toBe(0);
    expect(score.limitingFactor).toBe('cloud');
  });

  it('★ 空が明るければ（太陽高度-5°）総合0になる', () => {
    const score = scorePass(
      makePass({ sunAltitudeAtCulminationDeg: -5 }),
      makeWeather(),
    );
    expect(score.total).toBe(0);
    expect(score.limitingFactor).toBe('darkness');
  });

  it('低い仰角のパスはスコアが大きく下がる', () => {
    const high = scorePass(makePass(), makeWeather());
    const low = scorePass(
      makePass({
        culmination: { ...makePass().culmination, elevationDeg: 12 },
      }),
      makeWeather(),
    );
    expect(low.total).toBeLessThan(high.total * 0.4);
    expect(low.limitingFactor).toBe('elevation');
  });

  it('時間帯はスコアを下げない（見えるものは見える）', () => {
    // 同じ条件のパスを夕方と深夜に置いても、見えやすさは変わらないはず。
    // 変わるのは「都合」だけ
    const base = makePass();
    const atEvening = Date.parse('2026-09-18T11:00:00Z'); // 20:00 JST
    const atMidnight = Date.parse('2026-09-18T18:00:00Z'); // 03:00 JST

    const makeAt = (timeMs: number) => {
      const culmination = { ...base.culmination, timeMs };
      return scorePass(
        makePass({ culmination, start: culmination, end: culmination }),
        makeWeather(),
      );
    };

    const evening = makeAt(atEvening);
    const midnight = makeAt(atMidnight);

    expect(midnight.total).toBe(evening.total);
    expect(midnight.convenience).toBeLessThan(evening.convenience);
    expect(midnight.timeOfDay).toBe('midnight');
  });

  it('【回帰】早朝の好条件ISSパスが通知対象になる', () => {
    // 実際に起きた不具合の再現。
    // 2026-10-16 04:54 JST の宮崎：仰角72°・−4.0等・太陽高度−18°・雲20%
    // という文句なしのパスが、早朝というだけで 46点 にしかならず
    // しきい値70点に構造的に到達できず、一度も通知されなかった。
    const timeMs = Date.parse('2026-10-15T19:54:00Z'); // 04:54 JST
    const culmination = {
      ...makePass().culmination,
      timeMs,
      elevationDeg: 72,
    };
    const score = scorePass(
      makePass({
        culmination,
        start: culmination,
        end: culmination,
        peakMagnitude: -4.0,
        sunAltitudeAtCulminationDeg: -18,
        visibleDurationSec: 360,
      }),
      // 当日の記録は雲量20〜27%。層別だとこの程度
      makeWeather({ cloudLowPct: 10, cloudMidPct: 5, cloudHighPct: 5 }),
    );

    expect(score.timeOfDay).toBe('dawn');
    expect(score.total).toBeGreaterThanOrEqual(70);
    expect(
      isNotifiable({ pass: makePass(), weather: makeWeather(), score }, 70),
    ).toBe(true);
  });

  it('深夜のパスは見えても通知しない', () => {
    const timeMs = Date.parse('2026-09-18T18:00:00Z'); // 03:00 JST
    const culmination = { ...makePass().culmination, timeMs };
    const score = scorePass(
      makePass({ culmination, start: culmination, end: culmination }),
      makeWeather(),
    );
    // 見えやすさは高くても、起こしてまで知らせる時刻ではない
    expect(
      isNotifiable({ pass: makePass(), weather: makeWeather(), score }, 50),
    ).toBe(false);
  });

  it('理由文が必ず日本語で返る', () => {
    const score = scorePass(makePass(), makeWeather({ cloudLowPct: 95 }));
    expect(score.reasonJa.length).toBeGreaterThan(0);
    expect(score.reasonJa).toContain('雲');
  });
});

describe('scorePass — 天気が取得できない場合（FR-3.3）', () => {
  it('weatherKnown が false になる', () => {
    const score = scorePass(makePass(), null);
    expect(score.weatherKnown).toBe(false);
  });

  it('軌道条件だけのスコアは計算される（アプリで表示するため）', () => {
    const score = scorePass(makePass(), null);
    expect(score.total).toBeGreaterThan(0);
  });

  it('限定因子に雲が選ばれない（判断材料がないため）', () => {
    const score = scorePass(makePass(), null);
    expect(score.limitingFactor).not.toBe('cloud');
  });

  it('★ どんなに高得点でも通知対象にならない', () => {
    // 「たぶん晴れているだろう」で通知しないことの保証
    const scored = toScoredPass(makePass(), null);
    expect(scored.score.total).toBeGreaterThanOrEqual(70);
    expect(isNotifiable(scored, 70)).toBe(false);
  });
});

describe('isNotifiable', () => {
  it('しきい値以上かつ天気が既知なら通知対象', () => {
    expect(isNotifiable(toScoredPass(makePass(), makeWeather()), 70)).toBe(true);
  });

  it('しきい値未満なら通知対象にならない', () => {
    const scored = toScoredPass(makePass(), makeWeather({ cloudMidPct: 70 }));
    expect(isNotifiable(scored, 70)).toBe(false);
  });
});
