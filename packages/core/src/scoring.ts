/**
 * 観測しやすさスコア
 *
 * 設計書 4.5 の乗算モデル。
 *
 *   score = 100 × w_cloud × w_elevation × w_magnitude × w_darkness × w_hour × w_duration
 *
 * なぜ加算ではなく乗算なのか：
 *   加算（重み付き平均）だと「最大仰角85°・光度-4等・だが雲量100%」が高得点になる。
 *   実際にはこれは絶対に見えない。乗算なら1つでも致命的な因子があれば全体が0に近づき、
 *   「通知したのに見えなかった」という最悪の失敗（要件R-1）を構造的に防げる。
 */

import {
  MAX_SUN_ALTITUDE_DEG,
  NAUTICAL_TWILIGHT_DEG,
  VERDICT_THRESHOLDS,
} from './constants.js';
import { clamp } from './geometry.js';
import { jstHourDecimal } from './time.js';
import { describeCloudJa } from './format.js';
import type {
  Pass,
  PassScore,
  ScoreFactorKey,
  ScoredPass,
  Verdict,
  WeatherSnapshot,
} from './types.js';

/**
 * 雲の因子。「透過率の積」として扱う。
 *
 * 下層雲は完全に遮るが、上層の巻雲は薄いので -3等のISSなら透けて見える。
 * この差を無視して全雲量だけで判定すると、巻雲の日を過剰に切り捨ててしまう。
 *
 *   遮蔽率 B = 1 - (1 - low) × (1 - mid) × (1 - 0.45 × high)
 *
 * 0.45 は「上層雲は下層雲の半分以下しか遮らない」という経験的な重み。
 */
export function cloudFactor(weather: WeatherSnapshot): number {
  const low = clamp(weather.cloudLowPct / 100, 0, 1);
  const mid = clamp(weather.cloudMidPct / 100, 0, 1);
  const high = clamp(weather.cloudHighPct / 100, 0, 1);

  const transparency = (1 - low) * (1 - mid) * (1 - 0.45 * high);
  return clamp(transparency, 0, 1) ** 1.3;
}

/**
 * 最大仰角の因子。
 * 10°では地物に隠れる可能性が高く、50°を超えれば遮るものはまずない。
 */
export function elevationFactor(maxElevationDeg: number): number {
  return 0.15 + 0.85 * clamp((maxElevationDeg - 10) / 40, 0, 1);
}

/**
 * 明るさの因子。
 * -2等なら市街地でも一目瞭然。+4等になると肉眼では厳しい。
 */
/**
 * 光度から「見つけられる確率」への変換表。
 *
 * 等級と見つけやすさは線形ではない。
 * −1等（シリウス級）と−4等（金星級）の差は、
 * 「すぐ見つかる」と「すぐ見つかる」の差でしかない。
 * 一方 2等と4等の差は「探せば見える」と「まず無理」ほど違う。
 *
 * 当初は直線式にしていたが、それだと−0.8等のBlueBirdが0.80止まりになり、
 * 晴天・仰角79°という「ほぼ確実に見える」条件でも通知されなかった。
 * 実際の見つけやすさに合わせて折れ線で定義し直す。
 */
const MAGNITUDE_CURVE: ReadonlyArray<readonly [magnitude: number, weight: number]> = [
  [-2.0, 1.0], // 金星級。見逃しようがない
  [-1.0, 0.97], // シリウス級
  [0.0, 0.9], // 一等星より明るい
  [1.0, 0.78], // 一等星なみ
  [2.0, 0.6], // 北斗七星なみ。街中でも一応見える
  [3.0, 0.35], // 探せば見えるが、動く点を追うのは難しい
  [4.0, 0.1], // 郊外でようやく
  [5.0, 0.03], // 実質不可能
];

export function magnitudeFactor(peakMagnitude: number): number {
  const first = MAGNITUDE_CURVE[0];
  const last = MAGNITUDE_CURVE[MAGNITUDE_CURVE.length - 1];
  if (!first || !last) return 0.02;

  if (peakMagnitude <= first[0]) return first[1];
  if (peakMagnitude >= last[0]) return last[1];

  // 表の区間を見つけて線形補間する
  for (let i = 1; i < MAGNITUDE_CURVE.length; i += 1) {
    const lower = MAGNITUDE_CURVE[i - 1];
    const upper = MAGNITUDE_CURVE[i];
    if (!lower || !upper) continue;
    if (peakMagnitude <= upper[0]) {
      const ratio = (peakMagnitude - lower[0]) / (upper[0] - lower[0]);
      return clamp(lower[1] + ratio * (upper[1] - lower[1]), 0.02, 1.0);
    }
  }
  return last[1];
}

/**
 * 天気を除いた「軌道条件だけの見やすさ」を返す（0〜1）。
 *
 * 天気は日々変わるが、軌道条件は変わらない。
 * 予報に保存する価値があるパスかどうかの判定には、
 * 天気に左右されないこちらを使う。
 * （曇り予報の日に「保存する価値なし」と判断して消すと、
 *   晴れたときに何も出せなくなる）
 */
export function geometricQuality(factors: Record<ScoreFactorKey, number>): number {
  return (
    factors.elevation *
    factors.magnitude *
    factors.darkness *
    factors.hour *
    factors.duration
  );
}

/**
 * 空の暗さの因子。
 * 太陽高度 -6°（市民薄明の終わり）から -12°（航海薄明の終わり）にかけて
 * 空は急速に暗くなる。-12°より暗ければ条件は変わらない。
 */
export function darknessFactor(sunAltitudeDeg: number): number {
  if (sunAltitudeDeg > MAX_SUN_ALTITUDE_DEG) return 0;
  const span = Math.abs(NAUTICAL_TWILIGHT_DEG - MAX_SUN_ALTITUDE_DEG); // 6°
  const progress = clamp(
    (-sunAltitudeDeg - Math.abs(MAX_SUN_ALTITUDE_DEG)) / span,
    0,
    1,
  );
  return 0.35 + 0.65 * progress;
}

/**
 * 生活時間帯の因子。
 * 理論上見えても午前3時では通知する価値がない。技術的な正しさと
 * 実際に役立つかは別問題なので、ここで人間の都合を明示的に入れる。
 */
export function hourFactor(timeMs: number): number {
  const hour = jstHourDecimal(timeMs);
  if (hour >= 18 && hour < 22.5) return 1.0; // 夕方〜夜。最も観測しやすい
  if (hour >= 22.5 && hour < 24) return 0.75; // 夜更け
  if (hour >= 4.5 && hour < 6) return 0.55; // 早朝。起きられる人だけ
  if (hour >= 0 && hour < 4.5) return 0.25; // 深夜
  return 0.1; // 日中（通常は薄明フィルタで除外済み）
}

/**
 * 継続時間の因子。
 * 2分のパスは「気づいたら終わっていた」になりやすい。4分あれば余裕を持って探せる。
 *
 * 渡すのは「通過時間」ではなく「光って見えている時間」であることが重要。
 * 10分かけて空を横切っても、途中で影に入れば実際に見えるのは3分ということがある。
 */
export function durationFactor(visibleDurationSec: number): number {
  return clamp(visibleDurationSec / 240, 0.5, 1.0);
}

const FACTOR_LABEL_JA: Record<ScoreFactorKey, string> = {
  cloud: '雲',
  elevation: '高度',
  magnitude: '明るさ',
  darkness: '空の暗さ',
  hour: '時間帯',
  duration: '継続時間',
};

function toVerdict(total: number): Verdict {
  if (total >= VERDICT_THRESHOLDS.excellent) return 'excellent';
  if (total >= VERDICT_THRESHOLDS.good) return 'good';
  if (total >= VERDICT_THRESHOLDS.marginal) return 'marginal';
  return 'poor';
}

/**
 * 「見えない理由」を日本語で作る。
 *
 * ユーザーが最も知りたいのは「なぜ今夜はダメなのか」。
 * 理由が納得できれば、次に通知が来たときに信じてもらえる。
 */
function buildReasonJa(
  limiting: ScoreFactorKey | null,
  pass: Pass,
  weather: WeatherSnapshot | null,
  verdict: Verdict,
): string {
  if (!weather) {
    return '天気の情報が取得できていないため、見えるかどうか判断できません。';
  }
  if (verdict === 'excellent') {
    return `${describeCloudJa(weather.cloudTotalPct)}で、最大${Math.round(pass.culmination.elevationDeg)}°まで昇ります。よい条件です。`;
  }

  switch (limiting) {
    case 'cloud':
      return `雲量${Math.round(weather.cloudTotalPct)}%（${describeCloudJa(weather.cloudTotalPct)}）のため、見込みは薄いです。`;
    case 'elevation':
      return `最大でも${Math.round(pass.culmination.elevationDeg)}°までしか昇らず、建物や山に隠れる可能性があります。`;
    case 'magnitude':
      return `${pass.peakMagnitude.toFixed(1)}等と暗いため、肉眼では見つけにくいです。`;
    case 'darkness':
      return 'まだ空が明るく、衛星を見分けにくい時間帯です。';
    case 'hour':
      return '見られる時刻が深夜・早朝のため、実際に観測するのは難しいかもしれません。';
    case 'duration':
      return `光って見えるのが${Math.round(pass.visibleDurationSec)}秒と短く、見つける前に消えてしまうかもしれません。`;
    default:
      return '条件は悪くありませんが、確実とは言えません。';
  }
}

/**
 * パスと天気からスコアを算出する。
 *
 * 天気が取得できていない（weather === null）場合、スコアは軌道条件のみで計算し
 * `weatherKnown: false` を立てる。通知処理はこのフラグを見て送信を中止する（FR-3.3）。
 * 「たぶん晴れているだろう」で通知するのが最も危険なため。
 */
export function scorePass(
  pass: Pass,
  weather: WeatherSnapshot | null,
): PassScore {
  const factors: Record<ScoreFactorKey, number> = {
    // 天気不明のときは雲因子を 1 として扱い、代わりに weatherKnown を false にする。
    // ここで 0 にするとスコアが常に 0 になり、アプリ側で軌道条件を見せられなくなる。
    cloud: weather ? cloudFactor(weather) : 1,
    elevation: elevationFactor(pass.culmination.elevationDeg),
    magnitude: magnitudeFactor(pass.peakMagnitude),
    darkness: darknessFactor(pass.sunAltitudeAtCulminationDeg),
    hour: hourFactor(pass.culmination.timeMs),
    duration: durationFactor(pass.visibleDurationSec),
  };

  const product = (Object.values(factors) as number[]).reduce(
    (acc, value) => acc * value,
    1,
  );
  const total = Math.round(clamp(product * 100, 0, 100));

  // 最も小さい因子＝ボトルネック。天気不明のときは雲を候補から外す
  let limitingFactor: ScoreFactorKey | null = null;
  let lowest = Number.POSITIVE_INFINITY;
  for (const [key, value] of Object.entries(factors) as [
    ScoreFactorKey,
    number,
  ][]) {
    if (key === 'cloud' && !weather) continue;
    if (value < lowest) {
      lowest = value;
      limitingFactor = key;
    }
  }

  const verdict = toVerdict(total);

  return {
    total,
    factors,
    limitingFactor,
    verdict,
    reasonJa: buildReasonJa(limitingFactor, pass, weather, verdict),
    weatherKnown: weather !== null,
  };
}

/** パスと天気を組み合わせて ScoredPass にする */
export function toScoredPass(
  pass: Pass,
  weather: WeatherSnapshot | null,
): ScoredPass {
  return { pass, weather, score: scorePass(pass, weather) };
}

/** 因子キーの日本語ラベル。UIのスコア内訳表示に使う */
export function factorLabelJa(key: ScoreFactorKey): string {
  return FACTOR_LABEL_JA[key];
}

/**
 * 通知してよいパスかどうか。
 *
 * スコアだけでなく「天気が確認できていること」を必須条件にしている点が重要。
 * 天気不明のまま通知するくらいなら、通知しないほうがよい。
 */
export function isNotifiable(scored: ScoredPass, threshold: number): boolean {
  return scored.score.weatherKnown && scored.score.total >= threshold;
}
