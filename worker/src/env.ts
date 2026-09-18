/** Worker のバインディング定義 */
export interface Env {
  // KV
  USERS: KVNamespace;
  STATE: KVNamespace;

  // vars（wrangler.toml）
  SITE_BASE_URL: string;
  DEFAULT_LOCATION_ID: string;

  // secrets（wrangler secret put で登録。リポジトリには置かない）
  LINE_CHANNEL_ACCESS_TOKEN: string;
  LINE_CHANNEL_SECRET: string;
  ADMIN_LINE_USER_ID?: string;
  /** 動作確認用エンドポイントの合言葉。未設定なら /admin/preview は無効 */
  ADMIN_TOKEN?: string;
}
