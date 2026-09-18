/**
 * 画面の骨組み
 *
 * 屋外・片手・暗所での操作を想定して、操作系は下部に集める。
 * 上部には「今どこの予報を見ているか」と「データの鮮度」だけを置く。
 */

import { NavLink, Route, Routes } from 'react-router';
import { formatRelativeJa } from '@mieru/core';
import { useApp } from './AppContext.js';
import { Tonight } from './routes/Tonight.js';
import { Forecast } from './routes/Forecast.js';
import { PassDetail } from './routes/PassDetail.js';
import { Settings } from './routes/Settings.js';

const NAV = [
  { to: '/', label: '今夜', end: true },
  { to: '/forecast', label: '7日間', end: false },
  { to: '/settings', label: '設定', end: false },
];

function Header() {
  const { site, document, source, loading } = useApp();

  return (
    <header className="safe-top sticky top-0 z-10 border-b border-[var(--color-edge)] bg-[rgba(5,7,13,0.82)] px-5 pb-3 backdrop-blur-xl">
      <div className="mx-auto flex max-w-lg items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-[15px] font-semibold">{site.name}</p>
          <p className="text-[10.5px] text-[var(--color-ink-faint)]">
            {loading
              ? '計算中…'
              : document
                ? `${formatRelativeJa(document.generatedAtMs, Date.now())}に更新` +
                  (source === 'local' ? '（端末で計算）' : '')
                : 'データなし'}
          </p>
        </div>
        <span className="shrink-0 text-[10px] tracking-[0.2em] text-[var(--color-ink-faint)]">
          ISS
        </span>
      </div>
    </header>
  );
}

function BottomNav() {
  return (
    <nav className="safe-bottom sticky bottom-0 z-10 border-t border-[var(--color-edge)] bg-[rgba(5,7,13,0.9)] px-5 pt-2 backdrop-blur-xl">
      <div className="mx-auto flex max-w-lg gap-1">
        {NAV.map(({ to, label, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              `tap flex flex-1 items-center justify-center rounded-xl py-2 text-[13px] font-medium transition-colors ${
                isActive
                  ? 'bg-[var(--color-surface-strong)] text-[var(--color-accent)]'
                  : 'text-[var(--color-ink-faint)]'
              }`
            }
          >
            {label}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}

export function App() {
  return (
    <div className="flex min-h-[100dvh] flex-col">
      <Header />
      <main className="mx-auto w-full max-w-lg flex-1 px-5 py-5">
        <Routes>
          <Route path="/" element={<Tonight />} />
          <Route path="/forecast" element={<Forecast />} />
          <Route path="/pass/:passId" element={<PassDetail />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="*" element={<Tonight />} />
        </Routes>
      </main>
      <BottomNav />
    </div>
  );
}
