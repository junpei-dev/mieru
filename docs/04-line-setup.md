# LINE通知セットアップ手順（初回用）

はじめて LINE Messaging API を触る前提で、つまずきやすい点まで含めて書いています。
**上から順にそのまま進めれば動きます。**

| | |
|---|---|
| 所要時間 | 60〜90分（審査待ちなし） |
| 費用 | 0円 |
| 前提 | LINEアカウント、GitHubアカウント、Cloudflareアカウント |

> ⚠️ **LINE Notify は 2025年3月31日に終了しました。**
> ネット上の古い記事は「トークンを発行するだけ」と書いていますが、**その方法はもう使えません**。
> 現在は Messaging API（＝LINE公式アカウント＋ボット）を使います。手間は増えますが、
> 代わりに「誰に・いつ・何を送るか」を自分で制御できます。

---

## 全体像

登場人物は3つ。**それぞれ役割が違います。**

```
┌──────────────────┐   毎日1回        ┌────────────────────┐
│ GitHub Actions   │ ── 軌道を計算 ──▶ │ Cloudflare Pages   │
│ （重い計算担当）   │                  │ （PWA と予報JSON）  │
└──────────────────┘                  └────────────────────┘
                                                │
                                        予報JSONを読む
                                                ▼
                                      ┌────────────────────┐
                                      │ Cloudflare Workers │
                                      │ （通知の判断担当）   │
                                      └────────────────────┘
                                          │            ▲
                                    通知を送る      友だち追加・
                                          ▼       地点登録を受ける
                                      ┌────────────────────┐
                                      │  LINE 公式アカウント │
                                      └────────────────────┘
```

作業は **Cloudflare Pages → LINE → Cloudflare Workers → LINEに戻る** の順です。
Worker のURLを LINE に登録する必要があるので、この順番でないと堂々巡りになります。

### ⚠️ URLが2つあります。混同しやすいので先に整理します

| | 正体 | 誰が使うか | 形 |
|---|---|---|---|
| **Pages のURL** | PWA（アプリ本体） | **人**がブラウザで開く | `https://mieru-xxx.pages.dev` |
| **Workers のURL** | 通知の判断プログラム | **LINE**がイベントを送りつけてくる | `https://mieru-notifier-xxx.workers.dev` |

- **Webhook URL 欄に入れるのは Workers のほう＋ `/webhook`** です。
  Pages の URL を入れても LINE からのイベントは受け取れません。
- `wrangler.toml` の `SITE_BASE_URL` に入れるのは **Pages のほう**です。
  Worker が予報JSONを読みに行く先だからです。

**逆に入れてしまうのが一番多い失敗です。**「アプリのURL＝人が見る側」「WorkerのURL＝機械が叩く側」と覚えてください。

---

## STEP 0 — Cloudflare Pages を先に用意する

Worker の設定に **PWA の URL** が必要なので、先にこちらを済ませます。

1. [Cloudflare ダッシュボード](https://dash.cloudflare.com/) にログイン
2. 左メニュー **Workers & Pages** → **Create** → **Pages** タブ → **Connect to Git**
3. このリポジトリを選択
4. ビルド設定：

   | 項目 | 値 |
   |---|---|
   | Framework preset | None |
   | Build command | `npm run build --workspace @mieru/web` |
   | Build output directory | `apps/web/dist` |
   | Root directory | （空欄のまま） |

5. **Save and Deploy**
6. 完了後に表示される URL（例 `https://mieru-xxx.pages.dev`）を**メモ**

> 💡 うまくビルドされないときは、環境変数に `NODE_VERSION = 22` を追加してください。

**確認：** その URL をスマホで開いて、アプリが表示されればOK。

---

## STEP 1 — LINE公式アカウントを作る

> ⚠️ **重要：** 昔は LINE Developers コンソールで直接「Messaging APIチャネル」を作れましたが、
> **現在はできません。** 先に LINE公式アカウントを作り、そこから Messaging API を有効化します。
> 古い解説記事どおりに進めると、作成ボタンが見つからずに詰まります。

1. [LINE公式アカウント開設ページ](https://www.linebiz.com/jp/entry/) を開く
2. **「LINEアカウントで登録」** を選ぶ（普段使いのLINEアカウントでOK）
3. アカウント情報を入力

   | 項目 | 入れるもの |
   |---|---|
   | アカウント名 | 例：`ミエル｜衛星が見える日` ※**後から変更できます** |
   | 業種 | 「個人」→「個人（その他）」で問題ありません |
   | 運用目的 | 任意 |

4. 作成すると [LINE Official Account Manager](https://manager.line.biz/) に入ります

**確認：** 管理画面が開き、作ったアカウント名が表示されていればOK。

---

## STEP 2 — Messaging API を有効化する

LINE Official Account Manager で作業します。

1. 右上の **設定**（歯車）→ 左メニュー **Messaging API**
2. **「Messaging APIを利用する」** をクリック
3. **プロバイダー**を選ぶ画面が出ます
   - 初回は **「新規プロバイダー作成」** を選び、名前を入力（例：自分の名前や `mieru`）
   - プロバイダー＝アプリの提供者名です。あとで利用者に見える場合があります
4. プライバシーポリシー・利用規約のURLは**空欄のままでOK**（任意項目）
5. 内容を確認して **OK**

**確認：** Messaging API の画面に **Channel ID** と **Channel secret** が表示されればOK。

---

## STEP 3 — 自動応答をオフにする

ここを飛ばすと、**自分のボットの返事と LINE の自動返信が二重に届きます。**

LINE Official Account Manager で：

1. 右上 **設定** → **応答設定**
2. 次のように変更：

   | 項目 | 設定 |
   |---|---|
   | チャット | **オフ** |
   | あいさつメッセージ | **オフ** |
   | 応答メッセージ | **オフ** |
   | **Webhook** | **オン** ← これが最重要 |

> あいさつメッセージをオフにするのは、友だち追加時の案内を**アプリ側から送る**ためです。
> アプリ側の案内は「応答メッセージ（reply）」なので、**月200通の無料枠を消費しません。**

### ❓ この段階で「Webhook URL」を求められたら

設定 → Messaging API の画面にも **Webhook URL** の入力欄があります。
**ここはまだ空のままにして先に進んでください。** 入れるべき Worker の URL は
STEP 5 でデプロイして初めて発行されるため、この時点では存在しません。

トグルの **Webhook をオンにするだけ**でこの STEP は完了です。
URL の登録は STEP 6 で行います。

---

## STEP 4 — トークンとシークレットを控える

[LINE Developers コンソール](https://developers.line.biz/console/) を開きます。
STEP 2 で作ったプロバイダー → 作成されたチャネルを選択。

> ⚠️ **サイトを間違えやすいので注意。**
> ここまで作業してきた **LINE Official Account Manager**（`manager.line.biz`）ではありません。
> **LINE Developers コンソール**（`developers.line.biz`）です。
>
> どちらにも「Messaging API」という名前の画面があるうえ、内容が違います。
>
> | サイト | Messaging API画面にあるもの |
> |---|---|
> | Official Account Manager | Channel ID / Channel secret / Webhook URL **のみ** |
> | **Developers コンソール** | **アクセストークン**・Webhook・応答設定など |
>
> 迷ったら、Official Account Manager の Messaging API 画面の**最下部**にある
> 「その他の設定は**LINE Developersコンソール**から行えます」のリンクを踏むと、
> 該当チャネルに直接飛べます。

控えるものは **3つ**。メモ帳などに貼っておいてください。

### ① チャネルシークレット
**「チャネル基本設定」** タブ → `チャネルシークレット`

→ Webhook が本物の LINE から来たかを検証するのに使います。

### ② あなたのユーザーID
**「チャネル基本設定」** タブの下の方 → `あなたのユーザーID`
`U` で始まる33文字の文字列です。

→ 障害時の警告を自分だけに送るのに使います。

### ③ チャネルアクセストークン（長期）
**「Messaging API設定」** タブ → **ページ最下部** `チャネルアクセストークン（長期）` → **発行**

→ メッセージを送るのに使います。**再表示できないので必ずコピーしてください。**

> **「発行」ボタンが見つからない場合**
> - **Official Account Manager 側を見ていませんか。** 上の注意書きを参照（最頻出の原因）
> - ページが長いので **最下部までスクロール**したか
> - タブが「チャネル基本設定」のままになっていないか
>
> 万一トークンを失っても同じ画面から**再発行**できます（古いトークンは無効になります）。

> 🔒 この3つは**パスワードと同じ**です。GitHubにコミットしない・スクショをSNSに上げない。
> 漏れると勝手にメッセージを送られます。万一漏らしたら、同じ画面から再発行してください。

---

## STEP 5 — Cloudflare Workers を準備する

ターミナルで、プロジェクトの `worker` フォルダに移動します。

```bash
cd worker
```

### 5-1. Cloudflare にログイン

```bash
npx wrangler login
```
ブラウザが開くので許可します。

### 5-2. データの保存場所（KV）を2つ作る

```bash
npx wrangler kv namespace create USERS
```

```bash
npx wrangler kv namespace create STATE
```

それぞれ次のような出力が出ます：

```
🌀 Creating namespace with title "mieru-notifier-USERS"
✨ Success!
{ "kv_namespaces": [ { "binding": "USERS", "id": "a1b2c3d4e5f6..." } ] }
```

この **`id` の値**を `worker/wrangler.toml` の該当箇所に貼り替えます。

```toml
[[kv_namespaces]]
binding = "USERS"
id = "ここに USERS の id"      # ← REPLACE_WITH_USERS_NAMESPACE_ID を置き換える

[[kv_namespaces]]
binding = "STATE"
id = "ここに STATE の id"      # ← REPLACE_WITH_STATE_NAMESPACE_ID を置き換える
```

### 5-3. PWA の URL を設定する

同じ `wrangler.toml` の `SITE_BASE_URL` を、STEP 0 でメモした URL に変更します。
**末尾のスラッシュは付けないでください。**

```toml
[vars]
SITE_BASE_URL = "https://mieru-xxx.pages.dev"
DEFAULT_LOCATION_ID = "miyazaki-shi"
```

### 5-4. 秘密情報を登録する

コマンドを実行すると値の入力を求められるので、STEP 4 で控えたものを貼り付けます。
**画面には表示されませんが入力されています。** 貼り付けたら Enter。

```bash
npx wrangler secret put LINE_CHANNEL_ACCESS_TOKEN
```

```bash
npx wrangler secret put LINE_CHANNEL_SECRET
```

```bash
npx wrangler secret put ADMIN_LINE_USER_ID
```

動作確認用の合言葉も登録します。中身は自分で決めた適当な長い文字列でOK（例：`mieru-test-9f3a2b`）。

```bash
npx wrangler secret put ADMIN_TOKEN
```

### 5-5. デプロイ

```bash
npx wrangler deploy
```

成功すると URL が表示されます：

```
Uploaded mieru-notifier (1.23 sec)
Published mieru-notifier (0.45 sec)
  https://mieru-notifier.<あなたの名前>.workers.dev
```

この URL を**メモ**してください。

**確認：** ブラウザで `https://.../health` を開き、`{"ok":true,...}` が返ればOK。

---

## STEP 6 — Webhook URL を登録する

LINE Developers コンソールに戻ります。

1. **「Messaging API設定」** タブ → **Webhook設定**
2. **Webhook URL** に、STEP 5 の URL に `/webhook` を足したものを入力

   ```
   https://mieru-notifier.xxxxx.workers.dev/webhook
   ```

3. **更新** をクリック
4. **検証** をクリック → **「成功」** と出ればOK
5. **「Webhookの利用」** を **オン**

> ❗ **「検証」で失敗する場合**
> - URL の末尾 `/webhook` を忘れていないか
> - `wrangler deploy` が成功しているか（`/health` が開けるか）
> - `LINE_CHANNEL_SECRET` を正しく登録したか（**Channel ID や access token と間違えやすい**）
>
> 検証は署名付きの空リクエストを送ります。シークレットが違うと 401 になり失敗します。

---

## STEP 7 — 友だち追加して動作を確かめる

1. LINE Official Account Manager の **ホーム** → **友だちを増やす** → QRコードを表示
2. 自分のスマホの LINE で読み取って友だち追加

**期待される動作：**

```
友だち追加ありがとうございます 🛰

このアカウントは、国際宇宙ステーション（ISS）が
あなたの地域の空に「はっきり見える日」だけをお知らせします。

・見える日の朝に予告
・通過の30分前にリマインド
・条件が悪い日は通知しません

まず、お住まいの市区町村を教えてください。
例：「宮崎市」「延岡市」「札幌市」
```

3. トークに **`宮崎市`** と送ってみる

```
観測地点を「宮崎県宮崎市」に設定しました。

条件が揃った日にお知らせします。
しばらく通知が来なくても故障ではありません。
ISSがはっきり見える期間は、約2か月ごとに1〜2週間だけ訪れます。
```

これが返ってくれば、**Webhook が正しく動いています。**

> ❗ **何も返ってこない場合**
> - STEP 3 の **Webhook がオン**になっているか（Official Account Manager 側）
> - STEP 6 の **Webhookの利用がオン**になっているか（Developers コンソール側）
> - **両方ともオンにする必要があります。** ここが一番よくある詰まりどころです。
>
> ログを見るには、別ターミナルで：
> ```bash
> npx wrangler tail
> ```

---

## STEP 8 — 通知の中身を確認する（送信はしない）

ここが一番知りたいところだと思います。
**Cron（朝10:07）を待たなくても、いま何が送られるかを確認できます。**

ブラウザで次を開きます（`ADMIN_TOKEN` は STEP 5-4 で決めた文字列）：

```
https://mieru-notifier.xxxxx.workers.dev/admin/preview?token=あなたのADMIN_TOKEN
```

**通知対象の日がある場合：**

```json
{
  "preview": [{
    "site": "宮崎県宮崎市",
    "forecastSite": "宮崎県宮崎市",
    "reason": "78点。条件を満たすので送信対象です。",
    "text": "🛰 今夜、ISSが見えます\n\n9月24日(木) 19:00 〜 ..."
  }]
}
```

**今夜は見えない場合（こちらが普通です）：**

```json
{
  "preview": [{
    "site": "宮崎県宮崎市",
    "reason": "今夜このあと通過するパスがありません（7日間の総数は0件）。",
    "text": null
  }]
}
```

`text` が `null` でも**故障ではありません。** `reason` に理由が書かれています。

> 💡 このエンドポイントは**実際には送信せず、無料枠も消費しません。**
> 設定ミスなのか、単に見える日がないだけなのかを切り分けるために用意しています。

**「予報JSONを取得できません」と出る場合：**
`wrangler.toml` の `SITE_BASE_URL` が間違っています。STEP 5-3 を見直してください。

---

## STEP 9 — GitHub Actions を動かす

予報データを毎日更新する仕組みを起動します。

1. GitHub のリポジトリ → **Actions** タブ
2. 左の **「予報の生成」** を選択
3. 右の **Run workflow** → **Run workflow**
4. 緑のチェックが付けば成功

以降は毎日 **05:17 JST** に自動実行されます。

> ⚠️ GitHub の定期実行は、**リポジトリが60日間まったく更新されないと自動停止**します。
> 停止に気づかないと「通知が来ない＝見える日がない」と誤解し続けることになるので、
> Worker が予報の鮮度を見張り、36時間以上古ければ**あなたのLINEに警告を送ります**。

---

## 完成後の動き方

| タイミング | 何が起きるか |
|---|---|
| 毎日 05:17 | GitHub Actions が7日分の予報を計算し直す |
| 毎日 10:07 | 今夜見える日なら**予告**が届く。見えない日は**何も届かない** |
| 15分ごと | 通過30分前なら**リマインド**。直前に曇っていたら**送らない** |

### 通知が来ないのは正常です

ISSが光って見えるのは**日没直後と日の出前だけ**。それ以外の時間は地球の影に入っています。
条件が揃う「可視期間」は**約2か月ごとに1〜2週間**だけ訪れます。

数週間まったく通知が来なくても故障ではありません。不安なときは STEP 8 の
`/admin/preview` か、次のコマンドで確認できます。

```bash
npm run diagnose --workspace @mieru/notifier -- miyazaki-shi
```

---

## 無料枠について

LINE公式アカウントのコミュニケーションプラン（無料）は **月200通** です。
**超過分は送信できません**（無料プランでは追加購入もできません）。

通数は**配信人数ぶん**消費されます。

| 友だち数 | 通知できる回数/月 |
|---|---|
| 5人 | 40回 |
| 10人 | 20回 |
| 20人 | **10回** ← 現実的な上限 |
| 40人 | 5回 |

1回のパスにつき「予告＋リマインド」で**2通**使います。
このアプリは送信前に LINE の残枠APIを確認し、足りなければ**送らずに警告だけ**出します。

**友だち追加時の案内や地点登録の返事（応答メッセージ）は、通数を消費しません。**

---

## つまずきポイント早見表

| 症状 | 原因 | 対処 |
|---|---|---|
| Messaging APIチャネルを作るボタンがない | 仕様変更。Developersコンソールからは作れない | STEP 1 から。Official Account Manager で作る |
| Webhook「検証」が失敗する | `LINE_CHANNEL_SECRET` の登録ミス | Channel ID やアクセストークンと取り違えていないか確認 |
| 友だち追加しても何も返ってこない | Webhook のスイッチが片方だけオン | **Official Account Manager 側と Developers 側の両方**をオンに |
| 変な自動返信が届く | 応答メッセージがオン | STEP 3 で応答メッセージをオフに |
| `/admin/preview` が 404 | `ADMIN_TOKEN` 未登録 | STEP 5-4 を実行して再デプロイ |
| `/admin/preview` が「予報JSONを取得できません」 | `SITE_BASE_URL` の誤り | 末尾スラッシュなしの Pages URL に修正 |
| トークンを紛失した | 再表示はできない仕様 | Developersコンソールから**再発行**（古いトークンは無効化される） |

---

## 運用中に使うコマンド

```bash
npx wrangler tail
```
Worker のログをリアルタイムに流します。通知が送られたか、中止されたかが分かります。

```bash
npx wrangler deploy
```
コードを直したあとの再デプロイ。

```bash
npx wrangler secret list
```
登録済みの秘密情報の**名前だけ**を一覧表示（値は見えません）。

---

## 参考

- [LINE Messaging API を利用するには（公式）](https://developers.line.biz/ja/docs/messaging-api/getting-started/)
- [LINE公式アカウント 料金プラン](https://www.lycbiz.com/jp/service/line-official-account/plan/)
- [Cloudflare Workers Cron Triggers](https://developers.cloudflare.com/workers/configuration/cron-triggers/)
