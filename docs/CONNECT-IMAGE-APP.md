# 画像評価帳をWhimsical Labへ接続する — 作業指示書

作成日：2026年11月16日  
対象：Whimsical Lab（Hub）、画像評価帳、新設する共通ログイン（auth）  
使い方：作業は章ごとに分けて依頼する。各章の冒頭に「誰がやるか」を記した。**ユーザー**の手順はブラウザ上の操作、**Claude**の手順はコード作業。

---

## 0. 決定事項と前提

### 決定事項

- URL構成は **独自ドメイン＋サブドメイン**。
- Googleログインは **Hubで1回行い、各アプリへ引き継ぐ**。
- リポジトリは **モノレポ**（`gamecong-ux/Whimsical_Lab` 1つ）。Hub・auth・各アプリはフォルダで分け、それぞれ **別のCloudflareプロジェクト** として公開し、Hubからリンクする。

### 着手前にユーザーが決めること

| 項目 | 本書での仮表記 | 例 |
| --- | --- | --- |
| 独自ドメイン | `<DOMAIN>` | `whimsical-lab.com` |
| 画像評価帳のサブドメイン | `image.<DOMAIN>` | `image.whimsical-lab.com` |
| 画像評価帳の正式名称 | 「画像評価帳」 | 仮称のまま公開するか |
| ログインを許可する範囲 | — | 自分だけ／招待した人／誰でも |

決まったら、本書の `<DOMAIN>` を実際の値に置き換えてから各章を依頼する。

### 完成後のURL構成

| 役割 | URL | モノレポ内のフォルダ | Cloudflare |
| --- | --- | --- | --- |
| Hub | `https://<DOMAIN>` | `hub/`（既存） | Pages `whimsical-lab`（ルート `hub`、出力 `dist`） |
| 共通ログイン | `https://auth.<DOMAIN>` | `auth/`（新規） | Workers |
| 画像評価帳 | `https://image.<DOMAIN>` | `apps/i-like-it/`（新規） | Pages（新規、ルート `apps/i-like-it`） |

ローカルの作業場所はすべて `D:\MakeApp\Whimsical Lab\` 配下になる。

---

## 1. ログイン方式の設計（全章の前提）

### 1.1 仕組み

```text
[Hub] 「ログイン」 → auth.<DOMAIN>/login → Google → auth.<DOMAIN>/callback
                                                    │ セッションCookieを発行
                                                    │  Domain=.<DOMAIN>
                                                    ▼
[Hub・各アプリ] fetch("https://auth.<DOMAIN>/me", {credentials:"include"})
                → { email, name, picture } が返ればログイン済み
```

- **共通ログイン（auth）** はCloudflare Workers（無料枠）で動かす。
- Googleとの認証は、Worker側の **認可コードフロー（OpenID Connect）** で行う。要求する権限は `openid email profile` のみ。
- セッションCookieの属性：`Domain=.<DOMAIN>`、`HttpOnly`、`Secure`、`SameSite=Lax`、`Path=/`。有効期間は30日。
  - 中身はユーザーID・メール・有効期限で、Workerの秘密鍵で署名（HMAC-SHA256）する。
- JavaScriptからはCookieを読めない（`HttpOnly`）。Hubや各アプリは `/me` を呼んでログイン状態を知る。

### 1.2 authのエンドポイント

| パス | 動作 |
| --- | --- |
| `GET /login?return_to=<URL>` | Googleのログイン画面へ転送する。`state` と `return_to` を短期Cookieに保存する |
| `GET /callback` | `state` を照合し、コードをトークンに交換し、IDトークンを検証する。セッションCookieを発行して `return_to` へ戻す |
| `GET /me` | セッションが有効なら `200 {sub,email,name,picture}`、無効なら `401` を返す |
| `POST /logout` | セッションCookieを削除する。応答は `204` |

### 1.3 必須の安全対策

- `return_to` は **`https://<DOMAIN>` または `https://*.<DOMAIN>` のみ許可** する。それ以外はHubへ戻す（オープンリダイレクト防止）。
- CORS：`Access-Control-Allow-Origin` には、許可リストに一致したOriginだけをそのまま返す。`*` は使わない。あわせて `Access-Control-Allow-Credentials: true` と `Vary: Origin` を付ける。
- `/logout` はPOSTのみとし、Originを照合する。
- 秘密情報（GoogleクライアントシークレットとCookie署名鍵）は `wrangler secret` で登録する。**リポジトリに書かない**（リポジトリは公開）。
- 「ログインを許可する範囲」が「自分だけ」「招待した人」の場合は、許可するメールの一覧をWorkerの環境変数に置き、`/callback` で照合する。

### 1.4 画像評価帳でのGoogleドライブ権限の扱い

画像評価帳は、ブラウザ上でGoogleドライブ（`drive.appdata`）用のアクセストークンを取得して保存している。共通ログインで分かるのは「誰か」だけで、**ドライブの権限は共通化しない**。

- 画像評価帳は `/me` で得たメールを `login_hint` に渡し、従来どおりGoogle Identity Servicesでドライブ用トークンを取得する。
- 初回だけ同意画面が出る。2回目以降はボタン1回で、ポップアップが一瞬開いて自動で閉じる。ブラウザのポップアップ制限があるため、完全な無操作にはできない。
- 共通ログインのメールとドライブ接続アカウントが **一致しない場合は保存を始めず**、警告を出す。
- auth側にドライブの権限（リフレッシュトークン）を持たせる方式は、全員のドライブ権限を1か所に集めることになるため採用しない。

---

## 2. ドメインとGoogle Cloudの準備（ユーザー）

1. **ドメイン取得**：Cloudflareの「ドメインの登録」で `<DOMAIN>` を取得する。DNSも自動でCloudflare管理になる。
2. **Hubに独自ドメインを付ける**：Workers & Pages → `whimsical-lab` → カスタムドメイン → `<DOMAIN>` を追加する。`whimsical-lab-8oa.pages.dev` も引き続き使える。
3. **Google Cloud（既存の画像評価帳のプロジェクトを使う）**
   1. OAuth同意画面：承認済みドメインに `<DOMAIN>` を追加する。
   2. 認証情報 → **共通ログイン用のOAuthクライアントを新規作成** する（種類：ウェブアプリケーション）。
      - 承認済みのリダイレクトURI：`https://auth.<DOMAIN>/callback`
      - 発行されたクライアントIDとシークレットは、後で `wrangler secret` に入れる。チャットには貼らない。
   3. **画像評価帳の既存クライアント**（`config.js` のID）の「承認済みのJavaScript生成元」に `https://image.<DOMAIN>` を追加する。`http://localhost:8080` は開発用に残す。
4. **公開範囲の確認**：同意画面が「テスト」のままなら、ログインできるのはテストユーザーに登録したアカウントだけ。自分以外にも使わせる場合は、その人を追加するか、「本番」へ切り替える。`drive.appdata` は審査の対象になるため、本番化の前に要確認。

---

## 3. 共通ログイン（auth）の新規作成（Claude）

**作業場所**：`D:\MakeApp\Whimsical Lab\auth\`（新規フォルダ）。デプロイは `auth/` で `wrangler deploy` を実行する。将来はCloudflareのGit連携（ルート `auth`）に移すこともできる。

依頼文の例：

> `D:\MakeApp\Whimsical Lab\docs\CONNECT-IMAGE-APP.md` の1章と3章に従って、共通ログイン用のCloudflare Workerを作ってください。ドメインは `<DOMAIN>` です。

作るもの：

- Cloudflare Worker（TypeScript、`wrangler`）。1.2のエンドポイントと1.3の安全対策をすべて実装する。
- `wrangler.toml`：`routes` に `auth.<DOMAIN>/*`（custom_domain）を設定する。秘密情報は書かない。
- 環境変数（秘密でないもの）：`COOKIE_DOMAIN=.<DOMAIN>`、`ALLOWED_ORIGIN_SUFFIX=<DOMAIN>`、許可メール一覧（必要な場合）。
- 秘密情報：`GOOGLE_CLIENT_ID`、`GOOGLE_CLIENT_SECRET`、`SESSION_SECRET`。登録コマンドはREADMEに記載し、値はユーザーが入力する。
- テスト：`return_to` の検証、CORSの許可・拒否、署名の改ざん検出、期限切れの各ケース。
- README：構成、秘密情報の登録方法、デプロイ方法。

完了条件：

- `https://auth.<DOMAIN>/login?return_to=https://<DOMAIN>/` でGoogleログインでき、Hubへ戻る。
- ブラウザの開発者ツールで、`.<DOMAIN>` に `HttpOnly` のセッションCookieが付いていることを確認できる。
- `https://evil.example/` を `return_to` にしてもHubへ戻される。

---

## 4. Hubの変更（Claude）

**作業場所**：`D:\MakeApp\Whimsical Lab\hub\`

依頼文の例：

> `docs/CONNECT-IMAGE-APP.md` の4章に従ってHubを変更してください。

変更内容：

1. **ヘッダー右にログイン状態を表示** する。
   - 未ログイン：「ログイン」リンクを出す。遷移先は `https://auth.<DOMAIN>/login?return_to=<現在のURL>`。
   - ログイン済み：Googleのアイコン画像（小さな円形）を出し、押すとメールと「ログアウト」を表示する。
   - `APP COLLECTION` の文字は残す。配置はユーザーに確認する。
   - `/me` が失敗したとき（authの停止など）は、未ログインとして扱う。一覧の表示は止めない。
2. **画像評価帳を `apps` に登録** する。

   ```js
   { name: '画像評価帳', url: 'https://image.<DOMAIN>/', symbol: '◧', colors: ['#9aa3b5', '#5d6577'] },
   ```

   - アイコン記号と色は仮。ユーザーに確認する。
   - サンプル（アプリ 01〜06）を残すかどうかもユーザーに確認する。
3. **SPEC.md を更新** する。
   - 対象外としていた「ログイン」を対象に移す。
   - 独自ドメイン、URL構成、共通ログインとの関係を追記する。
4. ローカル確認では `/me` に到達できない。そのため `?auth=mock` を付けると、ログイン済みの見た目を確認できるようにする。本番では無効。

完了条件：

- `https://<DOMAIN>` でログイン・ログアウトでき、ヘッダーの表示が切り替わる。
- 画像評価帳のアイコンを押すと `https://image.<DOMAIN>/` へ移動する。

---

## 5. 画像評価帳の変更と公開（Claude＋ユーザー）

**作業場所**：`D:\MakeApp\Whimsical Lab\apps\i-like-it\`（現在の `D:\MakeApp\画像評価帳\` から移す）

依頼文の例：

> `D:\MakeApp\Whimsical Lab\docs\CONNECT-IMAGE-APP.md` の5章に従って、画像評価帳を共通ログインに対応させ、公開できる状態にしてください。

### 5.1 モノレポへの取り込み（Claude、GitHubへの送信はユーザーの承認後）

- `D:\MakeApp\画像評価帳\` を `apps/i-like-it/` にコピーする。
  - 元フォルダは、ユーザーが動作を確認するまで残す。
  - 元フォルダは現在Git管理されていないため、履歴の引き継ぎはない。
- 配信するファイル（`index.html`、`app.js`、`store.js`、`config.js`、`styles.css`）は `apps/i-like-it/public/` に置く。`README.md` は `apps/i-like-it/` 直下に置き、配信対象から外す。
- `画像評価帳を開く.vbs` はローカル専用。モノレポに含めるかユーザーに確認する。含める場合は `public/` の外に置き、新しいパスで動くように直す。
- `config.js` のGoogleクライアントIDは公開情報なので含めてよい。シークレットは存在しない。

### 5.2 コード変更（Claude）

1. `config.js` に `authOrigin: 'https://auth.<DOMAIN>'` と `hubUrl: 'https://<DOMAIN>/'` を追加する。
2. 起動時に `GET {authOrigin}/me`（`credentials: 'include'`）を呼ぶ。
   - **401（未ログイン）**：ログイン画面の主ボタンを「Whimsical Labでログイン」に変え、`{authOrigin}/login?return_to=<現在のURL>` へ移動させる。
   - **200（ログイン済み）**：メールを `loginHint` として保存し、「Googleドライブに接続」ボタンを1つだけ表示する。押すと `requestToken('')` を実行する。
   - **通信失敗**（authの停止、ローカル開発）：従来の「Googleでログイン」にフォールバックする。
3. ドライブ接続後の `userinfo` のメールが、`/me` のメールと **一致しなければ** 保存を始めない。そのうえで「Whimsical Labのアカウントとドライブのアカウントが違います」と表示し、選び直せるようにする。
4. ログアウトは、`{authOrigin}/logout`（POST）と、従来のトークン破棄の両方を行う。
5. 画面の隅に「← Whimsical Lab」（`hubUrl` へのリンク）を追加する。
6. `?demo` と、ローカルの `http://localhost:8080` での従来の動作は維持する。
7. README.md の「設置先」「Google連携の設定」を、本書の構成に合わせて更新する。

### 5.3 公開（ユーザー）

1. Cloudflare → Workers & Pages → Pagesで **新しいプロジェクト** を作り、同じリポジトリ `Whimsical_Lab` を接続する。
   - プロジェクト名：例 `i-like-it`
   - ビルドコマンド：空欄
   - ルートディレクトリ：`apps/i-like-it`
   - ビルド出力ディレクトリ：`public`
   - ビルド監視パス（含める）：`apps/i-like-it/*`
2. カスタムドメインに `image.<DOMAIN>` を追加する。
3. 2章3-3の「承認済みのJavaScript生成元」に `https://image.<DOMAIN>` が入っていることを確認する。

完了条件：

- Hubでログイン済みの状態で画像評価帳を開くと、**ログイン画面を経ずに**「Googleドライブに接続」だけが表示される。
- 接続後、既存の評価データが表示される。データは従来と同じドライブのアプリ専用領域を使うので、移行は不要。
- 別のGoogleアカウントでドライブに接続しようとすると、警告が出て保存されない。

---

## 6. 結合確認（ユーザー＋Claude）

| # | 操作 | 期待結果 |
| --- | --- | --- |
| 1 | シークレットウィンドウで `https://<DOMAIN>` を開く | 未ログイン表示、アプリ一覧が見える |
| 2 | ログイン | Googleを経てHubへ戻り、アイコン画像が表示される |
| 3 | 画像評価帳を開く | 「Googleドライブに接続」のみ表示される |
| 4 | 接続 | 評価一覧が表示される。評価を変えると保存される |
| 5 | Hubへ戻ってログアウト → 画像評価帳を再読み込み | 未ログイン表示になる |
| 6 | スマホ（iOS Safari）で1〜4 | 同様に動作する。Safariの追跡防止で問題が出ないか確認 |
| 7 | `https://image.<DOMAIN>/?demo` | ログインなしでデモが動く |

---

## 7. 作業順序のまとめ

1. ユーザー：0章の決定事項を決める → 2章（ドメイン・Google Cloud）
2. Claude：3章（auth作成）→ ユーザー：秘密情報を登録し、デプロイを承認
3. Claude：4章（Hub）→ ユーザー：GitHubへの送信を承認 → Hubが自動で公開される
4. Claude：5.1〜5.2（画像評価帳）→ ユーザー：5.3（公開）
5. 6章の結合確認

### 対象外（今回はやらない）

- 画像評価帳以外のアプリの接続。手順は5章と同様になる見込み。
- ユーザー管理画面、Google以外のログイン方法。
- Hubと各アプリの間でのデータ共有。
