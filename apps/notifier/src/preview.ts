/**
 * 生成済み予報を人が読める形で表示する確認用スクリプト
 *
 *   npm run preview --workspace @mieru/notifier -- miyazaki-shi
 *
 * 予報が実際の空と合っているかを目で確かめるために使う。
 * 最終的な検証は「実際に空を見て当たっているか」なので、この出力を持って外に出る。
 */

import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  azimuthToCompass8Ja,
  describeCloudJa,
  describeElevationJa,
  describeMagnitudeJa,
  describePathJa,
  formatDurationJa,
  formatJstDate,
  formatJstTime,
  groupByJstDate,
  DEFAULT_SITE_ID,
} from '@mieru/core';
import type { PassesDocument } from '@mieru/core';

const HERE = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(HERE, '../../web/public/data');

const VERDICT_LABEL: Record<string, string> = {
  excellent: '◎ 通知対象',
  good: '○ 見込みあり',
  marginal: '△ 条件次第',
  poor: '× 期待薄',
};

async function main(): Promise<void> {
  const locationId = process.argv[2] ?? DEFAULT_SITE_ID;
  const path = join(DATA_DIR, `passes/${locationId}.json`);

  const document = JSON.parse(
    await readFile(path, 'utf8'),
  ) as PassesDocument;

  console.log(`\n${document.site.name} — ISS 7日間予報`);
  console.log(
    `生成 ${formatJstDate(document.generatedAtMs)} ${formatJstTime(document.generatedAtMs)} / 可視パス ${document.scoredPasses.length}件\n`,
  );

  if (document.scoredPasses.length === 0) {
    console.log('  この期間に見えるパスはありません。');
    console.log('  ISSの可視期間は約2か月ごとにまとまって訪れます。\n');
    return;
  }

  for (const group of groupByJstDate(document.scoredPasses)) {
    const first = group.passes[0];
    if (!first) continue;
    console.log(`── ${formatJstDate(first.pass.culmination.timeMs)} ──`);

    for (const { pass, weather, score } of group.passes) {
      const cloud = weather
        ? `雲量${Math.round(weather.cloudTotalPct)}%(${describeCloudJa(weather.cloudTotalPct)})`
        : '天気不明';

      console.log(
        `  ${formatJstTime(pass.start.timeMs)}→${formatJstTime(pass.end.timeMs)} ` +
          `${String(score.total).padStart(3)}点 ${VERDICT_LABEL[score.verdict] ?? ''}`,
      );
      console.log(
        `    ${describePathJa(pass.start.azimuthDeg, pass.culmination.azimuthDeg, pass.culmination.elevationDeg, pass.end.azimuthDeg)}` +
          ` / 最大${Math.round(pass.culmination.elevationDeg)}°(${describeElevationJa(pass.culmination.elevationDeg)})` +
          ` / ${pass.peakMagnitude.toFixed(1)}等(${describeMagnitudeJa(pass.peakMagnitude)})`,
      );
      console.log(
        `    ${formatDurationJa(pass.durationSec)} / ${cloud}` +
          ` / 太陽高度${Math.round(pass.sunAltitudeAtCulminationDeg)}°` +
          ` / 開始方位 ${azimuthToCompass8Ja(pass.start.azimuthDeg)}`,
      );
      if (score.verdict !== 'excellent') {
        console.log(`    → ${score.reasonJa}`);
      }
    }
    console.log('');
  }
}

main().catch((error: unknown) => {
  console.error('表示に失敗しました:', error);
  process.exitCode = 1;
});
