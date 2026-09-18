/**
 * 時刻の変換ユーティリティ
 *
 * 本アプリの内部表現は一貫して「UTCのエポックミリ秒(number)」とする。
 * Date オブジェクトを引き回すと、実行環境のタイムゾーンに依存したバグが出るため。
 * 表示のときだけ JST に変換する。
 */

import { JST_OFFSET_MS, MS_PER_DAY } from './constants.js';

/**
 * JST での「時」を返す（0〜23）。
 *
 * 実行環境が UTC でも JST でも同じ結果になるよう、オフセットを足してから
 * UTC のゲッタを使う。`toLocaleString('ja-JP')` は環境依存なので使わない。
 */
export function jstHour(timeMs: number): number {
  return new Date(timeMs + JST_OFFSET_MS).getUTCHours();
}

/** JST での「分」を返す（0〜59） */
export function jstMinute(timeMs: number): number {
  return new Date(timeMs + JST_OFFSET_MS).getUTCMinutes();
}

/** JST での時刻を小数時間で返す（例: 19:42 → 19.7）。時間帯スコアの計算に使う */
export function jstHourDecimal(timeMs: number): number {
  const d = new Date(timeMs + JST_OFFSET_MS);
  return d.getUTCHours() + d.getUTCMinutes() / 60;
}

/** JST の年月日を返す */
export function jstDateParts(timeMs: number): {
  year: number;
  month: number;
  day: number;
} {
  const d = new Date(timeMs + JST_OFFSET_MS);
  return {
    year: d.getUTCFullYear(),
    month: d.getUTCMonth() + 1,
    day: d.getUTCDate(),
  };
}

/** JST の日付キー（"2026-09-18"）。日別グルーピングに使う */
export function jstDateKey(timeMs: number): string {
  const { year, month, day } = jstDateParts(timeMs);
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** JST の "19:42" 形式 */
export function formatJstTime(timeMs: number): string {
  return `${String(jstHour(timeMs)).padStart(2, '0')}:${String(jstMinute(timeMs)).padStart(2, '0')}`;
}

const WEEKDAY_JA = ['日', '月', '火', '水', '木', '金', '土'] as const;

/** JST の "9月18日(木)" 形式 */
export function formatJstDate(timeMs: number): string {
  const d = new Date(timeMs + JST_OFFSET_MS);
  const weekday = WEEKDAY_JA[d.getUTCDay()] ?? '';
  return `${d.getUTCMonth() + 1}月${d.getUTCDate()}日(${weekday})`;
}

/** JST の "9月18日(木) 19:42" 形式 */
export function formatJstDateTime(timeMs: number): string {
  return `${formatJstDate(timeMs)} ${formatJstTime(timeMs)}`;
}

/**
 * 「今夜」の時間窓を返す。
 *
 * 日付が変わっても同じ夜として扱えるよう、JSTの 12:00 を境界にする。
 * - 12:00〜23:59 に呼ばれたら「今日の日暮れ〜翌04:00」
 * - 00:00〜11:59 に呼ばれたら「昨日の日暮れ〜今日の04:00」＝まだ同じ夜
 *
 * 日没の正確な時刻ではなく 15:00 を窓の開始にしているのは、
 * パス自体が太陽高度でフィルタ済みだから。窓は粗くてよい。
 */
export function tonightWindow(nowMs: number): { startMs: number; endMs: number } {
  const hour = jstHour(nowMs);
  // JST 12時より前なら「昨夜からの続き」とみなして1日戻す
  const anchorMs = hour < 12 ? nowMs - MS_PER_DAY : nowMs;
  const anchor = new Date(anchorMs + JST_OFFSET_MS);

  const startJst = Date.UTC(
    anchor.getUTCFullYear(),
    anchor.getUTCMonth(),
    anchor.getUTCDate(),
    15, // JST 15:00
    0,
    0,
  );
  return {
    startMs: startJst - JST_OFFSET_MS,
    endMs: startJst - JST_OFFSET_MS + 13 * 3600_000, // 翌 JST 04:00 まで
  };
}

/** 経過時間を「3時間前」のような日本語にする。データ鮮度表示に使う */
export function formatRelativeJa(fromMs: number, nowMs: number): string {
  const diffMin = Math.floor((nowMs - fromMs) / 60000);
  if (diffMin < 1) return 'たった今';
  if (diffMin < 60) return `${diffMin}分前`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour}時間前`;
  return `${Math.floor(diffHour / 24)}日前`;
}
