/**
 * PWA アイコンの生成
 *
 *   npm run icons --workspace @mieru/web
 *
 * public/icons/favicon.svg を元に PNG を書き出す。
 * iOS のホーム画面追加は PNG しか受け付けないため、SVG だけでは足りない。
 *
 * maskable 版は余白を広く取る。Android はアイコンを円や角丸四角に
 * 切り抜くので、外周まで絵が詰まっていると端が欠ける。
 * 安全領域は中央80%とされているので、絵を 76% に縮めて配置する。
 */

import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const HERE = dirname(fileURLToPath(import.meta.url));
const ICONS_DIR = join(HERE, '../public/icons');

/** 夜空の背景色。manifest の background_color と揃える */
const BACKGROUND = { r: 5, g: 7, b: 13, alpha: 1 };

async function main(): Promise<void> {
  const svg = await readFile(join(ICONS_DIR, 'favicon.svg'));

  // 通常アイコン：そのまま指定サイズへ
  for (const size of [192, 512]) {
    const png = await sharp(svg, { density: 384 })
      .resize(size, size)
      .png({ compressionLevel: 9 })
      .toBuffer();
    await writeFile(join(ICONS_DIR, `icon-${size}.png`), png);
    console.log(`icon-${size}.png (${(png.length / 1024).toFixed(1)}KB)`);
  }

  // maskable：安全領域に収まるよう縮小して中央に置く
  const MASKABLE_SIZE = 512;
  const inner = Math.round(MASKABLE_SIZE * 0.76);
  const offset = Math.round((MASKABLE_SIZE - inner) / 2);

  const innerPng = await sharp(svg, { density: 384 })
    .resize(inner, inner)
    .png()
    .toBuffer();

  const maskable = await sharp({
    create: {
      width: MASKABLE_SIZE,
      height: MASKABLE_SIZE,
      channels: 4,
      background: BACKGROUND,
    },
  })
    .composite([{ input: innerPng, top: offset, left: offset }])
    .png({ compressionLevel: 9 })
    .toBuffer();

  await writeFile(join(ICONS_DIR, 'icon-maskable-512.png'), maskable);
  console.log(
    `icon-maskable-512.png (${(maskable.length / 1024).toFixed(1)}KB)`,
  );
}

main().catch((error: unknown) => {
  console.error('アイコン生成に失敗しました:', error);
  process.exitCode = 1;
});
