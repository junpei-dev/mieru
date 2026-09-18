/**
 * 天気ストリップ
 *
 * 雲は「全体で何%」より「どの高さにあるか」が効く。
 * 下層雲は完全に遮り、上層の巻雲は明るい衛星なら透ける。
 * スコアもその通りに計算しているので、UIでも層別に見せて納得感を合わせる。
 */

import { describeCloudJa, type WeatherSnapshot } from '@mieru/core';

const LAYERS = [
  { key: 'cloudLowPct', label: '下層雲', note: '完全に遮る' },
  { key: 'cloudMidPct', label: '中層雲', note: 'かなり遮る' },
  { key: 'cloudHighPct', label: '上層雲', note: '薄ければ透ける' },
] as const;

export function WeatherStrip({ weather }: { weather: WeatherSnapshot | null }) {
  if (!weather) {
    return (
      <div className="card p-4">
        <p className="text-[12.5px] text-[var(--color-ink-faint)]">
          天気の情報を取得できませんでした。
          <br />
          このため見えるかどうかの判断はできず、通知も送られません。
        </p>
      </div>
    );
  }

  return (
    <div className="card p-4">
      <div className="flex items-baseline justify-between">
        <h3 className="text-[12px] font-semibold tracking-wide text-[var(--color-ink-sub)]">
          通過時刻の空
        </h3>
        <span className="text-[13px] font-semibold text-[var(--color-ink)]">
          {describeCloudJa(weather.cloudTotalPct)}
          <span className="tnum ml-1.5 text-[var(--color-ink-faint)]">
            {Math.round(weather.cloudTotalPct)}%
          </span>
        </span>
      </div>

      <div className="mt-3 space-y-2">
        {LAYERS.map(({ key, label, note }) => {
          const value = Math.round(weather[key]);
          return (
            <div key={key} className="flex items-center gap-2.5">
              <span className="w-12 shrink-0 text-[11px] text-[var(--color-ink-faint)]">
                {label}
              </span>
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[rgba(255,255,255,0.06)]">
                <div
                  className="h-full rounded-full bg-[var(--color-ink-faint)]"
                  style={{ width: `${value}%` }}
                />
              </div>
              <span className="tnum w-9 text-right text-[11px] text-[var(--color-ink-sub)]">
                {value}%
              </span>
              <span className="hidden w-20 text-[10px] text-[var(--color-ink-faint)] sm:block">
                {note}
              </span>
            </div>
          );
        })}
      </div>

      {weather.visibilityM !== null && (
        <p className="tnum mt-3 text-[11px] text-[var(--color-ink-faint)]">
          視程 {(weather.visibilityM / 1000).toFixed(0)}km
          {weather.precipitationProbabilityPct !== null &&
            ` · 降水確率 ${weather.precipitationProbabilityPct}%`}
        </p>
      )}
    </div>
  );
}
