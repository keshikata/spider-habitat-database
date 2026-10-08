# 日本産クモ類 生息候補地データベース

公開サイト：https://spider-habitat-atlas.pages.dev/ （2026-10-08初回公開）

生息環境・県別記録・土地被覆を組み合わせ、クモの調査候補地と候補面積を比べる静的Webサイトのコードです。2026年4月26日の東京蜘蛛談話会の発表をもとにしています。候補面積は実際の生息面積や出現確率ではありません。

## 現在の範囲

分類1,741分類群、生息環境登録796分類群を収録する構成です。全178環境のうち108環境を計算し、19環境は配布条件の確認待ち、51環境はその他の未評価として扱います。保留・未評価の環境も名称で種を検索できます。

計算には土地被覆、水域・人工構造物・林縁・水田への距離、植生図の区分を使用します。標高・海岸線距離・河川距離の数値は配信データから取り除き、これらが必要な環境を一般の草地や水辺で代用しません。標高による絞り込みは将来対応です。

生息環境の複数選択、土地被覆のオン・オフ、種・属の比較、県別・環境別CSV、表示範囲のGeoJSONに対応します。選択条件は地図・面積・出力へ共通で適用します。比較上限は最多属の収録種数から求め、現在はCybaeusの93種です。本土・島・地域詳細不明の記録を区別し、県境の画素も所属県ごとに集計します。

[計算方法](docs/spatial-model.md)・[全環境の対応一覧](docs/habitat-condition-review.md)・[素材と利用条件](docs/sources.md)・[学名対応](docs/taxonomy-review.md)。

## 含まれるもの

HTML/CSS/JavaScript、変換・検証スクリプト、テスト、方法・出典の説明資料を公開します。配信データ、研究CSV、原GIS、PPTX、資料画像、記録者情報、申請控えは含みません。研究用リポジトリと原本は別管理です。

## 実行・検証

Node.js 22以降、Python 3.10以降。通常のテストに追加パッケージは不要です。分析の再計算にはnumpy・scipy・rasterio・geopandas・pyogrio・shapelyを使用します。

```sh
npm test
python -m unittest discover -s tests -p 'test_*.py'
```

研究用学名対応表が必要なPythonの2テストと、分析用依存が必要な距離変換の3テストは、未配置時だけスキップします。利用権限のある入力から[入力契約](docs/data-contract.md)と[計算方法](docs/spatial-model.md)に従って研究用データを構築した後、公開用データを生成します。

```sh
node scripts/prepare-public-spatial.mjs
node scripts/check-public-spatial.mjs
python scripts/audit_habitat_rules.py
node scripts/build-public-site.mjs
node scripts/check-public-site.mjs
npm run dev
```

公開用フォルダは新規または空にします。原本の標高・海岸線距離・河川距離の区分を合算して取り除き、残る条件の画素数・面積を維持します。環境対応一覧も公開用規則から生成します。研究用規則の再計算には明示的に `--research --refresh` を指定します。

プレビューは http://127.0.0.1:5187 。配信データは `local/public-spatial/`、確認済み資料画像は `local/public-presentation/` に必要です。研究フォルダは配信しません。データがなければエラーとし、別モデルへ自動切替しません。公開と同じCSPの確認には `npm run dev -- --strict-csp` を使います。

## 配信・プライバシー

公開対象はビルドした `output/public-site/` のみです。検証済みマニフェストの参照ファイルとハッシュ確認済みの資料画像を収録し、不要な研究資産を混入させません。地図は必要な県・範囲だけ読み込み、改ざん・展開サイズ・中断を検査します。元データの更新後は配信パックも再生成します。

背景は初期状態で「背景なし」。利用者が選んだときだけ地理院タイルを取得し、検索条件を参照元URLとして送信しません。独自のアクセス解析・追跡Cookie・ログイン・閲覧時のAI APIはありません。

発表資料、メールアドレス、個人プロフィールへのリンクを維持します。自己作成・フリー素材のアイコンを残し、Web用表紙の発表者氏名を除去します。原本と引用文献の著者名は変更しません。資料内の引用図と配布データの利用条件は別に記録します。

## 公開準備

Cloudflare Pagesの無料プランとpages.dev URLで公開済みです。Functions・DB・有料ストレージは使いません。更新には[公開手順](docs/release-checklist.md)に従い、検証済みフォルダのみを使用します。保留中のデータは初版に含めていません。[初回配信の記録と公開後の作業](docs/post-release.md)をまとめています。

JavaScript33件・Python20件の回帰テストと、全2,260タイルの公開用変換照合、公開候補2,405ファイルの許可リスト・ハッシュ検査を実施しました。6ページ×6サイズの表示確認も完了しています。[最終確認の結果と測定範囲](docs/prepublication-check.md)を参照してください。初回公開後にHTTPS・配信ヘッダー、主要34ファイルの内容一致、実際のCSV・GeoJSON保存を確認しました。

## 利用条件・連絡先

素材ごとの根拠は[出典と利用条件](docs/sources.md)を参照してください。コードの再利用条件は作者へお問い合わせください。同梱Leafletには[BSD 2-Clause License](site/vendor/leaflet/LICENSE.txt)が適用されます。

ryotahidakaac@gmail.com / [ResearchGate](https://www.researchgate.net/profile/Ryota-Hidaka)
