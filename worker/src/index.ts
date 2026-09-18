/**
 * Cloudflare Worker のエントリポイント
 *
 * 2つの役割を持つ。
 *   scheduled … 定時に通知の判定を行う（Cron Trigger）
 *   fetch     … LINE の Webhook を受ける（友だち追加・地点登録）
 *
 * 軌道計算はここでは行わない。無料プランの CPU 上限が 10ms しかないため、
 * SGP4 の探索（数百ms〜数秒）は物理的に載らない。
 * 重い計算は GitHub Actions が事前に済ませ、ここは結果を読むだけにしている。
 */

import {
  findNearestSite,
  findSiteByName,
  NOTIFY_SCORE_THRESHOLD,
} from '@mieru/core';

import type { Env } from './env.js';
import { reply, verifySignature } from './line.js';
import { deleteUser, getUser, putUser } from './store.js';
import {
  checkForecastFreshness,
  previewAdvance,
  runAdvanceNotification,
  runReminderNotification,
} from './notify.js';
import {
  locationNotFoundMessage,
  locationSetMessage,
  welcomeMessage,
} from './messages.js';

/** LINE Webhook のイベント（使う部分だけ） */
interface LineEvent {
  type: string;
  replyToken?: string;
  source?: { userId?: string };
  message?: { type: string; text?: string };
  postback?: { data?: string };
}

/** 朝の予告を出す Cron かどうか */
function isMorningCron(cron: string): boolean {
  return cron === '7 1 * * *';
}

async function handleFollow(
  env: Env,
  event: LineEvent,
): Promise<void> {
  const userId = event.source?.userId;
  if (!userId || !event.replyToken) return;

  // 既定地点で仮登録しておく。地点を送ってくれなくても通知は届く
  await putUser(env, userId, {
    locationId: env.DEFAULT_LOCATION_ID,
    enabled: true,
    threshold: NOTIFY_SCORE_THRESHOLD,
    registeredAtMs: Date.now(),
  });

  // reply は無料メッセージ通数を消費しない。案内は必ず reply で返す
  await reply(env.LINE_CHANNEL_ACCESS_TOKEN, event.replyToken, [
    { type: 'text', text: welcomeMessage(env.SITE_BASE_URL) },
  ]);
}

async function handleTextMessage(
  env: Env,
  event: LineEvent,
): Promise<void> {
  const userId = event.source?.userId;
  const text = event.message?.text?.trim();
  if (!userId || !event.replyToken || !text) return;

  const site = findSiteByName(text);

  if (!site) {
    await reply(env.LINE_CHANNEL_ACCESS_TOKEN, event.replyToken, [
      { type: 'text', text: locationNotFoundMessage(text) },
    ]);
    return;
  }

  const existing = await getUser(env, userId);
  await putUser(env, userId, {
    locationId: site.id,
    enabled: existing?.enabled ?? true,
    threshold: existing?.threshold ?? NOTIFY_SCORE_THRESHOLD,
    registeredAtMs: existing?.registeredAtMs ?? Date.now(),
  });

  await reply(env.LINE_CHANNEL_ACCESS_TOKEN, event.replyToken, [
    { type: 'text', text: locationSetMessage(site.name) },
  ]);
}

async function handleLocationMessage(
  env: Env,
  event: LineEvent & { message?: { latitude?: number; longitude?: number } },
): Promise<void> {
  const userId = event.source?.userId;
  const { latitude, longitude } = event.message ?? {};
  if (!userId || !event.replyToken || latitude == null || longitude == null) {
    return;
  }

  // 送られた座標そのものは保存しない。最も近い市区町村に丸めて保存する（NFR-7）
  const site = findNearestSite(latitude, longitude);
  const existing = await getUser(env, userId);
  await putUser(env, userId, {
    locationId: site.id,
    enabled: existing?.enabled ?? true,
    threshold: existing?.threshold ?? NOTIFY_SCORE_THRESHOLD,
    registeredAtMs: existing?.registeredAtMs ?? Date.now(),
  });

  await reply(env.LINE_CHANNEL_ACCESS_TOKEN, event.replyToken, [
    { type: 'text', text: locationSetMessage(site.name) },
  ]);
}

async function handleWebhook(request: Request, env: Env): Promise<Response> {
  const body = await request.text();

  // 署名検証（NFR-6）。失敗したら本文を一切解釈しない
  const valid = await verifySignature(
    env.LINE_CHANNEL_SECRET,
    body,
    request.headers.get('x-line-signature'),
  );
  if (!valid) {
    return new Response('invalid signature', { status: 401 });
  }

  const payload = JSON.parse(body) as { events?: LineEvent[] };

  for (const event of payload.events ?? []) {
    try {
      switch (event.type) {
        case 'follow':
          await handleFollow(env, event);
          break;
        case 'unfollow':
          if (event.source?.userId) {
            await deleteUser(env, event.source.userId);
          }
          break;
        case 'message':
          if (event.message?.type === 'text') {
            await handleTextMessage(env, event);
          } else if (event.message?.type === 'location') {
            await handleLocationMessage(env, event);
          }
          break;
        default:
          // 未対応のイベントは黙って無視する
          break;
      }
    } catch (error) {
      // 1つのイベントで落ちても、残りは処理する。
      // LINE には 200 を返さないと再送が続いてしまう
      console.error('イベント処理に失敗:', event.type, error);
    }
  }

  return new Response('ok');
}

/**
 * 「いま予告を送るとしたら何が送られるか」を確認する。実際には送信しない。
 *
 * セットアップ直後は「通知が来ないのは設定ミスなのか、単に見える日が無いのか」が
 * 分からず不安になる。ここで中身を覗けるようにしておく。
 *
 * ADMIN_TOKEN（secret）を設定していない場合、このエンドポイントは無効。
 * 誰でも叩けると、予報内容や設定が外部に漏れるため。
 */
async function handleAdminPreview(
  request: Request,
  env: Env,
): Promise<Response> {
  if (!env.ADMIN_TOKEN) {
    return new Response('admin endpoint is disabled', { status: 404 });
  }
  const provided =
    request.headers.get('x-admin-token') ??
    new URL(request.url).searchParams.get('token');

  if (provided !== env.ADMIN_TOKEN) {
    return new Response('forbidden', { status: 403 });
  }

  try {
    const preview = await previewAdvance(env);
    return Response.json({ now: new Date().toISOString(), preview }, {
      headers: { 'cache-control': 'no-store' },
    });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/webhook' && request.method === 'POST') {
      return handleWebhook(request, env);
    }

    // 死活確認用
    if (url.pathname === '/health') {
      return Response.json({ ok: true, now: new Date().toISOString() });
    }

    // 初回セットアップの動作確認用。ADMIN_TOKEN を設定したときだけ有効になる
    if (url.pathname === '/admin/preview') {
      return handleAdminPreview(request, env);
    }

    return new Response('mieru notifier', { status: 200 });
  },

  async scheduled(
    event: ScheduledController,
    env: Env,
    ctx: ExecutionContext,
  ): Promise<void> {
    // waitUntil で包むことで、処理完了まで Worker が終了しないようにする
    ctx.waitUntil(
      (async () => {
        try {
          if (isMorningCron(event.cron)) {
            await runAdvanceNotification(env);
          } else {
            // 15分ごとの実行：リマインド判定と鮮度監視
            await runReminderNotification(env);
            await checkForecastFreshness(env);
          }
        } catch (error) {
          console.error('定時処理に失敗:', event.cron, error);
        }
      })(),
    );
  },
};
