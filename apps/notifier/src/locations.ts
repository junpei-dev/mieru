/**
 * 予報を事前生成する地点
 *
 * 対象は `pregenerated: true` の地点＝各都道府県庁所在地＋宮崎県の全市。
 * ここで生成した JSON だけが Cloudflare Pages から配信され、
 * Cloudflare Worker（LINE通知）が読める。
 *
 * アプリ側はこれ以外の地点も選べる。事前生成が無ければブラウザ内で計算する
 * （縮退運転・NFR-4）ので、UIの選択肢を増やしてもここを増やす必要はない。
 *
 * 目安：1地点あたり計算 約0.3秒／JSON gzip後 約5KB。
 */

import { PREGENERATED_SITES } from '@mieru/core';
import type { ObserverSite } from '@mieru/core';

export const FORECAST_SITES: ObserverSite[] = PREGENERATED_SITES;
