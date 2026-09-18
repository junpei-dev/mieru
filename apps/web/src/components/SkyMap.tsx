/**
 * スカイマップ — 衛星の通過経路を空の形のまま描く
 *
 * 天頂を中心とした極座標（方位投影）で描く。
 * これは「地面に寝転がって空を見上げたとき」の見え方と一致する。
 * 地図のように北を上にした平面図ではなく、空そのものの図であることが重要。
 *
 *   外周円 = 地平線（仰角0°）
 *   中心   = 天頂（仰角90°）
 *   角度   = 方位角（北が上、時計回り）
 *
 * 影に入る区間を破線にしているのは、ISSが天頂付近で「フッと消える」現象を
 * 事前に伝えるため。知らないと「見失った」と思ってしまう。
 */

import { useMemo } from 'react';
import {
  azimuthToCompass8Ja,
  formatJstTime,
  type Pass,
  type TrackPoint,
} from '@mieru/core';

interface SkyMapProps {
  pass: Pass;
  /** SVGの一辺（px）。カード内は280、詳細画面は340程度 */
  size?: number;
  /** 経路を描き進めるアニメーションを行うか */
  animate?: boolean;
  /** 時刻ラベルを表示するか（小さいサイズでは省く） */
  showTimeMarkers?: boolean;
}

const VIEW = 340;
const CENTER = VIEW / 2;
const RADIUS = 136;

/** 仰角・方位角 → SVG座標。このアプリの座標系の定義そのもの */
function project(azimuthDeg: number, elevationDeg: number): [number, number] {
  // 天頂(90°)で r=0、地平線(0°)で r=RADIUS
  const r = ((90 - Math.max(0, elevationDeg)) / 90) * RADIUS;
  const rad = (azimuthDeg * Math.PI) / 180;
  return [CENTER + r * Math.sin(rad), CENTER - r * Math.cos(rad)];
}

function toPathData(points: TrackPoint[]): string {
  return points
    .map((point, index) => {
      const [x, y] = project(point.azimuthDeg, point.elevationDeg);
      return `${index === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(' ');
}

/** 影に入っているかで経路を区切る。境界の点は両方に含めて線を繋げる */
function splitByIllumination(
  track: TrackPoint[],
): { lit: boolean; points: TrackPoint[] }[] {
  const segments: { lit: boolean; points: TrackPoint[] }[] = [];
  for (const point of track) {
    const lit = point.illumination.state !== 'umbra';
    const last = segments[segments.length - 1];
    if (!last || last.lit !== lit) {
      // 直前の点を引き継いで線を途切れさせない
      const carry = last?.points[last.points.length - 1];
      segments.push({ lit, points: carry ? [carry, point] : [point] });
    } else {
      last.points.push(point);
    }
  }
  return segments.filter((segment) => segment.points.length >= 2);
}

/** 決まった位置に星を撒く（乱数を使うと再描画のたびに動いてしまう） */
const STARS = Array.from({ length: 46 }, (_, i) => {
  // 黄金角でばらけさせると、規則的にならず均等に散る
  const angle = i * 2.399963;
  const distance = Math.sqrt((i + 0.5) / 46) * RADIUS * 0.97;
  return {
    x: CENTER + distance * Math.cos(angle),
    y: CENTER + distance * Math.sin(angle),
    r: 0.6 + ((i * 7) % 5) * 0.22,
    delay: ((i * 13) % 40) / 10,
  };
});

const CARDINALS: { label: string; azimuth: number }[] = [
  { label: '北', azimuth: 0 },
  { label: '東', azimuth: 90 },
  { label: '南', azimuth: 180 },
  { label: '西', azimuth: 270 },
];

export function SkyMap({
  pass,
  size = 320,
  animate = true,
  showTimeMarkers = true,
}: SkyMapProps) {
  const segments = useMemo(
    () => splitByIllumination(pass.track),
    [pass.track],
  );

  const [culmX, culmY] = project(
    pass.culmination.azimuthDeg,
    pass.culmination.elevationDeg,
  );
  const [startX, startY] = project(pass.start.azimuthDeg, 0);
  const [endX, endY] = project(pass.end.azimuthDeg, 0);

  // 途中の時刻ラベル。多すぎると読めないので最大2点に絞る。
  // 最大仰角のラベルと重なると数字が読めなくなるので、
  // 時刻が近い点・画面上の位置が近い点は除外する。
  const timeMarkers = useMemo(() => {
    if (!showTimeMarkers) return [];
    const lit = pass.track.filter(
      (point) =>
        point.illumination.state !== 'umbra' && point.elevationDeg > 12,
    );
    if (lit.length < 4) return [];

    const candidates = [
      lit[Math.floor(lit.length * 0.2)],
      lit[Math.floor(lit.length * 0.8)],
    ].filter((point): point is TrackPoint => point !== undefined);

    const [peakX, peakY] = project(
      pass.culmination.azimuthDeg,
      pass.culmination.elevationDeg,
    );

    return candidates.filter((point) => {
      // 最大仰角と同じ「分」を指すラベルは重複表示になるので出さない
      const sameMinute =
        Math.abs(point.timeMs - pass.culmination.timeMs) < 60_000;
      if (sameMinute) return false;

      // 描画位置が近すぎる場合もラベルが重なる
      const [x, y] = project(point.azimuthDeg, point.elevationDeg);
      const distance = Math.hypot(x - peakX, y - peakY);
      return distance > 42;
    });
  }, [pass.track, pass.culmination, showTimeMarkers]);

  const description =
    `${azimuthToCompass8Ja(pass.start.azimuthDeg)}の空に現れ、` +
    `最大仰角${Math.round(pass.culmination.elevationDeg)}度まで昇り、` +
    `${azimuthToCompass8Ja(pass.end.azimuthDeg)}の空へ移動します。`;

  return (
    <svg
      viewBox={`0 0 ${VIEW} ${VIEW}`}
      width={size}
      height={size}
      role="img"
      aria-label={description}
      style={{ maxWidth: '100%', height: 'auto' }}
    >
      <defs>
        {/* 空そのもののグラデーション。地平線側をわずかに明るくする */}
        <radialGradient id="sky-fill" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#0A1024" />
          <stop offset="70%" stopColor="#0B1224" />
          <stop offset="100%" stopColor="#111C36" />
        </radialGradient>

        {/* 軌道線。進行方向に向かって明るくなる */}
        <linearGradient id="orbit-stroke" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#38BDF8" stopOpacity="0.45" />
          <stop offset="55%" stopColor="#7DD3FC" stopOpacity="1" />
          <stop offset="100%" stopColor="#BAE6FD" stopOpacity="0.85" />
        </linearGradient>

        <filter id="peak-glow" x="-120%" y="-120%" width="340%" height="340%">
          <feGaussianBlur stdDeviation="4.5" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>

        {/* 円の外に描画がはみ出さないようにする */}
        <clipPath id="sky-clip">
          <circle cx={CENTER} cy={CENTER} r={RADIUS} />
        </clipPath>
      </defs>

      {/* ── 空の面 ── */}
      <circle cx={CENTER} cy={CENTER} r={RADIUS} fill="url(#sky-fill)" />

      <g clipPath="url(#sky-clip)">
        {STARS.map((star, index) => (
          <circle
            key={index}
            cx={star.x}
            cy={star.y}
            r={star.r}
            fill="#C7D2FE"
            opacity={0.35}
            style={{
              animation: `twinkle ${3.5 + star.delay}s ease-in-out ${star.delay}s infinite`,
            }}
          />
        ))}
      </g>

      {/* ── 仰角リング（30°・60°）── */}
      {[30, 60].map((elevation) => (
        <circle
          key={elevation}
          cx={CENTER}
          cy={CENTER}
          r={((90 - elevation) / 90) * RADIUS}
          fill="none"
          stroke="rgba(255,255,255,0.10)"
          strokeWidth="1"
          strokeDasharray="2 5"
        />
      ))}
      {/* 仰角の目盛りラベル。南側の下寄りに置くと軌道線と重なりにくい */}
      {[30, 60].map((elevation) => (
        <text
          key={`label-${elevation}`}
          x={CENTER + 4}
          y={CENTER + ((90 - elevation) / 90) * RADIUS - 3}
          fill="rgba(255,255,255,0.28)"
          fontSize="9"
          fontFamily="var(--font-mono)"
        >
          {elevation}°
        </text>
      ))}

      {/* ── 地平線 ── */}
      <circle
        cx={CENTER}
        cy={CENTER}
        r={RADIUS}
        fill="none"
        stroke="rgba(255,255,255,0.22)"
        strokeWidth="1.5"
      />

      {/* ── 方位 ── */}
      {CARDINALS.map(({ label, azimuth }) => {
        const [lx, ly] = project(azimuth, -13); // 円の少し外側
        return (
          <text
            key={label}
            x={lx}
            y={ly}
            fill={label === '北' ? '#E8ECF5' : '#8B95AC'}
            fontSize={label === '北' ? 14 : 12.5}
            fontWeight={label === '北' ? 700 : 500}
            textAnchor="middle"
            dominantBaseline="middle"
          >
            {label}
          </text>
        );
      })}

      {/* ── 軌道 ── */}
      <g clipPath="url(#sky-clip)">
        {segments.map((segment, index) => (
          <path
            key={index}
            d={toPathData(segment.points)}
            fill="none"
            stroke={segment.lit ? 'url(#orbit-stroke)' : '#4B5A78'}
            strokeWidth={segment.lit ? 3 : 2}
            strokeLinecap="round"
            strokeLinejoin="round"
            // 影の中の区間は破線。「ここで消える」ことを目で分かるようにする
            strokeDasharray={segment.lit ? undefined : '3 6'}
            opacity={segment.lit ? 1 : 0.5}
            pathLength={1}
            className={animate && segment.lit ? 'draw-in' : undefined}
          />
        ))}
      </g>

      {/* ── 開始・終了 ── */}
      <circle
        cx={startX}
        cy={startY}
        r="4"
        fill="none"
        stroke="#7DD3FC"
        strokeWidth="1.8"
      />
      <circle cx={endX} cy={endY} r="3" fill="#4B5A78" />

      {/* ── 最大仰角点 ── */}
      <circle
        cx={culmX}
        cy={culmY}
        r="6"
        fill="#FFC46B"
        filter="url(#peak-glow)"
      />
      <text
        x={culmX}
        y={culmY - 14}
        fill="#FFC46B"
        fontSize="11.5"
        fontWeight="700"
        textAnchor="middle"
        fontFamily="var(--font-mono)"
      >
        {formatJstTime(pass.culmination.timeMs)}
      </text>

      {/* ── 途中の時刻 ── */}
      {timeMarkers.map((point) => {
        const [x, y] = project(point.azimuthDeg, point.elevationDeg);
        return (
          <g key={point.timeMs}>
            <circle cx={x} cy={y} r="2.5" fill="#BAE6FD" opacity="0.9" />
            <text
              x={x}
              y={y + 15}
              fill="#8B95AC"
              fontSize="9.5"
              textAnchor="middle"
              fontFamily="var(--font-mono)"
            >
              {formatJstTime(point.timeMs)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
