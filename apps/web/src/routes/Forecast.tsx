/**
 * 7日間 — 予報の一覧
 *
 * 日付でまとめ、各日のなかは時刻順。
 * 深夜1時のパスは「前日の夜」に含める（core の groupByJstDate がその扱い）。
 */

import { formatJstDate, groupByJstDate } from '@mieru/core';
import { useApp } from '../AppContext.js';
import { PassCard } from '../components/PassCard.js';
import { Loading, ErrorPanel, EmptyPasses } from '../components/States.js';

export function Forecast() {
  const { document, loading, error, threshold } = useApp();

  if (loading) return <Loading />;
  if (error || !document) return <ErrorPanel message={error} />;

  const groups = groupByJstDate(document.scoredPasses);
  if (groups.length === 0) return <EmptyPasses />;

  return (
    <div className="space-y-6">
      {groups.map((group) => {
        const first = group.passes[0];
        if (!first) return null;
        return (
          <section key={group.dateKey}>
            <h2 className="mb-2 flex items-baseline gap-2 px-1">
              <span className="text-[14px] font-bold">
                {formatJstDate(first.pass.culmination.timeMs)}
              </span>
              <span className="text-[11px] text-[var(--color-ink-faint)]">
                {group.passes.length}回
              </span>
            </h2>
            <div className="space-y-2.5">
              {group.passes.map((scored) => (
                <PassCard
                  key={scored.pass.id}
                  scored={scored}
                  threshold={threshold}
                />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
