/**
 * 太陽の位置と、観測地点から見た太陽高度
 *
 * 用途は2つ。
 *  1. 観測地の空が暗いかどうかの判定（太陽高度 < -6°）
 *  2. 衛星が地球の影に入っているかの判定（shadow.ts に渡す）
 *
 * 太陽位置は satellite.js の `sunPos`（Vallado の標準ルーチン）を使う。
 * 自前実装しないのは、SGP4 と同じ座標系・同じ実装系で揃えたほうが
 * 系統誤差が相殺されて有利なため。
 */

import {
  sunPos,
  jday,
  gstime,
  eciToEcf,
  ecfToLookAngles,
  radiansToDegrees,
} from 'satellite.js';
import type { AU, EciVec3, GMSTime } from 'satellite.js';
import { AU_KM } from './constants.js';
import type { ObserverSite, Vec3 } from './types.js';
import { siteToGeodetic } from './observer.js';

/** ある時刻の太陽の位置（AU単位・ECI）。shadowFraction にそのまま渡せる形 */
export function sunPositionAu(timeMs: number): EciVec3<AU> {
  return sunPos(jday(new Date(timeMs))).rsun;
}

/** AU単位の太陽位置を km に直す。位相角の計算に使う */
export function sunAuToKm(rsun: EciVec3<AU>): Vec3 {
  return { x: rsun.x * AU_KM, y: rsun.y * AU_KM, z: rsun.z * AU_KM };
}

/**
 * 観測地点から見た太陽高度[deg]を返す。
 *
 * 負の値ほど空が暗い。
 *   0° 〜  -6° : 市民薄明（まだ明るい。ISSでも見つけにくい）
 *  -6° 〜 -12° : 航海薄明（急速に暗くなる。ここから見やすい）
 * -12° 〜 -18° : 天文薄明
 *       -18°以下: 完全な夜
 *
 * 衛星と全く同じ変換経路（ECI → ECF → LookAngles）を通すことで、
 * 座標変換由来の誤差が両者で揃う。
 */
export function sunAltitudeDeg(site: ObserverSite, timeMs: number): number {
  const date = new Date(timeMs);
  const gmst = gstime(date);
  const sunKm = sunAuToKm(sunPos(jday(date)).rsun);
  const sunEcf = eciToEcf(sunKm, gmst);
  const look = ecfToLookAngles(siteToGeodetic(site), sunEcf);
  return radiansToDegrees(look.elevation);
}

/**
 * 太陽位置と GMST をまとめて返す（1時刻あたりの計算を使い回すためのヘルパ）。
 *
 * パス探索では同じ時刻について「衛星の見え方」「太陽高度」「影判定」を
 * すべて計算する。sunPos と gstime を3回呼ぶのは無駄なので1回にまとめる。
 */
export function solarContext(timeMs: number): {
  gmst: GMSTime;
  sunAu: EciVec3<AU>;
  sunKm: Vec3;
} {
  const date = new Date(timeMs);
  const sunAu = sunPos(jday(date)).rsun;
  return {
    gmst: gstime(date),
    sunAu,
    sunKm: sunAuToKm(sunAu),
  };
}
