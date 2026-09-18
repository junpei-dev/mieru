/**
 * スコアバー
 *
 * 色だけで良し悪しを伝えると、色覚特性によっては読めない。
 * 必ず数値を併記する（NFR-10）。
 */

import { factorLabelJa, type PassScore } from '@mieru/core';

const VERDICT_COLOR: Record<string, string> = {
  excellent: 'var(--color-accent)',
  good: '#A3C4E8',
  marginal: '#7C8AA3',
  poor: 'var(--color-muted)',
};

export function ScoreBar({ score }: { score: PassScore }) {
  const color = VERDICT_COLOR[score.verdict] ?? 'var(--color-muted)';
  return (
    <div className="flex items-center gap-2">
      <div
        className="h-1.5 flex-1 overflow-hidden rounded-full bg-[rgba(255,255,255,0.07)]"
        role="meter"
        aria-valuenow={score.total}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="観測しやすさ"
      >
        <div
          className="h-full rounded-full transition-[width] duration-700 ease-out"
          style={{ width: `${score.total}%`, background: color }}
        />
      </div>
      <span
        className="tnum w-9 text-right text-[12px] font-semibold"
        style={{ color }}
      >
        {score.total}
      </span>
    </div>
  );
}

/** スコアの内訳。何が足を引っ張っているかを見せる（FR-4.3） */
export function ScoreBreakdown({ score }: { score: PassScore }) {
  const entries = Object.entries(score.factors) as [
    keyof PassScore['factors'],
    number,
  ][];

  return (
    <dl className="grid grid-cols-2 gap-x-4 gap-y-2.5">
      {entries.map(([key, value]) => {
        const isLimiting = key === score.limitingFactor;
        const unknown = key === 'cloud' && !score.weatherKnown;
        return (
          <div key={key} className="flex items-center gap-2">
            <dt
              className={`w-16 shrink-0 text-[11.5px] ${
                isLimiting
                  ? 'font-semibold text-[var(--color-warn)]'
                  : 'text-[var(--color-ink-faint)]'
              }`}
            >
              {factorLabelJa(key)}
            </dt>
            <dd className="flex flex-1 items-center gap-1.5">
              <div className="h-1 flex-1 overflow-hidden rounded-full bg-[rgba(255,255,255,0.06)]">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${Math.round(value * 100)}%`,
                    background: isLimiting
                      ? 'var(--color-warn)'
                      : 'var(--color-ink-faint)',
                  }}
                />
              </div>
              <span className="tnum w-7 text-right text-[10.5px] text-[var(--color-ink-faint)]">
                {unknown ? '—' : Math.round(value * 100)}
              </span>
            </dd>
          </div>
        );
      })}
    </dl>
  );
}
