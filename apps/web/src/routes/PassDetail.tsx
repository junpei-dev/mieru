/**
 * パス詳細
 *
 * 実際に外で空を見上げながら開く画面。
 * 大きなスカイマップと、時刻ごとの方角表を出す。
 */

import { Link, useParams } from 'react-router';
import {
  azimuthToCompass16Ja,
  describeElevationJa,
  describeMagnitudeJa,
  describePathJa,
  formatDurationJa,
  formatJstDate,
  formatJstTime,
  type TrackPoint,
} from '@mieru/core';
import { useApp } from '../AppContext.js';
import { SkyMap } from '../components/SkyMap.js';
import { WeatherStrip } from '../components/WeatherStrip.js';
import { ScoreBreakdown } from '../components/ScoreBar.js';
import { Loading, ErrorPanel } from '../components/States.js';

/** 表に出す行を絞る。全点出すと読めないので、開始・最大・終了＋等間隔に間引く */
function tableRows(track: TrackPoint[]): TrackPoint[] {
  if (track.length <= 8) return track;
  const step = Math.ceil(track.length / 7);
  const rows = track.filter((_, index) => index % step === 0);
  const last = track[track.length - 1];
  if (last && rows[rows.length - 1] !== last) rows.push(last);
  return rows;
}

export function PassDetail() {
  const { passId } = useParams();
  const { document, loading, error } = useApp();

  if (loading) return <Loading />;
  if (error || !document) return <ErrorPanel message={error} />;

  const scored = document.scoredPasses.find((p) => p.pass.id === passId);
  if (!scored) {
    return (
      <div className="card p-6">
        <p className="text-[14px] text-[var(--color-ink-sub)]">
          このパスは見つかりませんでした。予報が更新された可能性があります。
        </p>
        <Link
          to="/"
          className="tap mt-4 inline-block rounded-full border border-[var(--color-edge-strong)] px-5 py-2 text-[13px]"
        >
          今夜の予報へ
        </Link>
      </div>
    );
  }

  const { pass, weather, score } = scored;

  return (
    <div className="space-y-4">
      <section className="card p-5">
        <p className="text-[12px] text-[var(--color-ink-sub)]">
          {formatJstDate(pass.culmination.timeMs)} · {pass.satelliteName}
        </p>
        <div className="mt-1.5 flex items-baseline gap-2">
          <span className="tnum text-[36px] leading-none font-bold">
            {formatJstTime(pass.start.timeMs)}
          </span>
          <span className="tnum text-[15px] text-[var(--color-ink-faint)]">
            〜 {formatJstTime(pass.end.timeMs)}
          </span>
        </div>
        <p className="mt-2 text-[13.5px] text-[var(--color-ink-sub)]">
          {describePathJa(
            pass.start.azimuthDeg,
            pass.culmination.azimuthDeg,
            pass.culmination.elevationDeg,
            pass.end.azimuthDeg,
          )}
        </p>
      </section>

      <section className="card flex justify-center px-4 py-5">
        <SkyMap pass={pass} size={340} />
      </section>

      <section className="card p-5">
        <dl className="grid grid-cols-2 gap-y-3.5">
          <div>
            <dt className="text-[11px] text-[var(--color-ink-faint)]">
              最大仰角
            </dt>
            <dd className="tnum text-[17px] font-semibold">
              {Math.round(pass.culmination.elevationDeg)}°
              <span className="ml-1.5 text-[11px] font-normal text-[var(--color-ink-faint)]">
                {describeElevationJa(pass.culmination.elevationDeg)}
              </span>
            </dd>
          </div>
          <div>
            <dt className="text-[11px] text-[var(--color-ink-faint)]">明るさ</dt>
            <dd className="tnum text-[17px] font-semibold">
              {pass.peakMagnitude.toFixed(1)}等
              <span className="ml-1.5 text-[11px] font-normal text-[var(--color-ink-faint)]">
                {describeMagnitudeJa(pass.peakMagnitude)}
              </span>
            </dd>
          </div>
          <div>
            <dt className="text-[11px] text-[var(--color-ink-faint)]">
              見えている時間
            </dt>
            <dd className="tnum text-[17px] font-semibold">
              {formatDurationJa(pass.visibleDurationSec)}
              {/* 通過時間と見える時間が違うのは、途中で影に入るため。
                  この差を説明しないと「予報より早く消えた」と思われる */}
              {pass.visibleDurationSec < pass.durationSec - 20 && (
                <span className="block text-[11px] font-normal text-[var(--color-ink-faint)]">
                  通過自体は {formatDurationJa(pass.durationSec)}
                </span>
              )}
            </dd>
          </div>
          <div>
            <dt className="text-[11px] text-[var(--color-ink-faint)]">
              空の暗さ
            </dt>
            <dd className="tnum text-[17px] font-semibold">
              太陽 {Math.round(pass.sunAltitudeAtCulminationDeg)}°
            </dd>
          </div>
        </dl>
      </section>

      <section className="card p-5">
        <h3 className="mb-3 text-[12px] font-semibold tracking-wide text-[var(--color-ink-sub)]">
          スコアの内訳
        </h3>
        <ScoreBreakdown score={score} />
        <p className="mt-3 text-[12px] leading-relaxed text-[var(--color-ink-faint)]">
          {score.reasonJa}
        </p>
      </section>

      <WeatherStrip weather={weather} />

      <section className="card overflow-hidden">
        <h3 className="px-5 pt-5 pb-3 text-[12px] font-semibold tracking-wide text-[var(--color-ink-sub)]">
          時刻ごとの位置
        </h3>
        <table className="w-full text-left">
          <thead>
            <tr className="border-y border-[var(--color-edge)] text-[10.5px] text-[var(--color-ink-faint)]">
              <th className="px-5 py-2 font-medium">時刻</th>
              <th className="py-2 font-medium">方角</th>
              <th className="py-2 text-right font-medium">仰角</th>
              <th className="px-5 py-2 text-right font-medium">状態</th>
            </tr>
          </thead>
          <tbody>
            {tableRows(pass.track).map((point) => (
              <tr
                key={point.timeMs}
                className="border-b border-[var(--color-edge)] last:border-0"
              >
                <td className="tnum px-5 py-2.5 text-[12.5px]">
                  {formatJstTime(point.timeMs)}
                </td>
                <td className="py-2.5 text-[12.5px]">
                  {azimuthToCompass16Ja(point.azimuthDeg)}
                </td>
                <td className="tnum py-2.5 text-right text-[12.5px]">
                  {Math.round(point.elevationDeg)}°
                </td>
                <td className="px-5 py-2.5 text-right text-[11px]">
                  {point.illumination.state === 'umbra' ? (
                    <span className="text-[var(--color-ink-faint)]">
                      影の中
                    </span>
                  ) : point.illumination.state === 'penumbra' ? (
                    <span className="text-[var(--color-ink-sub)]">薄暗い</span>
                  ) : (
                    <span className="text-[var(--color-accent)]">見える</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
