# 無料公開の構成と残る確認

2026-10-08更新。Cloudflare Pagesの空プロジェクト `spider-habitat-atlas` を作成済み。サイトはまだデプロイしていない。

## 公開する範囲

無料・非商用、静的ファイルだけで運営する。JAXA土地被覆・水域/人工構造物/林縁/水田への距離・植生・県/本土/島区分と、JSCに基づく検索を提供する。保留中の海岸線距離・河川距離・標高データは配布しない。環境名による検索は残す。素材ごとの根拠は[sources.md](sources.md)。

公開用データを `local/public-spatial/` に作り、公開用の資料画像を `local/public-presentation/` に分ける。原本 `local/spatial-reference/` と `local/presentation/` は残す。ブラウザーは同じ配信元の `/data/spatial/` と `/slides/` を使い、localhostでも公開先でも同じ計算を行う。データがなければ読込エラーにし、別モデルへ自動切替しない。

```sh
node scripts/prepare-public-spatial.mjs
node scripts/check-public-spatial.mjs
python scripts/audit_habitat_rules.py
node scripts/build-public-site.mjs
```

出力先は新規または空のディレクトリにする。古いファイルが混ざる場合はビルドを止める。`build-public-site.mjs` は明示したアプリ資産・検証済みマニフェストの参照先・確認済み資料画像20枚だけを `output/public-site/` にコピーする。DEM・海岸線距離・河川距離のビットが数値に残っていないこと、ハッシュ、ファイル数と最大サイズを確認する。元GIS、研究CSV、PPTX、PC内パス、申請控えは含めない。

## 許諾待ちを公開の条件にしない

海岸線・河川の加工データとDEMの一般配布は確認待ちとして外す。旧約款への問い合わせや未送信のGSI申請の再開は、これらを将来追加するときの作業とする。現在の公開範囲について一律に許諾を申請する必要はない。出典・加工表示、CCライセンス、引用の区分をページと保存ファイルへ反映する。

発表資料は残す。自己作成・フリー素材のアイコンは維持する。書影・第三者ロゴ等はWeb用コピーで書誌・データ名に置換し、DEM由来図は保留表示とする。国立環境研究所の図は方法の違いを説明する引用として出典と区分を明示する。メールアドレス・プロフィールは残し、発表者氏名の直接表記は外す。

## 無料枠と配信

[Cloudflare Pages Free](https://developers.cloudflare.com/pages/platform/limits/)の20,000ファイル・1ファイル25MiB以内で構成する。[静的ファイルへのリクエストは無料・回数無制限](https://developers.cloudflare.com/pages/functions/pricing/)。Functions、外部DB、有料ストレージ、独自ドメインは使わない。全国の地図を一括取得せず、必要な県と範囲を読み込む。

[管理画面のアップロードは1,000ファイル、Wranglerは20,000ファイル](https://developers.cloudflare.com/pages/get-started/direct-upload/)のため、今回の配信はWranglerを使用する。公開対象は `site/` や研究フォルダではなく、確認済みの `output/public-site/` のみ。

## 配信前に行うこと

- 公開用フォルダだけを使ったプレビューで検索・保留表示・地図・比較・CSV・GeoJSON・発表資料を確認する。
- `npm test`、`npm run check`、公開用データの全区画照合を通す。
- 更新履歴へ実際の初回公開日を記入する。準備日を公開日として表示しない。
- 公開リポジトリのコード・説明資料を同期する。配信データと資料画像は同リポジトリへ入れない。
- ユーザーの公開指示を受けて `wrangler pages deploy output/public-site --project-name spider-habitat-atlas --branch main` を実行し、HTTPS・CSP・配信ヘッダー・ファイル取得を確認する。

この文書は配信準備を示し、デプロイや許諾問い合わせを実行済みとするものではない。
