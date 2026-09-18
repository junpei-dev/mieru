/**
 * 観測地点マスタ（全国）
 *
 * 座標は各市の市役所・県庁付近の概略値。
 * 数kmの誤差があっても、高度400kmのISSの方位角は1°も変わらないので実用上は十分。
 * 個人宅の正確な座標をサーバに置かないためにも、あえて市区町村単位に丸めている（NFR-7）。
 *
 * `pregenerated: true` の地点だけ、サーバ側で7日分の予報を事前生成している。
 * それ以外の地点はアプリがブラウザ内で計算する（体感0.5〜1秒）。
 * 全地点を事前生成しないのは、リポジトリにコミットするJSONが膨らみすぎるため。
 */

import type { ObserverSite, RegionName } from './types.js';

/** 定義を短く書くためのタプル。[id, 都道府県, 市区町村, 緯度, 経度, 標高m, 事前生成?] */
type Seed = [
  id: string,
  prefecture: string,
  city: string,
  lat: number,
  lon: number,
  altM: number,
  pregenerated?: boolean,
];

/** 地方ごとの定義。県庁所在地は事前生成の対象にしている */
const SEEDS: Record<RegionName, Seed[]> = {
  '北海道・東北': [
    ['sapporo', '北海道', '札幌市', 43.0621, 141.3544, 25, true],
    ['hakodate', '北海道', '函館市', 41.7687, 140.7291, 15],
    ['asahikawa', '北海道', '旭川市', 43.7708, 142.365, 115],
    ['kushiro', '北海道', '釧路市', 42.9849, 144.3817, 10],
    ['aomori', '青森県', '青森市', 40.8244, 140.74, 5, true],
    ['hachinohe', '青森県', '八戸市', 40.5124, 141.4883, 20],
    ['morioka', '岩手県', '盛岡市', 39.7036, 141.1527, 140, true],
    ['sendai', '宮城県', '仙台市', 38.2688, 140.8721, 40, true],
    ['akita', '秋田県', '秋田市', 39.7186, 140.1024, 10, true],
    ['yamagata', '山形県', '山形市', 38.2404, 140.3633, 150, true],
    ['fukushima', '福島県', '福島市', 37.7503, 140.4676, 70, true],
    ['koriyama', '福島県', '郡山市', 37.4005, 140.3597, 240],
  ],

  関東: [
    ['mito', '茨城県', '水戸市', 36.3418, 140.4468, 30, true],
    ['utsunomiya', '栃木県', '宇都宮市', 36.5657, 139.8836, 120, true],
    ['maebashi', '群馬県', '前橋市', 36.3907, 139.0604, 110, true],
    ['saitama', '埼玉県', 'さいたま市', 35.857, 139.6489, 10, true],
    ['kawagoe', '埼玉県', '川越市', 35.9251, 139.4858, 20],
    ['chiba', '千葉県', '千葉市', 35.605, 140.1233, 5, true],
    ['funabashi', '千葉県', '船橋市', 35.6947, 139.9825, 5],
    ['tokyo', '東京都', '新宿区', 35.6895, 139.6917, 40, true],
    ['hachioji', '東京都', '八王子市', 35.6664, 139.316, 120],
    ['yokohama', '神奈川県', '横浜市', 35.4478, 139.6425, 15, true],
    ['kawasaki', '神奈川県', '川崎市', 35.5308, 139.7029, 10],
  ],

  中部: [
    ['niigata', '新潟県', '新潟市', 37.9026, 139.0234, 5, true],
    ['nagaoka', '新潟県', '長岡市', 37.4462, 138.8512, 20],
    ['toyama', '富山県', '富山市', 36.6953, 137.2114, 10, true],
    ['kanazawa', '石川県', '金沢市', 36.5947, 136.6256, 30, true],
    ['fukui', '福井県', '福井市', 36.0652, 136.2216, 10, true],
    ['kofu', '山梨県', '甲府市', 35.6642, 138.5686, 270, true],
    ['nagano', '長野県', '長野市', 36.6513, 138.181, 370, true],
    ['matsumoto', '長野県', '松本市', 36.238, 137.9721, 590],
    ['gifu', '岐阜県', '岐阜市', 35.3912, 136.7223, 15, true],
    ['shizuoka', '静岡県', '静岡市', 34.9769, 138.3831, 15, true],
    ['hamamatsu', '静岡県', '浜松市', 34.7108, 137.7261, 15],
    ['nagoya', '愛知県', '名古屋市', 35.1802, 136.9066, 15, true],
    ['toyohashi', '愛知県', '豊橋市', 34.7692, 137.3914, 10],
  ],

  近畿: [
    ['tsu', '三重県', '津市', 34.7303, 136.5086, 5, true],
    ['otsu', '滋賀県', '大津市', 35.0045, 135.8686, 90, true],
    ['kyoto', '京都府', '京都市', 35.0212, 135.7556, 30, true],
    ['osaka', '大阪府', '大阪市', 34.6863, 135.52, 10, true],
    ['sakai', '大阪府', '堺市', 34.5733, 135.483, 10],
    ['kobe', '兵庫県', '神戸市', 34.6913, 135.183, 20, true],
    ['himeji', '兵庫県', '姫路市', 34.8154, 134.6854, 15],
    ['nara', '奈良県', '奈良市', 34.6851, 135.8048, 100, true],
    ['wakayama', '和歌山県', '和歌山市', 34.2261, 135.1675, 10, true],
  ],

  '中国・四国': [
    ['tottori', '鳥取県', '鳥取市', 35.5039, 134.2377, 10, true],
    ['matsue', '島根県', '松江市', 35.4723, 133.0505, 5, true],
    ['okayama', '岡山県', '岡山市', 34.6618, 133.935, 10, true],
    ['kurashiki', '岡山県', '倉敷市', 34.585, 133.7722, 10],
    ['hiroshima', '広島県', '広島市', 34.3963, 132.4596, 10, true],
    ['fukuyama', '広島県', '福山市', 34.4858, 133.3625, 10],
    ['yamaguchi', '山口県', '山口市', 34.1859, 131.4714, 20, true],
    ['tokushima', '徳島県', '徳島市', 34.0658, 134.5593, 5, true],
    ['takamatsu', '香川県', '高松市', 34.3401, 134.0434, 10, true],
    ['matsuyama', '愛媛県', '松山市', 33.8417, 132.7657, 30, true],
    ['kochi', '高知県', '高知市', 33.5597, 133.5311, 5, true],
  ],

  '九州・沖縄': [
    ['fukuoka', '福岡県', '福岡市', 33.6064, 130.4181, 10, true],
    ['kitakyushu', '福岡県', '北九州市', 33.8834, 130.8752, 10],
    ['kurume', '福岡県', '久留米市', 33.3192, 130.5083, 10],
    ['saga', '佐賀県', '佐賀市', 33.2494, 130.2988, 5, true],
    ['nagasaki', '長崎県', '長崎市', 32.7448, 129.8737, 25, true],
    ['sasebo', '長崎県', '佐世保市', 33.1799, 129.7148, 10],
    ['kumamoto', '熊本県', '熊本市', 32.7898, 130.7417, 25, true],
    ['oita', '大分県', '大分市', 33.2382, 131.6126, 15, true],

    // 宮崎県は主な利用者の居住地なので全市を登録し、すべて事前生成する
    ['miyazaki-shi', '宮崎県', '宮崎市', 31.9111, 131.4239, 15, true],
    ['miyakonojo', '宮崎県', '都城市', 31.7197, 131.0614, 150, true],
    ['nobeoka', '宮崎県', '延岡市', 32.5822, 131.6653, 20, true],
    ['nichinan', '宮崎県', '日南市', 31.6019, 131.3789, 15, true],
    ['kobayashi', '宮崎県', '小林市', 31.9964, 130.9725, 220, true],
    ['hyuga', '宮崎県', '日向市', 32.4231, 131.6244, 15, true],
    ['kushima', '宮崎県', '串間市', 31.4681, 131.2372, 20, true],
    ['saito', '宮崎県', '西都市', 32.1094, 131.4014, 40, true],
    ['ebino', '宮崎県', 'えびの市', 32.0475, 130.8122, 230, true],

    ['kagoshima', '鹿児島県', '鹿児島市', 31.5602, 130.5581, 10, true],
    ['kanoya', '鹿児島県', '鹿屋市', 31.3783, 130.8522, 30],
    ['naha', '沖縄県', '那覇市', 26.2124, 127.6809, 30, true],
    ['ishigaki', '沖縄県', '石垣市', 24.3406, 124.1556, 15],
  ],
};

/** 地方の表示順。UIのタブ順もこれに従う */
export const REGIONS: RegionName[] = [
  '北海道・東北',
  '関東',
  '中部',
  '近畿',
  '中国・四国',
  '九州・沖縄',
];

function buildSites(): ObserverSite[] {
  const sites: ObserverSite[] = [];
  for (const region of REGIONS) {
    for (const [
      id,
      prefecture,
      city,
      lat,
      lon,
      altM,
      pregenerated,
    ] of SEEDS[region]) {
      sites.push({
        id,
        name: `${prefecture}${city}`,
        prefecture,
        city,
        region,
        latitudeDeg: lat,
        longitudeDeg: lon,
        altitudeM: altM,
        pregenerated: pregenerated === true,
      });
    }
  }
  return sites;
}

/** 選択可能な全地点 */
export const ALL_SITES: ObserverSite[] = buildSites();

/** サーバ側で予報を事前生成する地点 */
export const PREGENERATED_SITES: ObserverSite[] = ALL_SITES.filter(
  (site) => site.pregenerated,
);

/** 既定の地点（本人の居住地） */
export const DEFAULT_SITE_ID = 'miyazaki-shi';

/** 地方 → その地方に属する都道府県名（登録順を保つ） */
export function prefecturesInRegion(region: RegionName): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const site of ALL_SITES) {
    if (site.region !== region || seen.has(site.prefecture)) continue;
    seen.add(site.prefecture);
    result.push(site.prefecture);
  }
  return result;
}

/** 都道府県 → その県に登録されている市区町村 */
export function sitesInPrefecture(prefecture: string): ObserverSite[] {
  return ALL_SITES.filter((site) => site.prefecture === prefecture);
}

/** IDから地点を引く */
export function findSite(id: string): ObserverSite | null {
  return ALL_SITES.find((site) => site.id === id) ?? null;
}

/** 既定地点。必ず存在する */
export function defaultSite(): ObserverSite {
  const site = findSite(DEFAULT_SITE_ID);
  if (!site) throw new Error('既定地点が定義されていません');
  return site;
}

/**
 * 緯度経度に最も近い地点を返す。
 *
 * 端末のGPSから現在地を取得したとき、および
 * LINEで位置情報を送られたときの解決に使う。
 *
 * 日本国内の距離比較にしか使わないので、球面距離ではなく
 * 緯度1度≒111km、経度1度≒111km×cos(緯度) の近似で十分。
 *
 * @param onlyPregenerated true なら事前生成済みの地点だけから選ぶ
 */
export function findNearestSite(
  latitudeDeg: number,
  longitudeDeg: number,
  onlyPregenerated = false,
): ObserverSite {
  const candidates = onlyPregenerated ? PREGENERATED_SITES : ALL_SITES;
  const latScale = 111;
  const lonScale = 111 * Math.cos((latitudeDeg * Math.PI) / 180);

  let nearest = defaultSite();
  let bestDistance = Number.POSITIVE_INFINITY;

  for (const site of candidates) {
    const dy = (site.latitudeDeg - latitudeDeg) * latScale;
    const dx = (site.longitudeDeg - longitudeDeg) * lonScale;
    const distance = dy * dy + dx * dx; // 平方のまま比較すれば sqrt は不要
    if (distance < bestDistance) {
      bestDistance = distance;
      nearest = site;
    }
  }
  return nearest;
}

/**
 * ある地点の軌道予報として使える、最も近い事前生成済み地点を返す。
 *
 * LINE通知は Cloudflare Worker から送るが、Worker は CPU 10ms 制限のため
 * 軌道計算ができない。事前生成済みJSONを読むしかないので、
 * 未生成の地点を登録したユーザーには最寄りの生成済み地点の軌道を使う。
 *
 * 数十km離れても ISS のパス時刻は数秒しか変わらないので実用上問題ない。
 * ただし天気は場所で変わるため、天気だけはユーザー本人の地点で取り直すこと。
 */
export function pregeneratedSiteFor(site: ObserverSite): ObserverSite {
  if (site.pregenerated) return site;
  return findNearestSite(site.latitudeDeg, site.longitudeDeg, true);
}

/**
 * 地名の文字列から地点を探す。LINEのテキストメッセージ解決に使う。
 *
 * 「宮崎市」「宮崎県」「宮崎」いずれでも引けるようにする。
 * 県名だけを送られた場合は県庁所在地を返す。
 */
export function findSiteByName(query: string): ObserverSite | null {
  const normalized = query.trim().replace(/\s+/g, '');
  if (normalized.length === 0) return null;

  // 1. 市区町村名の完全一致（「宮崎市」）
  const exactCity = ALL_SITES.find((site) => site.city === normalized);
  if (exactCity) return exactCity;

  // 2. 都道府県名の完全一致 → その県で最初に定義した地点（＝県庁所在地）
  const exactPrefecture = ALL_SITES.find(
    (site) => site.prefecture === normalized,
  );
  if (exactPrefecture) return exactPrefecture;

  // 3. 表示名の部分一致（「宮崎県宮崎」など）
  const partial = ALL_SITES.find((site) => site.name.includes(normalized));
  if (partial) return partial;

  // 4. 「市」「県」を落として再挑戦（「宮崎」→ 宮崎市）
  const stripped = normalized.replace(/[都道府県市区町村]$/u, '');
  if (stripped.length > 0 && stripped !== normalized) {
    return (
      ALL_SITES.find((site) => site.city.startsWith(stripped)) ??
      ALL_SITES.find((site) => site.prefecture.startsWith(stripped)) ??
      null
    );
  }
  return (
    ALL_SITES.find((site) => site.city.startsWith(normalized)) ??
    ALL_SITES.find((site) => site.prefecture.startsWith(normalized)) ??
    null
  );
}

/** ID から地点IDの一覧（公開JSONの index 用） */
export function pregeneratedSiteIds(): string[] {
  return PREGENERATED_SITES.map((site) => site.id);
}
