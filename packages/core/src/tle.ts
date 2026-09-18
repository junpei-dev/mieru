/**
 * 軌道要素（TLE / GP）の取得と検証 — CelesTrak クライアント
 *
 * CelesTrak には利用上の約束があり、同じデータを2時間に1回以上取ってはいけない。
 * 本アプリは1日1回だけ取得し、結果を自前のJSONにミラーする。
 * ブラウザから直接 CelesTrak を叩くことはしない（人数分アクセスしてしまうため）。
 *
 * TLE は「元期(epoch)」という基準時刻を持ち、そこから離れるほど誤差が増える。
 * ISS は大気抵抗を受けて軌道が変化するので、1週間以上古い TLE は使わない（FR-7.2）。
 */

import { json2satrec } from 'satellite.js';
import type { OMMJsonObject, SatRec } from 'satellite.js';
import { MAX_TLE_AGE_DAYS, MS_PER_DAY } from './constants.js';

const CELESTRAK_GP_ENDPOINT = 'https://celestrak.org/NORAD/elements/gp.php';

/** 元期付きの軌道要素 */
export interface OrbitalElements {
  noradId: string;
  objectName: string;
  /** TLE の元期（UTCエポックms）。ここからの経過日数が誤差に直結する */
  epochMs: number;
  satrec: SatRec;
  /** 元のOMM。JSONミラーに保存して再利用する */
  omm: OMMJsonObject;
}

export class TleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TleError';
  }
}

/**
 * OMM JSON（CelesTrak の FORMAT=json）を SatRec に変換する。
 *
 * TLEテキストではなく OMM JSON を使う理由：
 *   TLE の2行形式は桁が固定で、名前が24文字を超えると壊れる。
 *   JSON なら曖昧さがなく、そのままミラーとして保存できる。
 */
export function parseOmm(omm: OMMJsonObject): OrbitalElements {
  const epochMs = Date.parse(
    // CelesTrak の EPOCH はタイムゾーン指定がないUTC表記なので Z を補う
    omm.EPOCH.endsWith('Z') ? omm.EPOCH : `${omm.EPOCH}Z`,
  );
  if (Number.isNaN(epochMs)) {
    throw new TleError(`元期を解釈できません: ${omm.EPOCH}`);
  }

  const satrec = json2satrec(omm);
  return {
    noradId: String(omm.NORAD_CAT_ID),
    objectName: omm.OBJECT_NAME,
    epochMs,
    satrec,
    omm,
  };
}

/**
 * 軌道要素が計算に使えるほど新しいかを判定する。
 *
 * 古い TLE を黙って使うと、誤差が数十kmに膨らみ、方角が数度ずれる。
 * ユーザーは間違った方角を見上げることになるので、静かに失敗させてはいけない。
 */
export function isFresh(
  elements: OrbitalElements,
  nowMs: number = Date.now(),
  maxAgeDays: number = MAX_TLE_AGE_DAYS,
): boolean {
  return Math.abs(nowMs - elements.epochMs) <= maxAgeDays * MS_PER_DAY;
}

/** 元期からの経過日数 */
export function ageInDays(
  elements: OrbitalElements,
  nowMs: number = Date.now(),
): number {
  return (nowMs - elements.epochMs) / MS_PER_DAY;
}

/**
 * CelesTrak から指定 NORAD ID の軌道要素を取得する。
 *
 * @param fetchImpl テスト時に差し替えるための fetch 実装
 */
export async function fetchElements(
  noradId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<OrbitalElements> {
  const url = `${CELESTRAK_GP_ENDPOINT}?CATNR=${encodeURIComponent(noradId)}&FORMAT=json`;
  const response = await fetchImpl(url);
  if (!response.ok) {
    throw new TleError(
      `CelesTrak から取得できませんでした (HTTP ${response.status})`,
    );
  }

  const data: unknown = await response.json();
  if (!Array.isArray(data) || data.length === 0) {
    throw new TleError(`NORAD ${noradId} の軌道要素が見つかりません`);
  }

  return parseOmm(data[0] as OMMJsonObject);
}

/**
 * CelesTrak から名前でまとめて軌道要素を取得する。
 *
 * BlueBird（SPACEMOBILE-NNN）のように機数が増減するシリーズ用。
 * 12機を CATNR で個別に取りに行くと12回アクセスすることになるので、
 * 1回の名前検索でまとめて受け取る（CelesTrak の利用規約への配慮）。
 *
 * 該当が無い場合は空配列を返す（例外にしない）。
 * シリーズがカタログ名を変えることは実際に起こりうるが、
 * それで予報全体を止めるべきではないため。
 */
export async function fetchElementsByName(
  name: string,
  fetchImpl: typeof fetch = fetch,
): Promise<OrbitalElements[]> {
  const url = `${CELESTRAK_GP_ENDPOINT}?NAME=${encodeURIComponent(name)}&FORMAT=json`;
  const response = await fetchImpl(url);
  if (!response.ok) {
    throw new TleError(
      `CelesTrak から取得できませんでした (HTTP ${response.status})`,
    );
  }

  // 該当が無いとき CelesTrak は JSON ではなく "No GP data found" という
  // プレーンテキストを返す。JSON.parse させると例外になるので先に本文で判定する
  const text = await response.text();
  if (!text.trimStart().startsWith('[')) return [];

  const data: unknown = JSON.parse(text);
  if (!Array.isArray(data)) return [];

  return data.map((omm) => parseOmm(omm as OMMJsonObject));
}

/** ミラーJSONの形式。/data/tle/tracked.json に保存する */
export interface TleMirror {
  schemaVersion: number;
  fetchedAtMs: number;
  elements: OMMJsonObject[];
}

/** ミラーJSONから軌道要素を復元する */
export function fromMirror(mirror: TleMirror): OrbitalElements[] {
  return mirror.elements.map(parseOmm);
}
