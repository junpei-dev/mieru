/**
 * ベクトル演算ユーティリティ
 *
 * 位相角（衛星から見た太陽と観測者のなす角）の計算に使う。
 * 単位は km、座標系は ECI を想定。
 */

import type { Vec3 } from './types.js';
import { RAD_TO_DEG } from './constants.js';

export function subtract(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

export function scale(v: Vec3, s: number): Vec3 {
  return { x: v.x * s, y: v.y * s, z: v.z * s };
}

export function dot(a: Vec3, b: Vec3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

export function magnitudeOf(v: Vec3): number {
  return Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
}

/**
 * 2つのベクトルのなす角[rad]を返す。
 *
 * acos は引数が ±1 をわずかに超えると NaN になるので、浮動小数点誤差対策で
 * 必ず clamp してから渡す。
 */
export function angleBetweenRad(a: Vec3, b: Vec3): number {
  const denom = magnitudeOf(a) * magnitudeOf(b);
  if (denom === 0) return 0;
  const cosTheta = Math.min(1, Math.max(-1, dot(a, b) / denom));
  return Math.acos(cosTheta);
}

/** 2つのベクトルのなす角[deg] */
export function angleBetweenDeg(a: Vec3, b: Vec3): number {
  return angleBetweenRad(a, b) * RAD_TO_DEG;
}

/** 値を [min, max] に収める */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
