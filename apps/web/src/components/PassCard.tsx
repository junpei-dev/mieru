/**
 * パス1件のカード。7日間一覧で使う。
 */

import { Link } from 'react-router';
import {
  azimuthToCompass8Ja,
  describePathJa,
  formatDurationJa,
  formatJstTime,
  type ScoredPass,
} from '@mieru/core';
import { ScoreBar } from './ScoreBar.js';

export function PassCard({
  scored,
  threshold,
}: {
  scored: ScoredPass;
  threshold: number;
}) {
  const { pass, weather, score } = scored;
  const notable = score.total >= threshold && score.weatherKnown;

  return (
    <Link
      to={`/pass/${encodeURIComponent(pass.id)}`}
      className={`card block p-4 transition-colors active:bg-[var(--color-surface-strong)] ${
        notable ? 'border-[rgba(255,196,107,0.24)]' : ''
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-baseline gap-2">
            <span className="tnum text-[21px] font-bold">
              {formatJstTime(pass.start.timeMs)}
            </span>
            <span className="text-[12px] text-[var(--color-ink-faint)]">
              〜{formatJstTime(pass.end.timeMs)}
            </span>
            {notable && (
              <span className="rounded-full bg-[rgba(255,196,107,0.14)] px-2 py-0.5 text-[10px] font-semibold text-[var(--color-accent)]">
                好条件
              </span>
            )}
          </div>

          <p className="mt-1 truncate text-[12.5px] text-[var(--color-ink-sub)]">
            {describePathJa(
              pass.start.azimuthDeg,
              pass.culmination.azimuthDeg,
              pass.culmination.elevationDeg,
              pass.end.azimuthDeg,
            )}
          </p>

          <p className="tnum mt-1 text-[11.5px] text-[var(--color-ink-faint)]">
            最大 {Math.round(pass.culmination.elevationDeg)}° ·{' '}
            {pass.peakMagnitude.toFixed(1)}等 ·{' '}
            {formatDurationJa(pass.visibleDurationSec)}見える
            {weather
              ? ` · 雲 ${Math.round(weather.cloudTotalPct)}%`
              : ' · 天気不明'}
          </p>
        </div>

        {/* 見る方角を大きく出す。屋外で一番知りたい情報 */}
        <div className="shrink-0 text-right">
          <div className="text-[19px] font-bold text-[var(--color-ink)]">
            {azimuthToCompass8Ja(pass.start.azimuthDeg)}
          </div>
          <div className="text-[10px] text-[var(--color-ink-faint)]">
            から出現
          </div>
        </div>
      </div>

      <div className="mt-3">
        <ScoreBar score={score} />
      </div>
    </Link>
  );
}
