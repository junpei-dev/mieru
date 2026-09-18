/**
 * 予報の診断ツール
 *
 *   npm run diagnose --workspace @mieru/notifier -- miyazaki-shi
 *
 * 「なぜ今週は1件も見えないのか」を切り分けるためのもの。
 * 4段階のフィルタを順に適用し、どこで候補が消えたかを表示する。
 *
 * 0件という結果はバグかもしれないし、単に可視期間外かもしれない。
 * 両者を区別できないまま運用すると、壊れていることに気づけない。
 */

import {
  fetchElements,
  findPasses,
  findSite,
  formatJstDateTime,
  ISS,
  MS_PER_DAY,
  FORECAST_DAYS,
  azimuthToCompass8Ja,
} from '@mieru/core';
import type { ObserverSite, Pass } from '@mieru/core';

const politeFetch: typeof fetch = (input, init) =>
  fetch(input, {
    ...init,
    headers: {
      ...(init?.headers ?? {}),
      'User-Agent': 'mieru/0.1 (satellite visibility forecast; personal use)',
    },
  });

interface Stage {
  label: string;
  passes: Pass[];
}

async function main(): Promise<void> {
  const locationId = process.argv[2] ?? 'miyazaki-shi';
  const site = findSite(locationId);
  if (!site) {
    console.error(`地点が見つかりません: ${locationId}`);
    process.exitCode = 1;
    return;
  }

  const elements = await fetchElements(ISS.noradId, politeFetch);
  const startMs = Date.now();
  const endMs = startMs + FORECAST_DAYS * MS_PER_DAY;

  const base = {
    satrec: elements.satrec,
    spec: ISS,
    site: site as ObserverSite,
    startMs,
    endMs,
  };

  // フィルタを1段ずつ厳しくして、どこで候補が落ちるかを見る
  const stages: Stage[] = [
    {
      label: '① 地平線上を通過する（幾何的なパス）',
      passes: findPasses({
        ...base,
        minElevationDeg: 0,
        maxSunAltitudeDeg: 90,
        requireIlluminated: false,
      }),
    },
    {
      label: '② ＋ 最大仰角が10°以上（地物に隠れない）',
      passes: findPasses({
        ...base,
        maxSunAltitudeDeg: 90,
        requireIlluminated: false,
      }),
    },
    {
      label: '③ ＋ 観測地の空が暗い（太陽高度 −6°以下）',
      passes: findPasses({ ...base, requireIlluminated: false }),
    },
    {
      label: '④ ＋ 衛星が地球の影の外にいる（＝実際に見える）',
      passes: findPasses(base),
    },
  ];

  console.log(`\n${site.name} — ${FORECAST_DAYS}日間の絞り込み経過`);
  console.log(`起点 ${formatJstDateTime(startMs)}`);
  console.log(`TLE元期 ${formatJstDateTime(elements.epochMs)}\n`);

  let previous = stages[0]?.passes.length ?? 0;
  for (const [index, stage] of stages.entries()) {
    const count = stage.passes.length;
    const dropped = index === 0 ? 0 : previous - count;
    console.log(
      `${stage.label}: ${String(count).padStart(3)}件` +
        (index === 0 ? '' : `  (−${dropped})`),
    );
    previous = count;
  }

  const finalPasses = stages[3]?.passes ?? [];
  console.log('');

  if (finalPasses.length === 0) {
    const darkPasses = stages[2]?.passes ?? [];
    if (darkPasses.length > 0) {
      console.log('結論：夜間に頭上を通ってはいるが、すべて地球の影の中。');
      console.log('      ISSが光らないため肉眼では見えない＝可視期間外。');
      console.log('      これは正常な状態で、約2か月周期で可視期間が戻る。\n');
      console.log('  影の中を通過するパス（参考）:');
      for (const pass of darkPasses.slice(0, 5)) {
        console.log(
          `    ${formatJstDateTime(pass.culmination.timeMs)} ` +
            `最大${Math.round(pass.culmination.elevationDeg)}° ` +
            `${azimuthToCompass8Ja(pass.culmination.azimuthDeg)} ` +
            `[${pass.culmination.illumination.state}]`,
        );
      }
    } else if ((stages[1]?.passes.length ?? 0) > 0) {
      console.log('結論：頭上は通るが、すべて昼間の通過。');
      console.log('      空が明るいため見えない＝可視期間外。');
    } else {
      console.log('⚠ 幾何的なパスすら見つからない。計算が壊れている可能性が高い。');
    }
  } else {
    console.log(`結論：${finalPasses.length}件の可視パスあり。`);
    for (const pass of finalPasses) {
      console.log(
        `  ${formatJstDateTime(pass.start.timeMs)} ` +
          `最大${Math.round(pass.culmination.elevationDeg)}° ` +
          `${pass.peakMagnitude.toFixed(1)}等 ` +
          `${azimuthToCompass8Ja(pass.start.azimuthDeg)}から`,
      );
    }
  }
  console.log('');
}

main().catch((error: unknown) => {
  console.error('診断に失敗しました:', error);
  process.exitCode = 1;
});
