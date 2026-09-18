/**
 * 端末内の設定保存
 *
 * 位置情報はサーバに送らない（NFR-7）。localStorage にだけ置く。
 * 予報は「市区町村」単位で事前生成されたものを使うので、
 * 個人宅の座標をどこかに送る必要がそもそもない。
 */

import { DEFAULT_SITE_ID, NOTIFY_SCORE_THRESHOLD } from '@mieru/core';

const KEY = 'mieru.settings.v1';

export interface Settings {
  siteId: string;
  /** 通知・強調表示のしきい値 */
  threshold: number;
}

const DEFAULTS: Settings = {
  siteId: DEFAULT_SITE_ID,
  threshold: NOTIFY_SCORE_THRESHOLD,
};

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULTS;
    const parsed = JSON.parse(raw) as Partial<Settings>;
    return {
      siteId: typeof parsed.siteId === 'string' ? parsed.siteId : DEFAULTS.siteId,
      threshold:
        typeof parsed.threshold === 'number'
          ? parsed.threshold
          : DEFAULTS.threshold,
    };
  } catch {
    // プライベートブラウジング等で localStorage が使えないことがある。
    // 設定が消えるだけで動作は続くので、既定値で進む
    return DEFAULTS;
  }
}

export function saveSettings(settings: Settings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(settings));
  } catch {
    // 保存できなくてもアプリは動く
  }
}
