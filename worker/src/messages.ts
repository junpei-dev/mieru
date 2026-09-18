/**
 * LINE に送る文面
 *
 * 屋外でスマホを見る人が、1回読めば行動できる文章にする。
 * 数値を並べるだけでは足りないので、必ず
 *   「何時に」「どっちを向いて」「何が見えるか」
 * を言い切る。
 */

import {
  azimuthToCompass8Ja,
  describeCloudJa,
  describeMagnitudeJa,
  shortSatelliteNameJa,
  describePathJa,
  formatDurationJa,
  formatJstDate,
  formatJstTime,
  type ScoredPass,
} from '@mieru/core';

const DIVIDER = '────────────────';

function passLink(baseUrl: string, passId: string): string {
  return `${baseUrl}/pass/${encodeURIComponent(passId)}`;
}

/** 予告（観測日の朝に送る） */
export function advanceMessage(
  scored: ScoredPass,
  baseUrl: string,
  siteName: string,
): string {
  const { pass, weather } = scored;
  const direction = azimuthToCompass8Ja(pass.start.azimuthDeg);

  // ISS・天宮・BlueBird で明るさも見え方も違うので、どれが来るかを必ず書く
  const satellite = shortSatelliteNameJa(pass.satelliteName);

  const lines = [
    `🛰 今夜、${satellite}が見えます`,
    '',
    pass.satelliteName !== satellite ? `（${pass.satelliteName}）` : '',
    `${formatJstDate(pass.start.timeMs)} ${formatJstTime(pass.start.timeMs)} 〜 ${formatJstTime(pass.end.timeMs)}`,
    `（${siteName}）`,
    DIVIDER,
    `最大仰角  ${Math.round(pass.culmination.elevationDeg)}°`,
    `経路      ${describePathJa(
      pass.start.azimuthDeg,
      pass.culmination.azimuthDeg,
      pass.culmination.elevationDeg,
      pass.end.azimuthDeg,
    )}`,
    `明るさ    ${pass.peakMagnitude.toFixed(1)}等（${describeMagnitudeJa(pass.peakMagnitude)}）`,
    `見える時間 ${formatDurationJa(pass.visibleDurationSec)}`,
  ];

  if (weather) {
    lines.push(
      `雲量      ${Math.round(weather.cloudTotalPct)}%（${describeCloudJa(weather.cloudTotalPct)}）`,
    );
  }

  lines.push(
    DIVIDER,
    '',
    `${formatJstTime(pass.start.timeMs)} に ${direction} の空を見上げてください。`,
    'ゆっくり動く明るい星のように見えます。',
    '点滅する光は飛行機なので別物です。',
  );

  // 途中で影に入って消えるパスは、それを予告しておく。
  // 言っておかないと「雲に隠れた」「見失った」と誤解される
  if (pass.visibleDurationSec < pass.durationSec - 30) {
    lines.push(
      '',
      `※ ${formatDurationJa(pass.visibleDurationSec)}ほどで地球の影に入り、そこで消えます。`,
    );
  }

  lines.push('', '▶ 軌道を見る', passLink(baseUrl, pass.id));
  return lines.join('\n');
}

/** リマインド（開始30分前） */
export function reminderMessage(
  scored: ScoredPass,
  baseUrl: string,
): string {
  const { pass, weather } = scored;
  const direction = azimuthToCompass8Ja(pass.start.azimuthDeg);

  return [
    `⏰ まもなく${shortSatelliteNameJa(pass.satelliteName)}が通ります`,
    '',
    `${formatJstTime(pass.start.timeMs)}、${direction} の空。`,
    `最大 ${Math.round(pass.culmination.elevationDeg)}°まで昇ります。`,
    weather
      ? `雲量 ${Math.round(weather.cloudTotalPct)}%、条件は良好です。`
      : '',
    '',
    `▶ ${baseUrl}/`,
  ]
    .filter((line) => line !== '')
    .join('\n');
}

/** 中止（予告後に天気が崩れた場合） */
export function cancelMessage(
  scored: ScoredPass,
  previousCloudPct: number,
  nextChance: ScoredPass | null,
): string {
  const cloudNow = scored.weather
    ? Math.round(scored.weather.cloudTotalPct)
    : null;

  const lines = [
    '☁ 今夜の観測は中止です',
    '',
    cloudNow !== null
      ? `雲が増えました（${Math.round(previousCloudPct)}% → ${cloudNow}%）。`
      : '天気の条件が悪化しました。',
  ];

  if (nextChance) {
    lines.push(
      '',
      `次のチャンスは ${formatJstDate(nextChance.pass.start.timeMs)} ${formatJstTime(nextChance.pass.start.timeMs)} です。`,
    );
  }
  return lines.join('\n');
}

/** 友だち追加時の案内。reply で返すので無料枠を消費しない */
export function welcomeMessage(baseUrl: string): string {
  return [
    '友だち追加ありがとうございます 🛰',
    '',
    'このアカウントは、国際宇宙ステーション（ISS）が',
    'あなたの地域の空に「はっきり見える日」だけをお知らせします。',
    '',
    '・見える日の朝に予告',
    '・通過の30分前にリマインド',
    '・条件が悪い日は通知しません',
    '',
    'まず、お住まいの市区町村を教えてください。',
    '例：「宮崎市」「延岡市」「札幌市」',
    '',
    `▶ 軌道はこちらで確認できます\n${baseUrl}/`,
  ].join('\n');
}

/** 地点登録の確認 */
export function locationSetMessage(siteName: string): string {
  return [
    `観測地点を「${siteName}」に設定しました。`,
    '',
    '条件が揃った日にお知らせします。',
    'しばらく通知が来なくても故障ではありません。',
    'ISSがはっきり見える期間は、約2か月ごとに1〜2週間だけ訪れます。',
  ].join('\n');
}

/** 地名が解決できなかったとき */
export function locationNotFoundMessage(query: string): string {
  return [
    `「${query}」に一致する地点が見つかりませんでした。`,
    '',
    '市区町村名で送ってください。',
    '例：「宮崎市」「都城市」「延岡市」「東京」「札幌市」',
  ].join('\n');
}

/** 運用警告（管理者だけに送る） */
export function adminAlertMessage(reason: string): string {
  return `⚠ ミエル 運用警告\n\n${reason}`;
}
