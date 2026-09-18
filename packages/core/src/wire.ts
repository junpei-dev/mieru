/**
 * 配信用の圧縮表現（ワイヤーフォーマット）
 *
 * 予報JSONの容量の9割はトラック（描画用の点列）が占める。
 * オブジェクト形式だと1点あたり約150バイトかかる。
 *
 *   {"timeMs":1789000000000,"azimuthDeg":225.12,"elevationDeg":34.56,
 *    "rangeKm":612.3,"illumination":{"state":"sunlit","sunlitFraction":1},
 *    "magnitude":-2.45}
 *
 * これを配列にすると約30バイトになる。
 *
 *   [123,225.1,34.6,612,1,-2.45]
 *
 * 追跡衛星を14機に増やした結果、全国55地点の予報が13MBを超えた。
 * 毎日コミットすると年5GBになり、リポジトリが破綻する。
 *
 * ── 設計方針 ──
 * アプリのコードは扱いやすい TrackPoint のまま書けるようにし、
 * 圧縮はJSONに書き出す直前・読み込んだ直後にだけ行う。
 * 圧縮形式がドメインモデルに漏れると、以後ずっと読みにくいコードになる。
 */

import type {
  Illumination,
  PassesDocument,
  ScoredPass,
  TrackPoint,
} from './types.js';

/**
 * 圧縮されたトラック1点。
 * `[パス開始からの秒, 方位角, 仰角, 距離km, 日照率, 等級]`
 *
 * `illumination.state` は日照率から復元できるので持たない。
 */
export type WireTrackPoint = [
  offsetSec: number,
  azimuthDeg: number,
  elevationDeg: number,
  rangeKm: number,
  sunlitFraction: number,
  magnitude: number | null,
];

/** 配信用のパス表現。track 以外は元のまま */
export interface WireScoredPass
  extends Omit<ScoredPass, 'pass'> {
  pass: Omit<ScoredPass['pass'], 'track'> & { track: WireTrackPoint[] };
}

export interface WirePassesDocument
  extends Omit<PassesDocument, 'scoredPasses'> {
  scoredPasses: WireScoredPass[];
}

/** 小数の桁を落とす。観測精度には影響しない */
function round(value: number, digits: number): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

/**
 * 日照率から日照状態を復元する。
 * shadow.ts の illuminationOf と同じ境界値を使うこと。
 */
function illuminationFrom(sunlitFraction: number): Illumination {
  if (sunlitFraction >= 0.999) return { state: 'sunlit', sunlitFraction: 1 };
  if (sunlitFraction <= 0.001) return { state: 'umbra', sunlitFraction: 0 };
  return { state: 'penumbra', sunlitFraction };
}

export function encodeTrackPoint(
  point: TrackPoint,
  baseMs: number,
): WireTrackPoint {
  return [
    Math.round((point.timeMs - baseMs) / 1000),
    round(point.azimuthDeg, 1),
    round(point.elevationDeg, 1),
    Math.round(point.rangeKm),
    round(point.illumination.sunlitFraction, 3),
    point.magnitude === null ? null : round(point.magnitude, 2),
  ];
}

export function decodeTrackPoint(
  wire: WireTrackPoint,
  baseMs: number,
): TrackPoint {
  const [offsetSec, azimuthDeg, elevationDeg, rangeKm, sunlit, magnitude] =
    wire;
  return {
    timeMs: baseMs + offsetSec * 1000,
    azimuthDeg,
    elevationDeg,
    rangeKm,
    illumination: illuminationFrom(sunlit),
    magnitude,
  };
}

/** 採点済みパスを配信用に圧縮する。基準時刻はパス開始時刻 */
export function encodeScoredPass(scored: ScoredPass): WireScoredPass {
  const baseMs = scored.pass.start.timeMs;
  return {
    ...scored,
    pass: {
      ...scored.pass,
      track: scored.pass.track.map((point) => encodeTrackPoint(point, baseMs)),
    },
  };
}

export function decodeScoredPass(wire: WireScoredPass): ScoredPass {
  const baseMs = wire.pass.start.timeMs;
  return {
    ...wire,
    pass: {
      ...wire.pass,
      track: wire.pass.track.map((point) => decodeTrackPoint(point, baseMs)),
    },
  };
}

export function encodePassesDocument(
  document: PassesDocument,
): WirePassesDocument {
  return {
    ...document,
    scoredPasses: document.scoredPasses.map(encodeScoredPass),
  };
}

/**
 * 配信JSONを読み込む。
 *
 * 旧形式（トラックがオブジェクトの配列）もそのまま読めるようにしてある。
 * 端末にキャッシュされた古いJSONで画面が壊れるのを避けるため。
 */
export function decodePassesDocument(
  document: WirePassesDocument | PassesDocument,
): PassesDocument {
  return {
    ...document,
    scoredPasses: document.scoredPasses.map((scored) => {
      const first = scored.pass.track[0];
      // 配列なら新形式、オブジェクトなら旧形式
      return Array.isArray(first)
        ? decodeScoredPass(scored as WireScoredPass)
        : (scored as ScoredPass);
    }),
  };
}
