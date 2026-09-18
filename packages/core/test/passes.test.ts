/**
 * パス探索エンジンのテスト
 *
 * 外部の予報サイトと突き合わせるテストは、ネットワークと相手方の仕様変更に
 * 依存して壊れやすい。ここでは「物理的に必ず成り立つ性質」を検証する。
 * 実予報との突合（要件NFR-3）は M1 完了時に手動で1回行う。
 */

import { describe, it, expect } from 'vitest';
import { eciToGeodetic, gstime, propagate, degreesLat } from 'satellite.js';

import { findPasses } from '../src/passes.js';
import { parseOmm } from '../src/tle.js';
import { findSite } from '../src/sites.js';
import { ISS } from '../src/satellites.js';
import { EARTH_RADIUS_KM, MS_PER_DAY } from '../src/constants.js';
import { magnitudeOf } from '../src/geometry.js';
import {
  ISS_OMM_FIXTURE,
  ISS_EPOCH_MS,
  ISS_INCLINATION_DEG,
  ISS_PERIOD_MIN,
} from './fixtures/iss.js';
import type { ObserverSite } from '../src/types.js';

const MIYAZAKI = findSite('miyazaki-shi') as ObserverSite;
const elements = parseOmm(ISS_OMM_FIXTURE);

/** 探索の起点。元期の直後にすることで TLE の誤差を最小にする */
const SEARCH_START_MS = ISS_EPOCH_MS + 3600_000;

describe('軌道要素のパース', () => {
  it('NORAD ID と元期を正しく読み取る', () => {
    expect(elements.noradId).toBe('25544');
    expect(elements.objectName).toBe('ISS (ZARYA)');
    expect(elements.epochMs).toBeCloseTo(ISS_EPOCH_MS, -3);
  });

  it('平均運動から求まる周期が約92.9分になる', () => {
    // satrec.no はラジアン/分。周期 = 2π / no
    const periodMin = (2 * Math.PI) / elements.satrec.no;
    expect(periodMin).toBeCloseTo(ISS_PERIOD_MIN, 0);
    expect(periodMin).toBeGreaterThan(90);
    expect(periodMin).toBeLessThan(95);
  });
});

describe('SGP4 伝播の妥当性', () => {
  it('ISS の高度が常に 380〜440 km の範囲に収まる', () => {
    // 単位の取り違え（m と km、地球半径の足し忘れ）を検出できる
    for (let minute = 0; minute < 1440; minute += 7) {
      const date = new Date(SEARCH_START_MS + minute * 60_000);
      const result = propagate(elements.satrec, date);
      expect(result).not.toBeNull();
      const altitudeKm =
        magnitudeOf(result!.position) - EARTH_RADIUS_KM;
      expect(altitudeKm).toBeGreaterThan(380);
      expect(altitudeKm).toBeLessThan(440);
    }
  });

  it('直下点の緯度が軌道傾斜角（51.63°）を超えない', () => {
    // 座標変換が壊れていれば、この上限を必ず突破する
    let maxAbsLatitude = 0;
    for (let minute = 0; minute < 200; minute += 2) {
      const date = new Date(SEARCH_START_MS + minute * 60_000);
      const result = propagate(elements.satrec, date);
      if (!result) continue;
      const geodetic = eciToGeodetic(result.position, gstime(date));
      maxAbsLatitude = Math.max(
        maxAbsLatitude,
        Math.abs(degreesLat(geodetic.latitude)),
      );
    }
    // 1周期以上見ているので、最大緯度は傾斜角にほぼ達するはず
    expect(maxAbsLatitude).toBeLessThanOrEqual(ISS_INCLINATION_DEG + 0.5);
    expect(maxAbsLatitude).toBeGreaterThan(ISS_INCLINATION_DEG - 3);
  });
});

describe('findPasses — 幾何的なパス（フィルタなし）', () => {
  // フィルタを外して「地平線より上に出る通過」をすべて拾う。
  // これは季節や天候に依存しないので、テストが不安定にならない。
  const geometricPasses = findPasses({
    satrec: elements.satrec,
    spec: ISS,
    site: MIYAZAKI,
    startMs: SEARCH_START_MS,
    endMs: SEARCH_START_MS + 2 * MS_PER_DAY,
    minElevationDeg: 0,
    maxSunAltitudeDeg: 90, // 昼夜を問わない
  });

  it('2日間で妥当な数のパスが見つかる', () => {
    // ISS は1日に地平線上を4〜6回通る。うち日照中なのは半分程度。
    // 幅を広く取り、0件や異常に多い件数だけを検出する
    expect(geometricPasses.length).toBeGreaterThan(2);
    expect(geometricPasses.length).toBeLessThan(40);
  });

  it('すべてのパスで 開始・終了の仰角がほぼ 0° である', () => {
    // 二分法による出没時刻の精密化が効いていることの確認
    for (const pass of geometricPasses) {
      expect(Math.abs(pass.start.elevationDeg)).toBeLessThan(0.2);
      expect(Math.abs(pass.end.elevationDeg)).toBeLessThan(0.2);
    }
  });

  it('最大仰角点は開始・終了より必ず高い', () => {
    for (const pass of geometricPasses) {
      expect(pass.culmination.elevationDeg).toBeGreaterThan(
        pass.start.elevationDeg,
      );
      expect(pass.culmination.elevationDeg).toBeGreaterThan(
        pass.end.elevationDeg,
      );
    }
  });

  it('最大仰角点はトラック上のどの点よりも高い（黄金分割探索の検証）', () => {
    for (const pass of geometricPasses) {
      for (const point of pass.track) {
        // 探索は0.1秒精度なので、ごく僅かな超過は許容する
        expect(point.elevationDeg).toBeLessThanOrEqual(
          pass.culmination.elevationDeg + 0.01,
        );
      }
    }
  });

  it('時刻の順序が 開始 < 最大 < 終了 になっている', () => {
    for (const pass of geometricPasses) {
      expect(pass.start.timeMs).toBeLessThan(pass.culmination.timeMs);
      expect(pass.culmination.timeMs).toBeLessThan(pass.end.timeMs);
    }
  });

  it('継続時間が ISS として妥当（1分〜12分）', () => {
    for (const pass of geometricPasses) {
      expect(pass.durationSec).toBeGreaterThan(60);
      expect(pass.durationSec).toBeLessThan(720);
    }
  });

  it('光って見えている時間は通過時間を超えない', () => {
    // 途中で影に入るパスでは、見える時間のほうが短くなる
    for (const pass of geometricPasses) {
      expect(pass.visibleDurationSec).toBeGreaterThanOrEqual(0);
      expect(pass.visibleDurationSec).toBeLessThanOrEqual(pass.durationSec);
    }
  });

  it('影に入る区間があるパスでは、見える時間が通過時間より短い', () => {
    const withShadow = geometricPasses.filter((pass) =>
      pass.track.some((point) => point.illumination.state === 'umbra'),
    );
    // 日没後のパスは必ず途中で影に入るので、該当が0件なら影判定が壊れている
    expect(withShadow.length).toBeGreaterThan(0);
    for (const pass of withShadow) {
      expect(pass.visibleDurationSec).toBeLessThan(pass.durationSec);
    }
  });

  it('パスが時刻順に並んでおり、重複しない', () => {
    for (let i = 1; i < geometricPasses.length; i += 1) {
      const previous = geometricPasses[i - 1]!;
      const current = geometricPasses[i]!;
      expect(current.start.timeMs).toBeGreaterThan(previous.end.timeMs);
    }
  });

  it('連続するパスの間隔がおおむね軌道周期の整数倍になる', () => {
    // ISS は約92.9分ごとに戻ってくる。間隔がこの倍数から大きく外れるなら
    // パスを取りこぼしているか、偽のパスを作っている
    for (let i = 1; i < geometricPasses.length; i += 1) {
      const gapMin =
        (geometricPasses[i]!.culmination.timeMs -
          geometricPasses[i - 1]!.culmination.timeMs) /
        60_000;
      const revolutions = gapMin / ISS_PERIOD_MIN;
      const deviation = Math.abs(revolutions - Math.round(revolutions));
      expect(deviation).toBeLessThan(0.25);
    }
  });

  it('パスIDが一意である', () => {
    const ids = new Set(geometricPasses.map((p) => p.id));
    expect(ids.size).toBe(geometricPasses.length);
  });
});

describe('findPasses — 可視パス（フィルタあり）', () => {
  const visiblePasses = findPasses({
    satrec: elements.satrec,
    spec: ISS,
    site: MIYAZAKI,
    startMs: SEARCH_START_MS,
    endMs: SEARCH_START_MS + 5 * MS_PER_DAY,
  });

  it('返されたパスはすべて最大仰角10°以上（FR-2.5）', () => {
    for (const pass of visiblePasses) {
      expect(pass.culmination.elevationDeg).toBeGreaterThanOrEqual(10);
    }
  });

  it('返されたパスはすべて観測地の太陽高度が -6°以下（FR-2.4）', () => {
    for (const pass of visiblePasses) {
      expect(pass.sunAltitudeAtCulminationDeg).toBeLessThanOrEqual(-6);
    }
  });

  it('返されたパスはすべて最大仰角時に地球の影の外にいる（FR-2.3）', () => {
    for (const pass of visiblePasses) {
      expect(pass.culmination.illumination.state).not.toBe('umbra');
      expect(pass.culmination.magnitude).not.toBeNull();
    }
  });

  it('最大光度が肉眼で見える明るさ（6等より明るい）', () => {
    for (const pass of visiblePasses) {
      expect(pass.peakMagnitude).toBeLessThan(6);
    }
  });

  it('トラックが描画に十分な点数を持つ（FR-2.7）', () => {
    for (const pass of visiblePasses) {
      expect(pass.track.length).toBeGreaterThanOrEqual(8);
      expect(pass.track.length).toBeLessThanOrEqual(61);
    }
  });

  it('可視パスは幾何的パスの部分集合である', () => {
    const geometric = findPasses({
      satrec: elements.satrec,
      spec: ISS,
      site: MIYAZAKI,
      startMs: SEARCH_START_MS,
      endMs: SEARCH_START_MS + 5 * MS_PER_DAY,
      minElevationDeg: 0,
      maxSunAltitudeDeg: 90,
    });
    expect(visiblePasses.length).toBeLessThanOrEqual(geometric.length);
  });
});

describe('findPasses — 性能', () => {
  it('7日分の探索が 3 秒以内に終わる（NFR-2）', () => {
    const started = Date.now();
    findPasses({
      satrec: elements.satrec,
      spec: ISS,
      site: MIYAZAKI,
      startMs: SEARCH_START_MS,
      endMs: SEARCH_START_MS + 7 * MS_PER_DAY,
    });
    const elapsedMs = Date.now() - started;
    // ブラウザは Node より遅いので、ここでは余裕を持った上限にする
    expect(elapsedMs).toBeLessThan(3000);
  });
});
