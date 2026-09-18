/**
 * 軌道計算を行う Web Worker
 *
 * 7日分のパス探索は2万回のSGP4伝播を伴い、メインスレッドで動かすと
 * 数百ミリ秒〜1秒 UI が固まる。スクロールが引っかかるだけで
 * 「重いアプリ」という印象になるので、必ず別スレッドで走らせる（NFR-2）。
 *
 * この Worker が使われるのは、サーバの事前計算JSONが
 * 手に入らないか古い場合だけ（縮退運転・NFR-4）。
 */

import {
  buildForecast,
  fetchWeatherSeries,
  fromMirror,
  FORECAST_DAYS,
} from '@mieru/core';
import type { ObserverSite, PassesDocument, TleMirror } from '@mieru/core';

export interface ForecastRequest {
  type: 'forecast';
  site: ObserverSite;
  /** TLEミラーのURL。取得できなければ計算できない */
  tleUrl: string;
}

export type ForecastResponse =
  | { type: 'ok'; document: PassesDocument }
  | { type: 'error'; message: string };

self.addEventListener('message', (event: MessageEvent<ForecastRequest>) => {
  const request = event.data;
  if (request?.type !== 'forecast') return;

  void (async () => {
    try {
      const response = await fetch(request.tleUrl);
      if (!response.ok) {
        throw new Error(`軌道要素を取得できません (HTTP ${response.status})`);
      }
      const mirror = (await response.json()) as TleMirror;
      const elements = fromMirror(mirror);

      // 天気は取れなくても続行する。score.weatherKnown が false になるだけ
      const weather = await fetchWeatherSeries(request.site, FORECAST_DAYS);

      const document = await buildForecast({
        site: request.site,
        elements,
        days: FORECAST_DAYS,
        weather,
      });

      const message: ForecastResponse = { type: 'ok', document };
      self.postMessage(message);
    } catch (error) {
      const message: ForecastResponse = {
        type: 'error',
        message: error instanceof Error ? error.message : String(error),
      };
      self.postMessage(message);
    }
  })();
});
