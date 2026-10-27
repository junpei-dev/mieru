/**
 * 衛星の背景情報カード
 *
 * 空の光る点を「意味のあるもの」に変えるための領域。
 * 既定では畳んでおき、興味を持った人だけが開く。
 * 「今夜見えるか」を知りたいだけの人の邪魔をしないため。
 */

import { useState } from 'react';
import { profileForDisplayName, shortSatelliteNameJa } from '@mieru/core';

interface Props {
  satelliteName: string;
  /** 既定で開いた状態にするか（詳細画面では開いておく） */
  defaultOpen?: boolean;
}

/** 仕様の1行。ラベルと値を縦に並べる */
function SpecRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-t border-[var(--color-edge)] py-2.5 first:border-t-0 first:pt-0">
      <dt className="text-[12px] tracking-wide text-[var(--color-ink-faint)]">
        {label}
      </dt>
      <dd className="mt-1 text-[13.5px] leading-relaxed text-[var(--color-ink)]">
        {value}
      </dd>
    </div>
  );
}

export function SatelliteBackground({ satelliteName, defaultOpen = false }: Props) {
  const [open, setOpen] = useState(defaultOpen);
  const profile = profileForDisplayName(satelliteName);
  if (!profile) return null;

  const shortName = shortSatelliteNameJa(satelliteName);

  return (
    <section className="card overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="tap flex w-full items-start gap-3 p-5 text-left"
      >
        <span className="mt-0.5 shrink-0 text-[15px]" aria-hidden="true">
          🛰
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[12px] tracking-wide text-[var(--color-ink-faint)]">
            {shortName}とは
          </span>
          <span className="mt-0.5 block text-[14.5px] leading-snug font-semibold text-[var(--color-ink)]">
            {profile.headline}
          </span>
        </span>
        <span
          className={`mt-1 shrink-0 text-[12px] text-[var(--color-ink-faint)] transition-transform ${
            open ? 'rotate-180' : ''
          }`}
          aria-hidden="true"
        >
          ▼
        </span>
      </button>

      {open && (
        <div className="animate-fade-up border-t border-[var(--color-edge)] px-5 pt-4 pb-5">
          <h3 className="text-[12px] font-semibold tracking-wide text-[var(--color-accent)]">
            何のために飛んでいるのか
          </h3>
          <ul className="mt-2 space-y-2">
            {profile.purpose.map((item) => (
              <li
                key={item}
                className="flex gap-2 text-[13.5px] leading-relaxed text-[var(--color-ink-sub)]"
              >
                <span
                  className="mt-[7px] h-[3px] w-[3px] shrink-0 rounded-full bg-[var(--color-orbit)]"
                  aria-hidden="true"
                />
                <span>{item}</span>
              </li>
            ))}
          </ul>

          <dl className="mt-4">
            <SpecRow label="運用" value={profile.operator} />
            <SpecRow label="いつから" value={profile.since} />
            <SpecRow label="大きさ" value={profile.size} />
            <SpecRow label="軌道" value={profile.orbit} />
          </dl>

          <div className="mt-4 rounded-xl border border-[rgba(125,211,252,0.2)] bg-[rgba(125,211,252,0.05)] p-3.5">
            <p className="text-[12px] font-semibold tracking-wide text-[var(--color-orbit)]">
              見上げる前に
            </p>
            <p className="mt-1.5 text-[13.5px] leading-relaxed text-[var(--color-ink-sub)]">
              {profile.trivia}
            </p>
          </div>

          {profile.discussion && (
            <div className="mt-3 rounded-xl border border-[var(--color-edge)] p-3.5">
              <p className="text-[12px] font-semibold tracking-wide text-[var(--color-ink-faint)]">
                考えてみる
              </p>
              <p className="mt-1.5 text-[13.5px] leading-relaxed text-[var(--color-ink-faint)]">
                {profile.discussion}
              </p>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
