/**
 * 時刻まわりのテスト
 *
 * 「今夜」の範囲を間違えると、見えるパスを丸ごと取りこぼす。
 * 実際に起きた不具合を回帰テストとして固定する。
 */

import { describe, expect, it } from 'vitest';
import { formatJstTime, jstDateKey, jstHour, tonightWindow } from '../src/time.js';

/** JSTの時刻から UTC エポックmsを作る（テストを読みやすくするため） */
function jst(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute = 0,
): number {
  return Date.UTC(year, month - 1, day, hour, minute) - 9 * 3600_000;
}

describe('JSTの基本変換', () => {
  it('実行環境のタイムゾーンに依存しない', () => {
    expect(jstHour(jst(2026, 10, 28, 5, 13))).toBe(5);
    expect(formatJstTime(jst(2026, 10, 28, 5, 13))).toBe('05:13');
    expect(jstDateKey(jst(2026, 10, 28, 5, 13))).toBe('2026-10-28');
  });
});

describe('tonightWindow', () => {
  it('朝に呼ぶと「これから来る夜」を返す', () => {
    // 【回帰】予告通知は毎朝10:07(JST)に走る。
    // 以前は境界が12時だったため、ここで「昨日15:00〜今日04:00」という
    // 既に終わった時間帯が返り、予告通知が構造的に一度も出なかった。
    const now = jst(2026, 10, 27, 10, 7);
    const { startMs, endMs } = tonightWindow(now);

    expect(startMs).toBeGreaterThan(now); // これから始まる
    expect(jstDateKey(startMs)).toBe('2026-10-27');
    expect(jstHour(startMs)).toBe(15);
    expect(jstDateKey(endMs)).toBe('2026-10-28');
  });

  it('深夜〜早朝に呼ぶと「昨夜からの続き」を返す', () => {
    const now = jst(2026, 10, 28, 3, 0);
    const { startMs, endMs } = tonightWindow(now);

    expect(startMs).toBeLessThan(now);
    expect(endMs).toBeGreaterThan(now); // まだ同じ夜の中にいる
    expect(jstDateKey(startMs)).toBe('2026-10-27');
  });

  it('翌朝の早朝パスを取りこぼさない', () => {
    // 【回帰】ISSの可視期間は夕方と早朝が入れ替わる。
    // 窓が翌04:00までだと、05:13のような早朝パスが丸ごと外れていた。
    const now = jst(2026, 10, 27, 20, 0);
    const { startMs, endMs } = tonightWindow(now);

    const dawnPass = jst(2026, 10, 28, 5, 13);
    expect(dawnPass).toBeGreaterThanOrEqual(startMs);
    expect(dawnPass).toBeLessThanOrEqual(endMs);

    // 06時台のパスも含む（冬はまだ暗い）
    const latePass = jst(2026, 10, 28, 6, 4);
    expect(latePass).toBeLessThanOrEqual(endMs);
  });

  it('夕方に呼んでも同じ夜を指す', () => {
    const evening = tonightWindow(jst(2026, 10, 27, 18, 0));
    const night = tonightWindow(jst(2026, 10, 28, 2, 0));
    expect(evening.startMs).toBe(night.startMs);
  });
});
