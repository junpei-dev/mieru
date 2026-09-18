/**
 * ドメインモデル定義
 *
 * 設計書 02-design.md 3章に対応。
 * ここで定義した型が PWA・通知バッチ・Worker の共通語彙になる。
 */

/** 地方区分。都道府県が47個あるので、選択UIでは一段挟まないと探せない */
export type RegionName =
  | '北海道・東北'
  | '関東'
  | '中部'
  | '近畿'
  | '中国・四国'
  | '九州・沖縄';

/** 観測地点 */
export interface ObserverSite {
  /** 地点ID（例: "miyazaki-shi"）。公開JSONのファイル名にもなる */
  id: string;
  /** 表示名（例: "宮崎県宮崎市"） */
  name: string;
  /** 都道府県名（例: "宮崎県"）。2段階選択のキー */
  prefecture: string;
  /** 市区町村名（例: "宮崎市"） */
  city: string;
  region: RegionName;
  latitudeDeg: number;
  longitudeDeg: number;
  /** 標高[m]。仰角計算にわずかに効くので保持する */
  altitudeM: number;
  /**
   * サーバ側で予報を事前生成している地点か。
   *
   * false の地点もアプリでは使える（ブラウザ内で計算する）。
   * ただし LINE 通知は事前生成された地点の軌道データを使うため、
   * 通知の際は最も近い true の地点にフォールバックする。
   */
  pregenerated: boolean;
}

/** 衛星の種別。通知方針と等級推定を分けるために使う */
export type SatelliteKind =
  | 'iss'
  | 'css'
  | 'bluebird'
  | 'starlink-train'
  | 'starlink-operational';

/** 追跡対象の衛星定義 */
export interface SatelliteSpec {
  /** NORAD カタログ番号（例: "25544"） */
  noradId: string;
  /** TLE 上の名前（例: "ISS (ZARYA)"） */
  name: string;
  /** 日本語表示名（例: "国際宇宙ステーション"） */
  displayName: string;
  kind: SatelliteKind;
  /**
   * 標準等級。「距離1000km・照らされ率50%」のときの見かけの等級。
   * 設計書 4.4 の式に range=1000, k=0.5 を入れると補正項が 0 になる定義。
   */
  standardMagnitude: number;
  /** 通知対象にするか（暗すぎる衛星は false） */
  notifiable: boolean;
}

/** 衛星の日照状態 */
export type IlluminationState = 'sunlit' | 'penumbra' | 'umbra';

export interface Illumination {
  state: IlluminationState;
  /** 0（完全な影）〜1（完全な日照）。半影の途中は中間値を取る */
  sunlitFraction: number;
}

/** パス上の1点（ある時刻の衛星の見え方） */
export interface TrackPoint {
  timeMs: number;
  /** 方位角[deg]。北=0, 東=90, 南=180, 西=270 */
  azimuthDeg: number;
  /** 仰角[deg]。地平線=0, 天頂=90 */
  elevationDeg: number;
  /** 観測者からの距離[km] */
  rangeKm: number;
  illumination: Illumination;
  /** 見かけの等級。影の中で光らない場合は null */
  magnitude: number | null;
}

/** 可視パス（地平線上に現れてから沈むまで） */
export interface Pass {
  /** 衛星ID＋最大仰角時刻(UTC分)で生成。再計算しても同一パスなら同じIDになる */
  id: string;
  noradId: string;
  satelliteName: string;
  /** 可視開始（AOS）*/
  start: TrackPoint;
  /** 最大仰角点（culmination）*/
  culmination: TrackPoint;
  /** 可視終了（LOS）*/
  end: TrackPoint;
  /** 地平線から地平線までの通過時間[秒] */
  durationSec: number;
  /**
   * 実際に光って見えている時間[秒]。
   *
   * ISS は通過の途中で地球の影に入り、そこでフッと消える。
   * 「10分間通過する」と「10分間見える」は別物で、後者のほうが短いことが多い。
   * ユーザーに伝えるべきなのも、スコアに使うべきなのもこちら。
   */
  visibleDurationSec: number;
  /** パス中で最も明るいときの等級 */
  peakMagnitude: number;
  /** 最大仰角時刻における観測地の太陽高度[deg]。負なら空が暗い */
  sunAltitudeAtCulminationDeg: number;
  /** 描画用の点列（等間隔サンプリング） */
  track: TrackPoint[];
}

/** 天気スナップショット（Open-Meteo 由来） */
export interface WeatherSnapshot {
  /** この天気情報を取得した時刻 */
  fetchedAtMs: number;
  /** どの時刻に対する予報か */
  forTimeMs: number;
  cloudTotalPct: number;
  cloudLowPct: number;
  cloudMidPct: number;
  cloudHighPct: number;
  visibilityM: number | null;
  precipitationProbabilityPct: number | null;
}

/** スコアの構成要素 */
export type ScoreFactorKey =
  | 'cloud'
  | 'elevation'
  | 'magnitude'
  | 'darkness'
  | 'hour'
  | 'duration';

export type Verdict = 'excellent' | 'good' | 'marginal' | 'poor';

export interface PassScore {
  /** 0〜100 の総合スコア */
  total: number;
  /** 各因子の値（0〜1）。乗算して total を作る */
  factors: Record<ScoreFactorKey, number>;
  /** 最も足を引っ張っている因子。「見えない理由」の表示に使う */
  limitingFactor: ScoreFactorKey | null;
  verdict: Verdict;
  /** 日本語の理由文（例: "雲量92%のため見込みは薄いです"） */
  reasonJa: string;
  /** 天気が取得できたか。false のときは通知してはいけない（FR-3.3） */
  weatherKnown: boolean;
}

/** アプリと通知が扱う最終形 */
export interface ScoredPass {
  pass: Pass;
  weather: WeatherSnapshot | null;
  score: PassScore;
}

/** 公開JSON: /data/passes/{locationId}.json */
export interface PassesDocument {
  schemaVersion: number;
  locationId: string;
  site: ObserverSite;
  generatedAtMs: number;
  validUntilMs: number;
  scoredPasses: ScoredPass[];
}

/** 公開JSON: /data/index.json */
export interface IndexDocument {
  schemaVersion: number;
  generatedAtMs: number;
  tleFetchedAtMs: number;
  /** NORAD ID → TLE元期(epoch)のミリ秒 */
  tleEpochs: Record<string, number>;
  locationIds: string[];
  notifyThreshold: number;
}

/** 3次元ベクトル（ECI / ECF 共通で使う。単位は km） */
export interface Vec3 {
  x: number;
  y: number;
  z: number;
}
