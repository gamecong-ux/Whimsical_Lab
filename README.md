# Whimsical Lab

iOSのホーム画面をイメージした、Webアプリへのリンク集です。
現時点では6個のサンプルを表示します。公開済みアプリはまだ登録されていません。

## 確認

`dist/index.html` をブラウザで開くと確認できます。ビルドやインストールは不要です。

## アプリを登録

`dist/apps.js` の apps を編集します。name はアプリ名、url は公開済みアプリの https URL、symbol は絵文字など、colors はアイコンのグラデーション2色です。項目の追加・削除・並べ替えもこの一覧で行います。url が空の場合は準備中の案内を表示します。公開URLを指定すると同じタブで移動します。

## Cloudflare Pagesへの公開

1. Cloudflareのダッシュボードで Workers & Pages を開き、Pages の Direct Upload を選択します。
2. プロジェクト名（例: whimsical-lab）を決めます。使用済みの場合は別の名前を選びます。
3. `dist` フォルダ、またはその内容をまとめた `cloudflare-upload.zip` をアップロードして公開します。
4. 発行された `https://プロジェクト名.pages.dev` を共有します。

Hubは静的ファイルだけで動作します。各アプリのホスティングや利用料は、それぞれの公開先によります。独自ドメインの取得費用は別途必要です。
Direct Uploadで作成したプロジェクトは、後からGit連携方式へ切り替えられません。Git連携を希望する場合は最初からその方式で作成してください。

公式手順: https://developers.cloudflare.com/pages/get-started/direct-upload/

このフォルダには公開用ファイルを用意していますが、Cloudflareへのデプロイはまだ行っていません。
