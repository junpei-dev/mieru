# ミエル（mieru）

**今夜、衛星は見えるか** — に一言で答える観測支援 PWA。

ISS（国際宇宙ステーション）が自宅の空に**はっきり見える日だけ**を LINE で通知する。
それ以外の日は何も届かない。アプリを開けば、なぜ見えないのかが分かる。

```
🛰 今夜、ISSが見えます

9月24日(木) 19:00 〜 19:11
────────────────
最大仰角  60°
経路      北西 → 北 → 南東
明るさ    -3.8等（金星より明るい）
見える時間 5分43秒
雲量      12%（快晴）
────────────────

19:00 に 北西 の空を見上げてください。
```

---

## なぜ作るのか

ISSは条件が揃えば金星より明るく肉眼で見える。しかし実際に見るには
**軌道・薄明・地球影・仰角・雲・生活時間**の6条件を同時に満たす必要がある。

既存サービスは軌道は正確だが**天気を見ていない**。結果「予報を見て外に出たが曇っていた」が起きる。

> **情報ではなく「判断」を届ける。**

---

## 動くもの

| | |
|---|---|
| PWA | `apps/web` — React 19 + Vite 8 + Tailwind 4 |
| 予報バッチ | `apps/notifier` — GitHub Actions で1日1回 |
| 通知 | `worker` — Cloudflare Workers（Cron + LINE Webhook） |
| 計算ロジック | `packages/core` — **全部ここ。上の3つが共有する** |

### 構成の要点

**軌道計算は `packages/core` にしか無い。** PWA も通知バッチも Worker も
同じコードを import する。二重実装するとスコア基準がズレて
「アプリでは見えると言っているのに通知が来ない」が起きるため。

**処理は「重い／時刻がシビア」で置き場所を分けている。**

```
                 CPU が重い          CPU が軽い
              ┌──────────────────┬──────────────────┐
 時刻がシビア  │   （該当なし）    │ Cloudflare Cron  │
              │                  │ ・リマインド判定  │
              ├──────────────────┼──────────────────┤
 時刻が緩い    │ GitHub Actions   │ Cloudflare Pages │
              │ ・7日分パス計算   │ ・PWA配信        │
              └──────────────────┴──────────────────┘
```

Cloudflare Workers 無料プランは **Cron 実行でも CPU 10ms** のため、
SGP4 の探索（数百ms〜数秒）は載らない。重い計算は GitHub Actions に置き、
Worker は「計算済みJSONを読む → 数値を比べる → LINE APIを叩く」だけにしている。

**月額コストは0円。** 全て無料枠に収まる。

---

## セットアップ

```bash
npm install
```

### 開発

```bash
npm run dev                 # PWA を起動（http://localhost:5178）
npm test                    # コアのテスト（59件）
npm run forecast            # 予報JSONを生成（CelesTrak と Open-Meteo を叩く）
```

### 便利なコマンド

```bash
npm run preview  --workspace @mieru/notifier -- miyazaki-shi
```
生成済み予報を人が読める形で表示する。**この出力を持って実際に外に出て検証する。**

```bash
npm run diagnose --workspace @mieru/notifier -- miyazaki-shi
```
「なぜ今週は1件も見えないのか」を4段階で切り分ける。

```
① 地平線上を通過する（幾何的なパス）:  53件
② ＋ 最大仰角が10°以上              :  26件  (−27)
③ ＋ 観測地の空が暗い               :  12件  (−14)
④ ＋ 衛星が地球の影の外にいる        :   0件  (−12)

結論：夜間に頭上を通ってはいるが、すべて地球の影の中。
      これは正常な状態で、約2か月周期で可視期間が戻る。
```

0件がバグなのか可視期間外なのかを区別できないと、壊れていることに気づけない。

```bash
npm run icons --workspace @mieru/web     # PWAアイコンをSVGから再生成
```

---

## デプロイ

### 1. Cloudflare Pages（PWA）

| 設定 | 値 |
|---|---|
| ビルドコマンド | `npm run build --workspace @mieru/web` |
| 出力ディレクトリ | `apps/web/dist` |
| ルートディレクトリ | （リポジトリ直下） |

### 2. GitHub Actions（予報）

`.github/workflows/forecast.yml` が毎日 05:17 JST に実行され、
`apps/web/public/data/` を更新してコミットする。Pages はその push で自動デプロイされる。

初回は Actions タブから **Run workflow** で手動実行する。

> ⚠️ GitHub の scheduled workflow は **リポジトリが60日間無活動だと自動停止**する。
> Worker 側の鮮度監視（36時間以上古ければ管理者に警告）で検知する。

### 3. Cloudflare Workers（通知）

```bash
cd worker

# KV を作成し、出力された id を wrangler.toml に書く
npx wrangler kv namespace create USERS
npx wrangler kv namespace create STATE

# シークレットを登録（リポジトリには絶対に書かない）
npx wrangler secret put LINE_CHANNEL_ACCESS_TOKEN
npx wrangler secret put LINE_CHANNEL_SECRET
npx wrangler secret put ADMIN_LINE_USER_ID

npx wrangler deploy
```

`wrangler.toml` の `SITE_BASE_URL` を実際の Pages URL に書き換えること。

### 4. LINE 公式アカウント

**→ 詳細な手順は [docs/04-line-setup.md](docs/04-line-setup.md) にあります。**
はじめて Messaging API を触る前提で、つまずきやすい箇所まで書いています。

要点だけ：

1. **LINE Official Account Manager で公式アカウントを先に作る**
   （Developers コンソールから Messaging API チャネルを直接作る方法は**廃止済み**）
2. 応答設定で「あいさつメッセージ」「応答メッセージ」を**オフ**、「Webhook」を**オン**
3. Webhook URL に `https://<worker>.workers.dev/webhook` を設定して**検証**
4. 設定後 `https://<worker>.workers.dev/admin/preview?token=<ADMIN_TOKEN>` で
   **送信せずに**通知内容を確認できる

> **LINE Notify は 2025年3月31日でサービス終了済み。** 本プロジェクトは Messaging API を使う。

---

## 知っておくべき制約

### LINE 無料枠：200通/月

```
友だち 10人 → 20回/月 通知できる
友だち 20人 → 10回/月 通知できる  ← 現実的な上限
友だち 40人 →  5回/月            ← 要有料プラン
```

1パスにつき「予告＋リマインド」で**2通**消費する。
枠は LINE の quota API で毎回確認し、足りなければ送信を止める。
**応答メッセージ（reply）は通数を消費しない**ので、地点登録のやりとりは全て reply で行う。

### Starlink について

期待値を正しく設定する必要がある。

| 種別 | 光度 | 肉眼可視性 | 扱い |
|---|---|---|---|
| 運用中（大多数） | 5〜7等 | **ほぼ見えない** | 通知しない |
| **打ち上げ直後のトレイン** | 1〜4等 | **明確に見える** | 通知対象（P4で実装） |

遮光対策後の運用中Starlinkは肉眼では実質見えない。
「Starlinkが見える」の実体は**打ち上げ後 数日〜2週間のトレイン期だけ**である。

### ISSの可視期間は約2か月ごと

ISSは毎晩上空を通るが、**光って見えるのは日没直後と日の出前だけ**。
それ以外の時間帯は地球の影に入っていて光らない。
条件が揃う「可視期間」は約2か月ごとに1〜2週間まとまって訪れる。

**数週間まったく通知が来ないのは正常な動作。**

---

## 精度

| 項目 | 目標 | 検証方法 |
|---|---|---|
| パス開始時刻 | ±30秒 | Heavens-Above との突合（手動・M1完了時） |
| 最大仰角 | ±2° | 同上 |
| 方位角 | ±3° | 同上 |
| 太陽高度 | ±0.5° | **自動テスト**（至の日の南中高度は理論値が決まる） |

軌道計算は `satellite.js` v7（SGP4）。位置誤差は約1kmで、
肉眼観測では時刻数秒・方位1°未満の影響しかない。

最終的な検証は**実際に空を見上げて当たっているか**。それ以外に確かめようがない。

---

## ドキュメント

| | |
|---|---|
| [要件定義書](docs/01-requirements.md) | 何を作るか・作らないか、対象衛星の現実的な期待値 |
| [設計書](docs/02-design.md) | アーキテクチャ、アルゴリズム、スコアリング式 |
| [タスク書](docs/03-tasks.md) | マイルストーンと進捗 |
| [LINE設定手順](docs/04-line-setup.md) | **初回セットアップはここから** |

---

## 地点について

アプリでは **地方 → 都道府県 → 市区町村** の3段階で全国から選べる（約70地点）。

このうち **各都道府県庁所在地＋宮崎県の全市（55地点）** はサーバ側で予報を事前生成しており、
JSONを読むだけで即表示される。それ以外の地点は**ブラウザ内でSGP4を実行して計算**するため、
サーバに無い地点でも同じように使える（Web Worker上、体感0.5〜1秒）。

LINE通知は Cloudflare Worker から送るが、Worker は CPU 10ms 制限で軌道計算ができない。
そのため事前生成されていない地点を登録したユーザーには、
**軌道は最寄りの生成済み地点のものを使い、天気だけは本人の地点で取り直す**。
数十km離れてもISSのパス時刻は数秒しか変わらないが、雲は場所で変わるため。

---

## ライセンス

個人利用。軌道データは [CelesTrak](https://celestrak.org/)、
天気は [Open-Meteo](https://open-meteo.com/) を利用しています。
