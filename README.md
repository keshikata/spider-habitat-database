# 日本産クモ類 生息環境データベース

生息環境の記述・県別記録・土地被覆を組み合わせ、クモの調査候補地を検索し、種ごとの候補面積と環境内訳を比較する静的Webサイトのコードです。

2026年4月26日の東京蜘蛛談話会例会で発表した「クモの生息地を推定する簡易モデルの試案」をもとにしています。現在のWeb版は土地被覆を使い、標高・気温・微環境は今後の対応課題です。候補面積は実際の生息面積や出現確率ではありません。

## このリポジトリに含むもの

HTML/CSS/JavaScript、データ変換・検証スクリプト、計算のテスト、方法・出典の説明資料を公開しています。研究用CSV、配信データ、GIS、スライド、記録者情報、ローカル監査資料は含みません。元の研究用リポジトリは別に管理しています。

## 開発とテスト

Node.js 22以降とPython 3.10以降を使用します。追加パッケージのインストールは不要です。

```sh
npm test
python -m unittest discover -s tests -p 'test_*.py'
```

研究用の学名対応表を必要とするPythonの2テストは、データ未配置の場合だけスキップされます。

Webサイトを実行するには、利用権限のある入力から配信データを作成してください。[入力契約](docs/data-contract.md)を参照。

```sh
python scripts/sync_jsc.py --date 2026-10-08 --out local/jsc-live
python scripts/build_data.py --jsc local/jsc-live --habitat /path/to/habitat --environment /path/to/trial-data
python scripts/pack_maps.py
npm run check
npm run dev
```

取得日には実際の日付を指定し、分類参照日や更新履歴も更新します。学名対応表は入力契約に従って配置します。プレビューは http://127.0.0.1:5187 。配信先は `site/` のみです。

## 表示と計算

- 初回は広域地図、拡大時は表示範囲の県だけを読み込みます。詳細は最大4県をキャッシュします。
- 面積は元の画素数を緯度に応じた面積に換算し、画面の拡大倍率とは独立して集計します。
- 同じ画素を二重に数えず、未評価とゼロを区別します。
- CSVは環境別・県別に出力し、出典と計算条件を付けます。
- 閲覧時のAI API、ログイン、独自のアクセス解析、解析用バックエンドはありません。背景地図は地理院タイルを使います。

## 方法・出典・利用条件

[モデルの検討](docs/model-review.md)・[素材と利用条件](docs/sources.md)・[学名対応の判断](docs/taxonomy-review.md)。研究データの配布許諾は素材ごとに異なります。コードの再利用条件は作者へお問い合わせください。同梱Leaflet 1.9.4には[BSD 2-Clause License](site/vendor/leaflet/LICENSE.txt)が適用されます。

## 連絡先

ryotahidakaac@gmail.com / [ResearchGate](https://www.researchgate.net/profile/Ryota-Hidaka)
