/**
 * テスト用の ISS 軌道要素（固定フィクスチャ）
 *
 * 2026-09-17 に CelesTrak から取得した実データ。
 * テストを再現可能にするため、ネットワークを叩かずこの固定値を使う。
 *
 * 平均運動 15.49152308 回/日 → 周期 = 1440 / 15.49152308 ≒ 92.95 分
 * 軌道傾斜角 51.6307° → 緯度 ±51.63° の範囲を通過する
 */

import type { OMMJsonObject } from 'satellite.js';

export const ISS_OMM_FIXTURE: OMMJsonObject = {
  OBJECT_NAME: 'ISS (ZARYA)',
  OBJECT_ID: '1998-067A',
  EPOCH: '2026-09-17T11:56:43.373472',
  MEAN_MOTION: 15.49152308,
  ECCENTRICITY: 0.00048268,
  INCLINATION: 51.6307,
  RA_OF_ASC_NODE: 203.2288,
  ARG_OF_PERICENTER: 149.9993,
  MEAN_ANOMALY: 210.1273,
  EPHEMERIS_TYPE: 0,
  CLASSIFICATION_TYPE: 'U',
  NORAD_CAT_ID: 25544,
  ELEMENT_SET_NO: 999,
  REV_AT_EPOCH: 58606,
  BSTAR: 0.00012306319,
  MEAN_MOTION_DOT: 6.372e-5,
  MEAN_MOTION_DDOT: 0,
};

/** フィクスチャの元期（UTCエポックms） */
export const ISS_EPOCH_MS = Date.parse('2026-09-17T11:56:43.373Z');

/** 軌道傾斜角[deg]。緯度の上限として不変量テストに使う */
export const ISS_INCLINATION_DEG = 51.6307;

/** 平均運動から導いた周期[分] */
export const ISS_PERIOD_MIN = 1440 / 15.49152308;
