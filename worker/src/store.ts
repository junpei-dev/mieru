/**
 * Cloudflare KV へのアクセス
 *
 * LINE userId はここにしか置かない。
 * リポジトリにも、Cloudflare Pages が配信する公開JSONにも書かない（NFR-7）。
 */

import type { Env } from './env.js';

export interface UserRecord {
  locationId: string;
  enabled: boolean;
  threshold: number;
  registeredAtMs: number;
}

const USER_PREFIX = 'u:';
const USER_INDEX_KEY = 'index';

export async function getUser(
  env: Env,
  userId: string,
): Promise<UserRecord | null> {
  return env.USERS.get<UserRecord>(`${USER_PREFIX}${userId}`, 'json');
}

export async function putUser(
  env: Env,
  userId: string,
  record: UserRecord,
): Promise<void> {
  await env.USERS.put(`${USER_PREFIX}${userId}`, JSON.stringify(record));
  await addToIndex(env, userId);
}

export async function deleteUser(env: Env, userId: string): Promise<void> {
  await env.USERS.delete(`${USER_PREFIX}${userId}`);
  const index = await listUserIds(env);
  await env.USERS.put(
    USER_INDEX_KEY,
    JSON.stringify(index.filter((id) => id !== userId)),
  );
}

export async function listUserIds(env: Env): Promise<string[]> {
  return (await env.USERS.get<string[]>(USER_INDEX_KEY, 'json')) ?? [];
}

async function addToIndex(env: Env, userId: string): Promise<void> {
  const index = await listUserIds(env);
  if (index.includes(userId)) return;
  index.push(userId);
  await env.USERS.put(USER_INDEX_KEY, JSON.stringify(index));
}

/** 登録済みユーザーを全件返す */
export async function listUsers(
  env: Env,
): Promise<{ userId: string; record: UserRecord }[]> {
  const ids = await listUserIds(env);
  const users: { userId: string; record: UserRecord }[] = [];
  for (const userId of ids) {
    const record = await getUser(env, userId);
    if (record) users.push({ userId, record });
  }
  return users;
}

// ── 送信済みの記録（冪等性・FR-6.5）────────────────

export type NotificationKind = 'advance' | 'reminder' | 'cancelled';

/**
 * 同じパスについて二重に通知しないためのフラグ。
 *
 * passId は「衛星ID＋最大仰角時刻(UTC分)」で作られているので、
 * 予報が1日1回作り直されても、同じパスなら同じIDになる。
 * これがないと、毎朝同じ通知が飛ぶことになる。
 */
export async function wasSent(
  env: Env,
  passId: string,
  kind: NotificationKind,
): Promise<boolean> {
  return (await env.STATE.get(`sent:${passId}:${kind}`)) !== null;
}

export async function markSent(
  env: Env,
  passId: string,
  kind: NotificationKind,
): Promise<void> {
  // パスが過ぎれば不要になるので7日で自動削除
  await env.STATE.put(`sent:${passId}:${kind}`, '1', {
    expirationTtl: 7 * 24 * 60 * 60,
  });
}

// ── 運用警告の抑制 ────────────────────────────

/**
 * 同じ警告を繰り返し送らないためのロック。
 * 15分ごとに走る Cron で毎回警告を飛ばすと、それ自体が無料枠を食い潰す。
 */
export async function shouldAlert(
  env: Env,
  key: string,
  cooldownSec: number,
): Promise<boolean> {
  if ((await env.STATE.get(`alert:${key}`)) !== null) return false;
  await env.STATE.put(`alert:${key}`, '1', { expirationTtl: cooldownSec });
  return true;
}
