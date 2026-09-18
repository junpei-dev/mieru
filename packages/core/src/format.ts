/**
 * 表示用の書式化
 *
 * 「方位角225.3°」ではなく「南西」と伝える。
 * 天文に詳しくない人が屋外で読む前提なので、数値より言葉を優先する。
 */

/** 16方位の和名。北を0番として時計回り */
const COMPASS_16_JA = [
  '北', '北北東', '北東', '東北東',
  '東', '東南東', '南東', '南南東',
  '南', '南南西', '南西', '西南西',
  '西', '西北西', '北西', '北北西',
] as const;

/** 8方位の和名（通知文で使う。16方位は口頭で伝えにくい） */
const COMPASS_8_JA = [
  '北', '北東', '東', '南東',
  '南', '南西', '西', '北西',
] as const;

/** 方位角[deg] → 16方位の和名（例: 225 → "南西"） */
export function azimuthToCompass16Ja(azimuthDeg: number): string {
  const normalized = ((azimuthDeg % 360) + 360) % 360;
  const index = Math.round(normalized / 22.5) % 16;
  return COMPASS_16_JA[index] ?? '北';
}

/** 方位角[deg] → 8方位の和名。通知文にはこちらを使う */
export function azimuthToCompass8Ja(azimuthDeg: number): string {
  const normalized = ((azimuthDeg % 360) + 360) % 360;
  const index = Math.round(normalized / 45) % 8;
  return COMPASS_8_JA[index] ?? '北';
}

/**
 * 仰角を言葉にする。
 * 「68°」と言われてもピンとこないので、腕を伸ばした感覚に置き換える。
 */
export function describeElevationJa(elevationDeg: number): string {
  if (elevationDeg >= 80) return 'ほぼ真上';
  if (elevationDeg >= 60) return 'かなり高い';
  if (elevationDeg >= 40) return '高め';
  if (elevationDeg >= 25) return 'やや低い';
  return '低い（建物に隠れるかも）';
}

/**
 * パスの経路を「南西 → ほぼ真上 → 北東」の形で表す。
 * 空のどこをどう動くかが一目で分かる。
 */
export function describePathJa(
  startAzimuthDeg: number,
  culminationAzimuthDeg: number,
  culminationElevationDeg: number,
  endAzimuthDeg: number,
): string {
  const start = azimuthToCompass8Ja(startAzimuthDeg);
  const end = azimuthToCompass8Ja(endAzimuthDeg);
  // 天頂近くを通る場合は方位を言っても意味がない（真上は方角を持たない）
  const middle =
    culminationElevationDeg >= 75
      ? 'ほぼ真上'
      : azimuthToCompass8Ja(culminationAzimuthDeg);
  return `${start} → ${middle} → ${end}`;
}

/** 秒数を「6分12秒」の形にする */
export function formatDurationJa(seconds: number): string {
  const min = Math.floor(seconds / 60);
  const sec = Math.round(seconds % 60);
  if (min === 0) return `${sec}秒`;
  return sec === 0 ? `${min}分` : `${min}分${sec}秒`;
}

/**
 * 見出しや通知文で使う短い呼び名。
 *
 * 「国際宇宙ステーション」は正式だが長すぎて、
 * 「今夜は国際宇宙ステーションが見えます」だと見出しが窮屈になる。
 * 一覧やカードには正式名（displayName）をそのまま使う。
 */
export function shortSatelliteNameJa(displayName: string): string {
  if (displayName.includes('国際宇宙ステーション')) return 'ISS';
  if (displayName.includes('天宮')) return '天宮';
  if (displayName.startsWith('BlueBird')) return 'BlueBird';
  if (displayName.includes('Starlink')) return 'Starlink';
  return displayName;
}

/** 雲量を言葉にする */
export function describeCloudJa(cloudPct: number): string {
  if (cloudPct <= 10) return '快晴';
  if (cloudPct <= 30) return 'おおむね晴れ';
  if (cloudPct <= 60) return '雲が多い';
  if (cloudPct <= 85) return 'ほぼ曇り';
  return '曇り';
}
