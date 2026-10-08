# SNS共有表示

OGPとXの大きな画像カードに対応。画像はサイト全体を紹介する共通カードで、種や地域ごとの個別カードではない。条件付きのURLはそのまま操作を再現できる。

- 公開URL： https://spider-habitat-atlas.pages.dev/
- 画像： https://spider-habitat-atlas.pages.dev/ogp-2026-10-09.png
- 画像寸法：1200 × 630 px、PNG、101,625 bytes。
- サイト名、説明、正規URL、画像の寸法・形式・代替テキストをHTMLのheadへ記載する。
- X用のカード指定は `summary_large_image`。個人アカウント情報は追加しない。
- 画像は独自の文字・模式図と利用条件を確認したNoto Sans JPのみで作成。詳しくは[素材と利用条件](sources.md)を参照。
- PNGはSNSが取得するための資産で、サイトの初期画面では読み込まない。外部フォントやカード生成サービスへの通信を追加しない。

## 更新時の確認

`scripts/check-public-site.mjs` は `scripts/check-sharing.mjs` で静的HTMLを読み、タグの欠損・重複、タイトル・説明の一致、画像URL、PNGの実体・寸法・容量、robots.txtを検査する。
本番の `scripts/check-deployment.mjs` は画像・robots.txtを含む資産のHTTP状態、画像のContent-Type、内容ハッシュ、セキュリティヘッダーを確認する。

画像を変更する場合は新しい日付付きファイル名にし、タグと資産の許可リストを同時に更新する。SNSの保存済みカードがすぐに新しくなるとは限らない。
新しい投稿でのSNS側の表示確認は、公開HTML・画像の配信確認とは別に行う。カード確認のためだけに投稿を送信する必要はない。

仕様：[Open Graph protocol](https://ogp.me/)。
