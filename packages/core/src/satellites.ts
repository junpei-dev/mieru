/**
 * 追跡対象の衛星カタログ
 *
 * standardMagnitude（標準等級）は実観測に基づく経験値であり、確定値ではない。
 * 予報が実際より明るい／暗い場合は、ここだけを直せば全体に反映される。
 * この値をコードに直接埋め込まないのは、キャリブレーションを可能にするため。
 */

import type { SatelliteSpec } from './types.js';

/** ISS の NORAD カタログ番号。定数として何度も使う */
export const ISS_NORAD_ID = '25544';

/** 中国宇宙ステーション（天宮）の NORAD カタログ番号 */
export const CSS_NORAD_ID = '48274';

export const ISS: SatelliteSpec = {
  noradId: ISS_NORAD_ID,
  name: 'ISS (ZARYA)',
  displayName: '国際宇宙ステーション',
  kind: 'iss',
  // 広く使われている実測由来の値。この値だと天頂通過時に -3.5〜-4.3等となり、
  // 実際の観測（最大 -4.4等程度）とよく一致する。
  standardMagnitude: -1.8,
  notifiable: true,
};

export const CSS: SatelliteSpec = {
  noradId: CSS_NORAD_ID,
  name: 'CSS (TIANHE)',
  displayName: '中国宇宙ステーション 天宮',
  kind: 'css',
  // ISS より小さいぶん暗い。最大でも -1〜-2等程度。
  standardMagnitude: -1.0,
  notifiable: false, // P4 で有効化を検討
};

/**
 * Starlink の標準等級は「打ち上げ直後」と「運用中」で全く違う。
 * 距離の差だけでなく、姿勢（太陽電池パネルの向き）が違うため。
 *
 * - 打ち上げ直後（トレイン期）: パネル展開前の姿勢＋低高度で明るい。実観測 1〜3等
 * - 運用中: 遮光対策（誘電体ミラー等）済みで暗い。実観測 6〜7等
 *
 * 本アプリが通知するのはトレイン期のみ（要件7.2）。
 * 運用中の衛星は肉眼では実質見えないので、通知すると嘘になる。
 */
export const STARLINK_TRAIN: SatelliteSpec = {
  noradId: '', // 個々の衛星ごとに動的に設定する
  name: 'STARLINK',
  displayName: 'Starlink（打ち上げ直後の列）',
  kind: 'starlink-train',
  standardMagnitude: 4.0, // ★要キャリブレーション（実観測で補正すること）
  notifiable: true,
};

export const STARLINK_OPERATIONAL: SatelliteSpec = {
  noradId: '',
  name: 'STARLINK',
  displayName: 'Starlink（運用中）',
  kind: 'starlink-operational',
  standardMagnitude: 7.5, // ★要キャリブレーション
  notifiable: false, // 肉眼で見えないので通知しない
};

/** P0〜P3 で実際に追跡する衛星。Starlink は P4 で追加する */
export const TRACKED_SATELLITES: SatelliteSpec[] = [ISS];

/** NORAD ID から衛星定義を引く。未知の衛星は null */
export function findSatelliteSpec(noradId: string): SatelliteSpec | null {
  return (
    [ISS, CSS].find((spec) => spec.noradId === noradId) ?? null
  );
}
