/**
 * 設定 — 地点・しきい値・LINE連携
 *
 * 位置情報は端末の localStorage にしか置かない。
 * 予報は市区町村単位で計算するので、個人宅の座標をサーバに送る必要がそもそもない。
 */

import { useState } from 'react';
import { findNearestSite, NOTIFY_SCORE_THRESHOLD } from '@mieru/core';
import { useApp } from '../AppContext.js';
import { SitePicker } from '../components/SitePicker.js';

const THRESHOLDS = [
  { value: 85, label: '厳選', note: 'かなり良い日だけ' },
  { value: NOTIFY_SCORE_THRESHOLD, label: '標準', note: '見える日に通知' },
  { value: 55, label: '多め', note: '可能性があれば通知' },
];

export function Settings() {
  const { site, setSiteId, threshold, setThreshold, source } = useApp();
  const [locating, setLocating] = useState(false);
  const [locateError, setLocateError] = useState<string | null>(null);

  const useCurrentLocation = () => {
    if (!navigator.geolocation) {
      setLocateError('この端末では現在地を取得できません');
      return;
    }
    setLocating(true);
    setLocateError(null);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const nearest = findNearestSite(
          position.coords.latitude,
          position.coords.longitude,
        );
        setSiteId(nearest.id);
        setLocating(false);
      },
      (error) => {
        // 位置情報は HTTPS（または localhost）でないと取得できない。
        // 原因が分かる文言にしないと「壊れている」と思われる
        setLocateError(
          error.code === error.PERMISSION_DENIED
            ? '位置情報の利用が許可されていません。下から地点を選んでください。'
            : '現在地を取得できませんでした。下から地点を選んでください。',
        );
        setLocating(false);
      },
      { timeout: 8000, maximumAge: 600000 },
    );
  };

  return (
    <div className="space-y-4">
      {/* ── 現在の地点 ── */}
      <section className="card p-5">
        <h2 className="text-[14px] font-bold">観測地点</h2>

        <div className="mt-3 rounded-xl border border-[rgba(255,196,107,0.24)] bg-[rgba(255,196,107,0.06)] p-4">
          <p className="text-[10.5px] tracking-wide text-[var(--color-ink-faint)]">
            現在の設定
          </p>
          <p className="mt-0.5 text-[19px] font-bold text-[var(--color-accent)]">
            {site.name}
          </p>
          <p className="tnum mt-1 text-[10.5px] text-[var(--color-ink-faint)]">
            北緯 {site.latitudeDeg.toFixed(3)}° / 東経{' '}
            {site.longitudeDeg.toFixed(3)}° / 標高 {site.altitudeM}m
          </p>
          <p className="mt-2 text-[11px] leading-relaxed text-[var(--color-ink-faint)]">
            {site.pregenerated
              ? 'この地点はサーバで予報を事前計算しています。LINE通知の対象です。'
              : 'この地点の予報は端末内で計算します。LINE通知は最寄りの対応地点の軌道を使います。'}
            {source === 'local' && ' （今回は端末で計算しました）'}
          </p>
        </div>

        <p className="mt-3 text-[11.5px] leading-relaxed text-[var(--color-ink-faint)]">
          選んだ地点は端末内にのみ保存されます。サーバには送信されません。
        </p>

        <button
          type="button"
          onClick={useCurrentLocation}
          disabled={locating}
          className="tap mt-3 w-full rounded-xl border border-[var(--color-edge-strong)] py-2.5 text-[13px] font-medium disabled:opacity-50"
        >
          {locating ? '取得中…' : '現在地から最も近い地点を選ぶ'}
        </button>
        {locateError && (
          <p className="mt-2 text-[11.5px] leading-relaxed text-[var(--color-warn)]">
            {locateError}
          </p>
        )}
      </section>

      {/* ── 地点の選択 ── */}
      <section className="card p-5">
        <h2 className="mb-4 text-[14px] font-bold">地点を選ぶ</h2>
        <SitePicker current={site} onSelect={setSiteId} />
      </section>

      {/* ── しきい値 ── */}
      <section className="card p-5">
        <h2 className="text-[14px] font-bold">通知のしきい値</h2>
        <p className="mt-1 text-[11.5px] leading-relaxed text-[var(--color-ink-faint)]">
          この点数以上のパスを「好条件」として強調し、LINEで通知します。
          <br />
          低くしすぎると通知が増え、外れたときに信用を失います。
        </p>
        <div className="mt-3 flex gap-2">
          {THRESHOLDS.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setThreshold(option.value)}
              className={`tap flex-1 rounded-xl border px-2 py-2.5 transition-colors ${
                option.value === threshold
                  ? 'border-[var(--color-accent)] bg-[rgba(255,196,107,0.10)]'
                  : 'border-[var(--color-edge)]'
              }`}
            >
              <span
                className={`block text-[13px] font-semibold ${
                  option.value === threshold
                    ? 'text-[var(--color-accent)]'
                    : 'text-[var(--color-ink-sub)]'
                }`}
              >
                {option.label}
              </span>
              <span className="tnum block text-[10px] text-[var(--color-ink-faint)]">
                {option.value}点以上
              </span>
              <span className="mt-0.5 block text-[9.5px] text-[var(--color-ink-faint)]">
                {option.note}
              </span>
            </button>
          ))}
        </div>
      </section>

      {/* ── LINE ── */}
      <section className="card p-5">
        <h2 className="text-[14px] font-bold">LINE通知</h2>
        <p className="mt-1 text-[11.5px] leading-relaxed text-[var(--color-ink-faint)]">
          LINE公式アカウントを友だち追加すると、条件が揃った日の朝と、
          通過の30分前に通知が届きます。
          友だち追加後、トークに市区町村名（例:「宮崎市」）を送ると
          その地点で通知されます。
        </p>
        <p className="mt-3 rounded-xl border border-[var(--color-edge)] bg-[var(--color-surface)] p-3 text-[11.5px] text-[var(--color-ink-faint)]">
          準備中です。LINE公式アカウントの設定が完了したら、
          ここに友だち追加のリンクが表示されます。
        </p>
      </section>

      {/* ── このアプリについて ── */}
      <section className="card p-5">
        <h2 className="text-[14px] font-bold">このアプリについて</h2>
        <dl className="mt-3 space-y-2.5 text-[11.5px] leading-relaxed text-[var(--color-ink-sub)]">
          <div>
            <dt className="font-semibold text-[var(--color-ink)]">
              軌道データ
            </dt>
            <dd className="text-[var(--color-ink-faint)]">
              CelesTrak の軌道要素（TLE）を SGP4 モデルで伝播しています。
            </dd>
          </div>
          <div>
            <dt className="font-semibold text-[var(--color-ink)]">天気</dt>
            <dd className="text-[var(--color-ink-faint)]">
              Open-Meteo の層別雲量（下層・中層・上層）を使用しています。
            </dd>
          </div>
          <div>
            <dt className="font-semibold text-[var(--color-ink)]">
              通知が来ない期間について
            </dt>
            <dd className="text-[var(--color-ink-faint)]">
              ISSが光って見えるのは日没直後と日の出前だけです。
              その条件が揃う可視期間は約2か月ごとに1〜2週間訪れます。
              数週間通知が来なくても故障ではありません。
            </dd>
          </div>
          <div>
            <dt className="font-semibold text-[var(--color-ink)]">
              Starlinkについて
            </dt>
            <dd className="text-[var(--color-ink-faint)]">
              運用中のStarlink衛星は遮光対策により5〜7等と暗く、肉眼ではほぼ見えません。
              肉眼で見えるのは打ち上げ直後の「トレイン」期だけです。
            </dd>
          </div>
        </dl>
      </section>
    </div>
  );
}
