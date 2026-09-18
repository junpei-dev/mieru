/**
 * 結論ヒーロー — アプリを開いて最初に目に入る領域
 *
 * このアプリの価値のほぼ全部がここにある。
 * 「今夜見えるか」に0.5秒で答えることが目的で、細かい数字は下に押しやる。
 *
 * 「見えない」と言うときは必ず ①理由 ②次のチャンス をセットで出す。
 * 理由がないと不信になり、次がないと離脱する。
 */

import { Link } from 'react-router';
import {
  azimuthToCompass8Ja,
  describeMagnitudeJa,
  shortSatelliteNameJa,
  formatJstDate,
  formatJstTime,
  formatDurationJa,
  type ScoredPass,
} from '@mieru/core';

interface VerdictHeroProps {
  /** 今夜の最有力パス。今夜パスが無ければ null */
  tonight: ScoredPass | null;
  /** 今夜ダメなときに案内する次の好機 */
  nextChance: ScoredPass | null;
  threshold: number;
}

/** 「9月20日(土) 19:05」の形で次の機会を示す */
function NextChance({ pass }: { pass: ScoredPass | null }) {
  if (!pass) {
    return (
      <p className="mt-3 text-[13px] leading-relaxed text-[var(--color-ink-faint)]">
        今後7日間に好条件のパスはありません。
        <br />
        ISSの可視期間は約2か月ごとにまとまって訪れます。
      </p>
    );
  }
  return (
    <Link
      to={`/pass/${encodeURIComponent(pass.pass.id)}`}
      className="tap mt-3 inline-flex items-center gap-2 text-[13px] text-[var(--color-ink-sub)] underline decoration-[var(--color-edge-strong)] underline-offset-4"
    >
      次のチャンスは
      <span className="tnum text-[var(--color-accent)]">
        {formatJstDate(pass.pass.culmination.timeMs)}{' '}
        {formatJstTime(pass.pass.start.timeMs)}
      </span>
    </Link>
  );
}

export function VerdictHero({
  tonight,
  nextChance,
  threshold,
}: VerdictHeroProps) {
  // ── 状態3: 今夜そもそもパスがない ──
  if (!tonight) {
    return (
      <section className="card animate-fade-up p-6">
        <h1 className="text-[22px] font-bold text-[var(--color-muted)]">
          今夜は通過しません
        </h1>
        <p className="mt-2 text-[13px] leading-relaxed text-[var(--color-ink-sub)]">
          ISSは今夜、この場所の空に見える形では通りません。
        </p>
        <NextChance pass={nextChance} />
      </section>
    );
  }

  const { pass, weather, score } = tonight;
  const visible = score.total >= threshold && score.weatherKnown;

  // 地平線に沈む前に影に入って消える場合、その時刻を求める。
  // 最後まで光ったまま沈むパスでは null。
  const shadowExitMs = (() => {
    const lastIndex = pass.track.length - 1;
    if (lastIndex < 1) return null;
    if (pass.track[lastIndex]?.illumination.state !== 'umbra') return null;
    for (let i = 1; i <= lastIndex; i += 1) {
      if (
        pass.track[i]?.illumination.state === 'umbra' &&
        pass.track[i - 1]?.illumination.state !== 'umbra'
      ) {
        return pass.track[i]?.timeMs ?? null;
      }
    }
    return null;
  })();

  // ── 状態1: 見える ──
  if (visible) {
    return (
      <section className="card glow-accent animate-fade-up border-[rgba(255,196,107,0.28)] p-6">
        <div className="flex items-center gap-2">
          <span
            className="inline-block h-2 w-2 rounded-full bg-[var(--color-accent)]"
            style={{ animation: 'twinkle 2s ease-in-out infinite' }}
          />
          <span className="text-[11px] font-semibold tracking-[0.18em] text-[var(--color-accent)]">
            今夜のチャンス
          </span>
        </div>

        {/* どの衛星かを必ず出す。ISSとBlueBirdでは見え方も明るさも違う */}
        <h1 className="mt-2 text-[26px] font-bold text-[var(--color-accent)]">
          今夜は{shortSatelliteNameJa(pass.satelliteName)}が見えます
        </h1>
        <p className="mt-0.5 text-[11.5px] text-[var(--color-ink-faint)]">
          {pass.satelliteName}
        </p>

        <div className="mt-4 flex items-baseline gap-3">
          <span className="tnum text-[44px] leading-none font-bold tracking-tight">
            {formatJstTime(pass.start.timeMs)}
          </span>
          <span className="text-[19px] font-semibold text-[var(--color-ink)]">
            {azimuthToCompass8Ja(pass.start.azimuthDeg)}の空
          </span>
        </div>

        <p className="mt-3 text-[13px] leading-relaxed text-[var(--color-ink-sub)]">
          最大 {Math.round(pass.culmination.elevationDeg)}° ·{' '}
          {pass.peakMagnitude.toFixed(1)}等（
          {describeMagnitudeJa(pass.peakMagnitude)}） ·{' '}
          {formatDurationJa(pass.visibleDurationSec)}見えます
          {weather ? ` · 雲量 ${Math.round(weather.cloudTotalPct)}%` : ''}
        </p>

        <p className="mt-4 rounded-xl border border-[var(--color-edge)] bg-[rgba(255,196,107,0.05)] p-3 text-[12.5px] leading-relaxed text-[var(--color-ink-sub)]">
          ゆっくり動く明るい星のように見えます。
          <br />
          点滅する光は飛行機なので別物です。
          {/*
            ISS が途中で地球の影に入って消えるパスは多い。
            これを予告しておかないと「雲に隠れた」「見失った」と誤解される。
          */}
          {shadowExitMs !== null && (
            <>
              <br />
              <span className="text-[var(--color-ink-faint)]">
                <span className="tnum">{formatJstTime(shadowExitMs)}</span>
                ごろ地球の影に入り、そこでフッと消えます。
              </span>
            </>
          )}
        </p>
      </section>
    );
  }

  // ── 状態2: パスはあるが見込みが薄い ──
  return (
    <section className="card animate-fade-up p-6">
      <h1 className="text-[22px] font-bold text-[var(--color-muted)]">
        今夜は見られません
      </h1>

      <p className="mt-2 text-[13.5px] leading-relaxed text-[var(--color-ink-sub)]">
        {score.reasonJa}
      </p>

      <div className="mt-4 flex items-center gap-2 text-[12px] text-[var(--color-ink-faint)]">
        <span className="tnum">{formatJstTime(pass.start.timeMs)}</span>
        <span>に通過しますが</span>
        <span className="tnum">{score.total}点</span>
        <span>（しきい値 {threshold}点）</span>
      </div>

      <NextChance pass={nextChance} />
    </section>
  );
}
