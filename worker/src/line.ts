/**
 * LINE Messaging API クライアント
 *
 * SDK（@line/bot-sdk）は Node 前提の依存を含むため、Workers では fetch を直接叩く。
 * 使う機能は push / broadcast / reply / quota だけなので、SDKの必要がない。
 *
 * ※ LINE Notify は 2025年3月31日にサービス終了済み。Messaging API が後継。
 */

const LINE_API = 'https://api.line.me/v2/bot';

export interface QuotaStatus {
  /** 月の無料枠。無制限プランなら null */
  limit: number | null;
  /** 今月すでに送った通数 */
  used: number;
  /** あと何通送れるか。無制限なら Infinity */
  remaining: number;
}

function authHeaders(accessToken: string): HeadersInit {
  return {
    Authorization: `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
  };
}

/**
 * 今月の残り送信可能数を取得する。
 *
 * 自前でカウンタを持つより、LINE 側の実績値を見るほうが確実。
 * 手動送信や再試行による消費も正しく反映される。
 */
export async function fetchQuota(accessToken: string): Promise<QuotaStatus> {
  const [quotaResponse, usageResponse] = await Promise.all([
    fetch(`${LINE_API}/message/quota`, { headers: authHeaders(accessToken) }),
    fetch(`${LINE_API}/message/quota/consumption`, {
      headers: authHeaders(accessToken),
    }),
  ]);

  if (!quotaResponse.ok || !usageResponse.ok) {
    throw new Error(
      `送信枠を確認できません (quota=${quotaResponse.status}, usage=${usageResponse.status})`,
    );
  }

  const quota = (await quotaResponse.json()) as {
    type: 'none' | 'limited';
    value?: number;
  };
  const usage = (await usageResponse.json()) as { totalUsage: number };

  // type が 'none' なら無制限プラン
  const limit = quota.type === 'limited' ? (quota.value ?? 0) : null;
  return {
    limit,
    used: usage.totalUsage,
    remaining: limit === null ? Number.POSITIVE_INFINITY : limit - usage.totalUsage,
  };
}

/** 友だち全員に送る。通数は「友だち数」ぶん消費する */
export async function broadcast(
  accessToken: string,
  text: string,
): Promise<void> {
  const response = await fetch(`${LINE_API}/message/broadcast`, {
    method: 'POST',
    headers: authHeaders(accessToken),
    body: JSON.stringify({ messages: [{ type: 'text', text }] }),
  });
  if (!response.ok) {
    throw new Error(
      `broadcast に失敗 (${response.status}): ${await response.text()}`,
    );
  }
}

/** 特定のユーザーに送る。通数は1消費する */
export async function push(
  accessToken: string,
  to: string,
  text: string,
): Promise<void> {
  const response = await fetch(`${LINE_API}/message/push`, {
    method: 'POST',
    headers: authHeaders(accessToken),
    body: JSON.stringify({ to, messages: [{ type: 'text', text }] }),
  });
  if (!response.ok) {
    throw new Error(
      `push に失敗 (${response.status}): ${await response.text()}`,
    );
  }
}

/**
 * Webhook への応答。
 *
 * 重要：reply は無料メッセージ通数を消費しない。
 * 友だち追加時の案内や地点登録の確認は、必ず reply で返すこと。
 * push で返すと、月200通の貴重な枠が登録作業で溶ける。
 */
export async function reply(
  accessToken: string,
  replyToken: string,
  messages: unknown[],
): Promise<void> {
  const response = await fetch(`${LINE_API}/message/reply`, {
    method: 'POST',
    headers: authHeaders(accessToken),
    body: JSON.stringify({ replyToken, messages }),
  });
  if (!response.ok) {
    throw new Error(
      `reply に失敗 (${response.status}): ${await response.text()}`,
    );
  }
}

/**
 * Webhook 署名の検証（NFR-6）。
 *
 * これを省くと、誰でも偽のイベントを投げ込めてしまう。
 * 検証に失敗したリクエストは本文を一切解釈してはいけない。
 *
 * タイミング安全な比較を使うのは、比較の所要時間から署名を推測されるのを防ぐため。
 */
export async function verifySignature(
  channelSecret: string,
  body: string,
  signature: string | null,
): Promise<boolean> {
  if (!signature) return false;

  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(channelSecret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const mac = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(body),
  );

  // 計算した署名を base64 にして比較する
  const expected = btoa(String.fromCharCode(...new Uint8Array(mac)));
  if (expected.length !== signature.length) return false;

  let diff = 0;
  for (let i = 0; i < expected.length; i += 1) {
    diff |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
  }
  return diff === 0;
}
