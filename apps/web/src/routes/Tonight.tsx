/**
 * 今夜 — 起動して最初に開く画面
 *
 * 上から順に「結論 → 経路 → 天気」。
 * 結論だけ読んで閉じる人が大半という前提で組む。
 */

import { Link } from 'react-router';
import {
  nextNotworthyPass,
  passesTonight,
  tonightHighlight,
} from '@mieru/core';
import { useApp } from '../AppContext.js';
import { VerdictHero } from '../components/VerdictHero.js';
import { SkyMap } from '../components/SkyMap.js';
import { WeatherStrip } from '../components/WeatherStrip.js';
import { PassCard } from '../components/PassCard.js';
import { Loading, ErrorPanel } from '../components/States.js';

export function Tonight() {
  const { document, loading, error, threshold } = useApp();

  if (loading) return <Loading />;
  if (error || !document) return <ErrorPanel message={error} />;

  const passes = document.scoredPasses;
  const now = Date.now();
  const highlight = tonightHighlight(passes, now);
  const nextChance = nextNotworthyPass(passes, now, threshold);
  const others = passesTonight(passes, now).filter(
    (p) => p.pass.id !== highlight?.pass.id && p.pass.end.timeMs > now,
  );

  return (
    <div className="space-y-4">
      <VerdictHero
        tonight={highlight}
        nextChance={nextChance}
        threshold={threshold}
      />

      {highlight && (
        <>
          <section className="card flex flex-col items-center px-4 py-5">
            <SkyMap pass={highlight.pass} size={320} />
            <p className="mt-2 text-center text-[11.5px] leading-relaxed text-[var(--color-ink-faint)]">
              外周の円が地平線、中心が真上です。
              <br />
              点線の区間は地球の影に入って見えなくなります。
            </p>
            <Link
              to={`/pass/${encodeURIComponent(highlight.pass.id)}`}
              className="tap mt-3 rounded-full border border-[var(--color-edge-strong)] px-5 py-2 text-[13px] font-medium"
            >
              詳しく見る
            </Link>
          </section>

          <WeatherStrip weather={highlight.weather} />
        </>
      )}

      {others.length > 0 && (
        <section>
          <h2 className="mb-2 px-1 text-[12px] font-semibold tracking-wide text-[var(--color-ink-sub)]">
            今夜のその他の通過
          </h2>
          <div className="space-y-2.5">
            {others.map((scored) => (
              <PassCard
                key={scored.pass.id}
                scored={scored}
                threshold={threshold}
              />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
