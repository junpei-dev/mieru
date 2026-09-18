/**
 * 追跡対象の衛星カタログ
 *
 * standardMagnitude（標準等級）は実観測に基づく経験値であり、確定値ではない。
 * 予報が実際より明るい／暗い場合は、ここだけを直せば全体に反映される。
 * この値をコードに直接埋め込まないのは、キャリブレーションを可能にするため。
 *
 * ── 標準等級の定義 ──
 * 「距離1000km・照らされ率50%」のときの見かけの等級。
 * magnitude.ts の式に range=1000, k=0.5 を入れると補正項が 0 になる。
 */

import type { SatelliteSpec } from './types.js';

// ─────────────────────────────────────────────
// 宇宙ステーション（NORAD ID が固定なので直接指定できる）
// ─────────────────────────────────────────────

/** ISS の NORAD カタログ番号 */
export const ISS_NORAD_ID = '25544';

/** 中国宇宙ステーション（天宮）の NORAD カタログ番号 */
export const CSS_NORAD_ID = '48274';

export const ISS: SatelliteSpec = {
  noradId: ISS_NORAD_ID,
  name: 'ISS (ZARYA)',
  displayName: '国際宇宙ステーション',
  kind: 'iss',
  // 広く使われている実測由来の値。この値だと天頂通過時に -3.5〜-4.3等となり、
  // 実際の観測（最大 -4.4等程度）とよく一致する。
  standardMagnitude: -1.8,
  notifiable: true,
};

export const CSS: SatelliteSpec = {
  noradId: CSS_NORAD_ID,
  name: 'CSS (TIANHE)',
  displayName: '天宮（中国宇宙ステーション）',
  kind: 'css',
  // ISSより小さいぶん暗いが、それでも木星級。
  // この値だと高度434kmの天頂通過で約 -3.3等となり、
  // 実観測の「最大 -2〜-3等」とおおむね一致する。
  standardMagnitude: -1.0,
  // 軌道傾斜角41.5°で日本全域をカバーする。ISSに次ぐ明るさで、
  // ISSの可視期間外を埋めてくれるため通知対象にする。
  notifiable: true,
};

// ─────────────────────────────────────────────
// BlueBird（AST SpaceMobile）
// ─────────────────────────────────────────────

/**
 * BlueBird は巨大なフェーズドアレイアンテナを持つ通信衛星で、
 * 太陽光を効率よく反射するため人工衛星としては極めて明るい。
 * 天文学者が「観測を妨害する」と問題視しているほどで、
 * ISS・天宮に次ぐ肉眼対象になる。
 *
 * CelesTrak には "BLUEBIRD" ではなく **"SPACEMOBILE-NNN"** として登録されている。
 * 名前で検索しないと見つからない。
 *
 * NORAD ID を固定で書かない理由：
 *   今も打ち上げが続いており、新機を手作業で追記する運用は必ず破綻する。
 *   名前で問い合わせて、取得できた分をその場で分類する。
 */
export const BLUEBIRD_CELESTRAK_NAME = 'SPACEMOBILE';

/** 006号機以降が Block 2（アンテナ面積が約3.5倍） */
const BLUEBIRD_BLOCK2_FIRST_UNIT = 6;

/**
 * Block 1 の標準等級。★要キャリブレーション
 *
 * 同型の試験機 BlueWalker 3（アンテナ64m²、高度約500km）が
 * 最良条件で 0.4等まで達したという報告から逆算した値。
 *   0.4 = stdMag - 15.75 + 2.5*log10(494² / 0.75)  →  stdMag ≒ 2.4
 */
const BLUEBIRD_BLOCK1_STD_MAG = 2.4;

/**
 * Block 2 の標準等級。★要キャリブレーション
 *
 * アンテナ面積が約223m²とBlock 1（64m²）の約3.5倍。
 * 面積比から 2.5*log10(3.48) ≒ 1.35等 明るくなると見積もった。
 *   2.4 - 1.35 ≒ 1.0
 * この値だと高度527kmの天頂通過で約 -0.8等（ベガより明るい）になる。
 */
const BLUEBIRD_BLOCK2_STD_MAG = 1.0;

/**
 * "SPACEMOBILE-008" のような名前から機番を取り出す。
 * 取れなければ null（＝世代が判定できない）。
 */
function parseBlueBirdUnit(objectName: string): number | null {
  const matched = /SPACEMOBILE[-\s]?(\d+)/i.exec(objectName);
  if (!matched?.[1]) return null;
  const unit = Number.parseInt(matched[1], 10);
  return Number.isFinite(unit) ? unit : null;
}

/** 取得した BlueBird 1機を SatelliteSpec に変換する */
export function blueBirdSpec(
  noradId: string,
  objectName: string,
): SatelliteSpec {
  const unit = parseBlueBirdUnit(objectName);
  // 世代が判定できない場合は暗いほう（Block 1）とみなす。
  // 実際より明るく見積もって「見えます」と通知するほうが害が大きいため。
  const isBlock2 = unit !== null && unit >= BLUEBIRD_BLOCK2_FIRST_UNIT;

  return {
    noradId,
    name: objectName,
    displayName: unit === null ? 'BlueBird' : `BlueBird ${unit}号機`,
    kind: 'bluebird',
    standardMagnitude: isBlock2
      ? BLUEBIRD_BLOCK2_STD_MAG
      : BLUEBIRD_BLOCK1_STD_MAG,
    notifiable: true,
  };
}

// ─────────────────────────────────────────────
// Starlink（P4で実装予定）
// ─────────────────────────────────────────────

/**
 * Starlink の標準等級は「打ち上げ直後」と「運用中」で全く違う。
 * 距離の差だけでなく、姿勢（太陽電池パネルの向き）が違うため。
 *
 * - 打ち上げ直後（トレイン期）: パネル展開前の姿勢＋低高度で明るい。実観測 1〜3等
 * - 運用中: 遮光対策（誘電体ミラー等）済みで暗い。実観測 6〜7等
 *
 * 本アプリが通知するのはトレイン期のみ（要件7.2）。
 * 運用中の衛星は肉眼では実質見えないので、通知すると嘘になる。
 */
export const STARLINK_TRAIN: SatelliteSpec = {
  noradId: '',
  name: 'STARLINK',
  displayName: 'Starlink（打ち上げ直後の列）',
  kind: 'starlink-train',
  standardMagnitude: 4.0, // ★要キャリブレーション
  notifiable: true,
};

export const STARLINK_OPERATIONAL: SatelliteSpec = {
  noradId: '',
  name: 'STARLINK',
  displayName: 'Starlink（運用中）',
  kind: 'starlink-operational',
  standardMagnitude: 7.5, // ★要キャリブレーション
  notifiable: false, // 肉眼で見えないので通知しない
};

// ─────────────────────────────────────────────
// CelesTrak からの取得単位
// ─────────────────────────────────────────────

/**
 * CelesTrak への問い合わせ1回ぶんの定義。
 *
 * NORAD ID が固定の衛星は CATNR で、
 * 機数が増減するシリーズは NAME でまとめて取得する。
 * 12機を個別に取りに行くとCelesTrakに12回アクセスすることになるため。
 */
export interface TrackedSource {
  id: string;
  /** ログ表示用 */
  label: string;
  query:
    | { type: 'catnr'; catnr: string }
    | { type: 'name'; name: string };
  /** 取得できた1機を SatelliteSpec に変換する */
  specFor(noradId: string, objectName: string): SatelliteSpec;
  /**
   * この取得元が空振りしたとき、予報全体を失敗させるか。
   *
   * ISSが取れないのは異常事態だが、BlueBirdが取れないのは
   * カタログ名の変更などで起こりうる。片方の欠損で全部止めない。
   */
  required: boolean;
}

export const TRACKED_SOURCES: TrackedSource[] = [
  {
    id: 'iss',
    label: '国際宇宙ステーション',
    query: { type: 'catnr', catnr: ISS_NORAD_ID },
    specFor: () => ISS,
    required: true,
  },
  {
    id: 'css',
    label: '天宮',
    query: { type: 'catnr', catnr: CSS_NORAD_ID },
    specFor: () => CSS,
    required: false,
  },
  {
    id: 'bluebird',
    label: 'BlueBird（AST SpaceMobile）',
    query: { type: 'name', name: BLUEBIRD_CELESTRAK_NAME },
    specFor: blueBirdSpec,
    required: false,
  },
];

/**
 * デブリ・ロケット機体を表すカタログ名のパターン。
 *
 * CelesTrak を名前で検索すると、衛星本体と一緒に
 * "SPACEMOBILE-001 DEB"（放出時に出た破片）のようなものまで返ってくる。
 *
 * これを衛星本体と同じ等級で扱うと、実際には肉眼で見えない小片を
 * 「0等級で見えます」と予報してしまう。名前で確実に除外する。
 */
const NON_PAYLOAD_PATTERN =
  /(\bDEB\b|DEBRIS|R\/B|ROCKET\s+BODY|\bCOVER\b|\bSHROUD\b|\bPLATFORM\b)/i;

/** カタログ名が衛星本体（ペイロード）を指しているか */
export function isPayloadName(objectName: string): boolean {
  return !NON_PAYLOAD_PATTERN.test(objectName);
}

/**
 * 軌道要素から衛星定義を解決する。
 *
 * NORAD ID だけでは BlueBird を判別できない（機数が増えるたびIDが変わる）ため、
 * カタログ名も見る。
 *
 * **未知の衛星には ISS の等級を流用してはいけない。**
 * ISSは -1.8 と非常に明るいので、流用すると暗い衛星を
 * 「金星より明るい」と予報してしまう。判別できないものは null を返す。
 */
export function resolveSatelliteSpec(
  noradId: string,
  objectName: string,
): SatelliteSpec | null {
  if (noradId === ISS_NORAD_ID) return ISS;
  if (noradId === CSS_NORAD_ID) return CSS;

  // 名前で判別するシリーズは、本体かどうかを必ず先に確かめる
  if (!isPayloadName(objectName)) return null;

  if (new RegExp(BLUEBIRD_CELESTRAK_NAME, 'i').test(objectName)) {
    return blueBirdSpec(noradId, objectName);
  }
  return null;
}

/** 通知対象になりうる衛星の種別かどうか */
export function isNotifiableKind(kind: SatelliteSpec['kind']): boolean {
  return kind === 'iss' || kind === 'css' || kind === 'bluebird';
}
