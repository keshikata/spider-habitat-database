# 素材と利用条件

確認日: 2026-10-08。非商用の個人研究サイトを対象とする。元データの規約と、サイト独自のコード・解析成果の扱いを混同しない。

| 素材 | 確認した条件・使い方 |
| --- | --- |
| JAXA HRLULC 2024JPN_v25.04 | [配布元](https://www.eorc.jaxa.jp/ALOS/jp/dataset/lulc_j.htm)と[研究データ利用条件](https://earth.jaxa.jp/ja/data/policy/)を確認。無償の利用・改変・第三者配布が可能で、提供元・データ名の表示が必要。商用目的の事前連絡と、成果公表時の任意連絡を区別する。 |
| 国土数値情報 行政区域2025年版 | [当該版](https://nlftp.mlit.go.jp/ksj/gml/datalist/KsjTmplt-N03-2025.html)のCC BY 4.0、出典・加工表示を確認。参照した環境集計では画素の所属県を決めるために使用。行政境界の図形や元GISは配信しない。測量成果の一般配信手続はCC BYだけから不要と断定しない。 |
| 国土地理院DEM | [手続案内](https://www.gsi.go.jp/LAW/2930-index.html)と[利用例](https://www.gsi.go.jp/LAW/2930-sample.html)を確認。非商用・趣味研究だけを理由に公開地図の手続が不要とは判断できない。公開条件が確認できるまでDEM由来の解析地図を一般配信へ含めない。 |
| 地理院タイル | [Q1-12](https://www.gsi.go.jp/LAW/2930-qa.html)に従い、閲覧者のブラウザからリアルタイムで表示し、地理院タイル一覧へのリンクと必要な個別出典を記す。保存したタイルの再配布は行わない。 |
| Japan Spider Catalog | 所有者が指定した分類参照元。学名・和名・科・属・種IDを選別して使う。写真や人物情報、内部ノートを分類情報に混ぜない。公開サイトのTaxonName.json・DistributionRecord_web.records.json・UpdateHistory.jsonを2026-10-08に取得。配信履歴ver.2.0.7（2026-09-25）。参照日と入力ハッシュを記録し、分類と県別集計のみを再配信する。 |
| 生息環境CSV | 所有者の研究用整理データ。図鑑の元記述・画像をサイトへ転載せず、解析用に再分類した条件を表示する。LLM整理時の根拠文献・ページが各行に保存されていないため、生態的な妥当性の確認は完了していない。 |
| 旧スライド・出力画像 | 第三者の図・画像を含むため一括転用しない。研究の目的と方法を参照する。 |
| WSC | [Data Resources](https://wsc.nmbe.ch/dataresources)と公開の種別分類履歴を確認。84学名の対応表に採用名・LSID・確認先・確認日を保存。World Spider Catalog (2026), Natural History Museum Bernを表示し、編集対応表と対応情報をCC BY-NC-SA 4.0で提供する。APIキー不要の公開情報だけを参照。 |
| Leaflet 1.9.4 | BSD 2-Clause。既存の同梱版を使用し、著作権表示とLICENSE.txtを配信。外部CDNからの実行スクリプト取得なし。 |

淡色地図の低ズームではVMAP0の海岸線出典が必要であることを公式タイル一覧の該当欄で確認し、サイトの地図直下と出典欄に表示した。行政区域2025年版の公式HTMLに「オープンデータ（CC_BY_4.0）」を確認。国土地理院DEMを使った自作解析レイヤは初版の配信対象から除外している。

原本の図鑑記述は公開せず、分類コードと未評価条件への対応を独自に計算して表示する。公開時の第三者への連絡は必須条件として確認できたもの以外は実施していない。

無料運営では公開前のローカル計算と静的配信を基本とする。[Cloudflare Pagesの無料枠](https://developers.cloudflare.com/pages/platform/limits/)は月500ビルド、20,000ファイル、1ファイル25MiB。[GitHub Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages)はGitHub Freeの非公開リポジトリからの公開を対象としないため、非公開ソースと無料ホスティングを分ける。
