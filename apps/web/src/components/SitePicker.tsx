/**
 * 観測地点の選択 — 地方 → 都道府県 → 市区町村 の3段階
 *
 * ネイティブの <select> を使わない理由：
 *   ドロップダウンの選択肢リストは OS / ブラウザが描画するため、
 *   ページ側の CSS（フォント・文字色・背景色）が一切効かない。
 *   暗い画面の中で選択肢だけ白背景・細字になり、非常に読みにくくなる。
 *   全部を自前で描けば、暗所で読める配色とタップしやすい大きさを保証できる。
 */

import { useState } from 'react';
import {
  REGIONS,
  prefecturesInRegion,
  sitesInPrefecture,
  type ObserverSite,
  type RegionName,
} from '@mieru/core';

interface SitePickerProps {
  current: ObserverSite;
  onSelect: (siteId: string) => void;
}

/** 選択状態を表すチップ。タップ領域は44px以上を確保する */
function Chip({
  label,
  active,
  onClick,
  size = 'md',
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  size?: 'sm' | 'md';
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-full border transition-colors ${
        size === 'sm'
          ? 'px-3 py-1.5 text-[12px]'
          : 'px-3.5 py-2 text-[12.5px]'
      } ${
        active
          ? 'border-[var(--color-accent)] bg-[rgba(255,196,107,0.13)] font-semibold text-[var(--color-accent)]'
          : 'border-[var(--color-edge)] text-[var(--color-ink-sub)] active:bg-[var(--color-surface-strong)]'
      }`}
    >
      {label}
    </button>
  );
}

export function SitePicker({ current, onSelect }: SitePickerProps) {
  // 現在の地点が属する地方・県を初期表示にする。探し直す手間を省く
  const [region, setRegion] = useState<RegionName>(current.region);
  const [prefecture, setPrefecture] = useState<string>(current.prefecture);

  const prefectures = prefecturesInRegion(region);
  // 地方を切り替えたとき、前の県が残っていたら先頭の県に寄せる
  const activePrefecture = prefectures.includes(prefecture)
    ? prefecture
    : (prefectures[0] ?? prefecture);
  const cities = sitesInPrefecture(activePrefecture);

  return (
    <div className="space-y-4">
      {/* ── 地方 ── */}
      <div>
        <p className="mb-2 text-[11px] font-semibold tracking-wide text-[var(--color-ink-faint)]">
          地方
        </p>
        <div className="flex flex-wrap gap-1.5">
          {REGIONS.map((name) => (
            <Chip
              key={name}
              label={name}
              size="sm"
              active={name === region}
              onClick={() => {
                setRegion(name);
                const first = prefecturesInRegion(name)[0];
                if (first) setPrefecture(first);
              }}
            />
          ))}
        </div>
      </div>

      {/* ── 都道府県 ── */}
      <div>
        <p className="mb-2 text-[11px] font-semibold tracking-wide text-[var(--color-ink-faint)]">
          都道府県
        </p>
        <div className="flex flex-wrap gap-1.5">
          {prefectures.map((name) => (
            <Chip
              key={name}
              label={name}
              size="sm"
              active={name === activePrefecture}
              onClick={() => setPrefecture(name)}
            />
          ))}
        </div>
      </div>

      {/* ── 市区町村 ── */}
      <div>
        <p className="mb-2 text-[11px] font-semibold tracking-wide text-[var(--color-ink-faint)]">
          {activePrefecture}の市区町村
        </p>
        <div className="flex flex-wrap gap-1.5">
          {cities.map((site) => (
            <Chip
              key={site.id}
              label={site.city}
              active={site.id === current.id}
              onClick={() => onSelect(site.id)}
            />
          ))}
        </div>
        {cities.length <= 1 && (
          <p className="mt-2 text-[11px] leading-relaxed text-[var(--color-ink-faint)]">
            この県は県庁所在地のみ登録しています。
            近隣の市でも ISS の見え方はほとんど変わりません。
          </p>
        )}
      </div>
    </div>
  );
}
