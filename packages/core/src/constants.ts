/**
 * 物理定数と判定しきい値
 *
 * 天文計算に使う定数は出典を明記する。値をいじると予報がまるごとズレるため。
 */

// ─────────── 物理定数 ───────────

/** 地球の赤道半径[km]（WGS-84） */
export const EARTH_RADIUS_KM = 6378.137;

/** 太陽の半径[km]（IAU 2015 公称値） */
export const SUN_RADIUS_KM = 695700;

/** 天文単位[km]（IAU 2012 定義値） */
export const AU_KM = 149597870.7;

/** J2000.0 元期のユリウス日 */
export const JD_J2000 = 2451545.0;

/** 1970-01-01T00:00:00Z のユリウス日（Unix時刻との変換に使う） */
export const JD_UNIX_EPOCH = 2440587.5;

export const MS_PER_DAY = 86400000;
export const MS_PER_HOUR = 3600000;
export const MS_PER_MINUTE = 60000;

export const DEG_TO_RAD = Math.PI / 180;
export const RAD_TO_DEG = 180 / Math.PI;

/** 日本標準時のUTCからのオフセット[ms]。日本にサマータイムはないので固定 */
export const JST_OFFSET_MS = 9 * MS_PER_HOUR;

// ─────────── パス探索のパラメータ ───────────

/**
 * 粗探索のステップ[秒]。
 * ISS は最短でも約120秒は地平線上にいるので、30秒なら取りこぼさない
 * （最低3点は必ず区間内に入る）。より高速な衛星を足すときは要見直し。
 */
export const COARSE_STEP_SEC = 30;

/** AOS/LOS を二分法で詰める反復回数。30秒 / 2^8 ≒ 0.12秒精度 */
export const BISECTION_ITERATIONS = 8;

/** 最大仰角点を黄金分割探索で詰める反復回数 */
export const GOLDEN_SECTION_ITERATIONS = 40;

/**
 * 描画用トラックの最大点数。JSONサイズと滑らかさのバランス。
 *
 * 10分のパスでも32点なら約20秒間隔。320pxのSVGに描くには十分滑らかで、
 * 影に入る境界も20秒精度で拾える。
 * 60点にすると予報JSONが倍になり、全国分をリポジトリに持つのが重くなる。
 */
export const MAX_TRACK_POINTS = 32;

// ─────────── 可視判定のしきい値 ───────────

/**
 * これ未満の最大仰角のパスは捨てる[deg]。
 * 10°未満は建物・山・木にほぼ確実に隠れるため、予報しても意味がない。
 */
export const MIN_USEFUL_ELEVATION_DEG = 10;

/**
 * 観測地の太陽高度がこれより高い＝空が明るすぎて衛星は見えない[deg]。
 * -6° は市民薄明の終わり。これより明るいと -3等の ISS でも見つけにくい。
 */
export const MAX_SUN_ALTITUDE_DEG = -6;

/** 天文薄明の終わり[deg]。これより暗ければ「完全な夜」 */
export const ASTRONOMICAL_TWILIGHT_DEG = -18;

/** 航海薄明の終わり[deg]。スコアの暗さ因子の飽和点として使う */
export const NAUTICAL_TWILIGHT_DEG = -12;

// ─────────── スコアリング ───────────

/** これ以上なら通知する（FR-4.4） */
export const NOTIFY_SCORE_THRESHOLD = 70;

/** リマインド直前の再判定でこれを下回ったら中止する（設計書6.3） */
export const REMINDER_ABORT_SCORE = 50;

/** verdict の境界値 */
export const VERDICT_THRESHOLDS = {
  excellent: 70,
  good: 45,
  marginal: 20,
} as const;

// ─────────── データ鮮度 ───────────

/** TLE の元期からこれ以上経過したら計算に使わない[日]（FR-7.2） */
export const MAX_TLE_AGE_DAYS = 7;

/** 予報データがこれ以上古ければ管理者に警告[時間]（FR-7.1） */
export const STALE_FORECAST_HOURS = 36;

/** 予報を生成する日数 */
export const FORECAST_DAYS = 7;
