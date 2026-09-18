/**
 * 予報の取得フック
 *
 * 取得の優先順位:
 *   1. サーバが事前計算した JSON（速い・軽い。通常はこれ）
 *   2. 手に入らない／古い場合は Web Worker でブラウザ内計算（縮退運転・NFR-4）
 *
 * バックエンドが全部落ちてもアプリが死なないことが狙い。
 * 衛星の軌道は誰かのサーバがなくても計算できる種類の情報なので、
 * サーバ依存にする理由がない。
 */

import { useEffect, useRef, useState } from 'react';
import type { ObserverSite, PassesDocument } from '@mieru/core';
import type {
  ForecastRequest,
  ForecastResponse,
} from '../workers/forecast.worker.js';

/** 予報データの出どころ。UI に鮮度と一緒に出す */
export type ForecastSource = 'server' | 'local' | 'cache';

export interface ForecastState {
  document: PassesDocument | null;
  source: ForecastSource | null;
  loading: boolean;
  error: string | null;
}

const TLE_URL = '/data/tle/tracked.json';

/** サーバJSONがこれ以上古ければ、自力計算に切り替える */
const MAX_SERVER_AGE_MS = 36 * 60 * 60 * 1000;

async function fetchServerForecast(
  siteId: string,
): Promise<PassesDocument | null> {
  try {
    const response = await fetch(`/data/passes/${siteId}.json`, {
      cache: 'no-cache',
    });
    if (!response.ok) return null;

    const document = (await response.json()) as PassesDocument;
    // 古すぎる予報は使わない。軌道要素が古いと方角がずれる
    if (Date.now() - document.generatedAtMs > MAX_SERVER_AGE_MS) return null;
    return document;
  } catch {
    return null;
  }
}

function computeLocally(site: ObserverSite): Promise<PassesDocument> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(
      new URL('../workers/forecast.worker.ts', import.meta.url),
      { type: 'module' },
    );

    const cleanup = () => worker.terminate();

    worker.addEventListener(
      'message',
      (event: MessageEvent<ForecastResponse>) => {
        const result = event.data;
        cleanup();
        if (result.type === 'ok') resolve(result.document);
        else reject(new Error(result.message));
      },
    );

    worker.addEventListener('error', (event) => {
      cleanup();
      reject(new Error(event.message || '計算に失敗しました'));
    });

    const request: ForecastRequest = {
      type: 'forecast',
      site,
      tleUrl: TLE_URL,
    };
    worker.postMessage(request);
  });
}

export function useForecast(site: ObserverSite | null): ForecastState {
  const [state, setState] = useState<ForecastState>({
    document: null,
    source: null,
    loading: true,
    error: null,
  });

  // 地点を切り替えたとき、古い結果が一瞬表示されるのを防ぐ
  const requestIdRef = useRef(0);

  useEffect(() => {
    if (!site) return;

    const requestId = ++requestIdRef.current;
    setState((previous) => ({ ...previous, loading: true, error: null }));

    void (async () => {
      const server = await fetchServerForecast(site.id);
      if (requestId !== requestIdRef.current) return;

      if (server) {
        setState({
          document: server,
          source: 'server',
          loading: false,
          error: null,
        });
        return;
      }

      try {
        const local = await computeLocally(site);
        if (requestId !== requestIdRef.current) return;
        setState({
          document: local,
          source: 'local',
          loading: false,
          error: null,
        });
      } catch (error) {
        if (requestId !== requestIdRef.current) return;
        setState({
          document: null,
          source: null,
          loading: false,
          error:
            error instanceof Error
              ? error.message
              : '予報を取得できませんでした',
        });
      }
    })();
  }, [site]);

  return state;
}
