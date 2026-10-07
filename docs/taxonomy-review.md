# WSCによる84学名の照合

確認日：2026-10-08。World Spider Catalog (2026), Natural History Museum Bern の公開種一覧 `species_export_20261007.csv` と各種の分類文献履歴を確認した。対象は旧生息環境CSVとJapan Spider Catalogの分類スナップショットで名称が一致しなかった84学名。

結果：WSC履歴による77学名の対応に、所有者の判断による5件を追加。残る1件は除外、1件は未同定。環境情報796分類群、土地被覆への対応649分類群。全1,741分類群をWSC準拠に変更したものではない。

全84件の構造化対応表には元の学名・和名、分類表の種ID、WSC採用名、判断、LSID、確認URL、確認日、取得ページのハッシュを保存した。対応表は研究データとして別管理し、このコード・説明資料のリポジトリには含めない。公開UIには必要な出典だけを表示する。

## 対応の基準

- 属の移動：旧組合せから現在の採用名への分類履歴を確認。
- 綴り・語尾：命名者・年および履歴を照合。和名一致だけで決めない。
- 同物異名：現在採用されている関係を確認。古い同物異名扱いが否定されていないかも確認。
- 分類体系の差：Neoscona semilunaris / Araneus semilunaris、Fusciphantes iharai / Arcuphantes iharai はWSCと日本目録で属の扱いが異なる。同じ種への対応が追えるため結合し、両名称を保存。
- 未同定名、誤同定、種の再分離は単なる別名にしない。

学名照合の改善は環境情報の出典や生態学的妥当性まで検証したという意味ではない。古い文献で混同された個々の記録の再同定は未実施。

## 所有者が判断した7学名（2026-10-08）

| 旧研究資料の名称 | 最終的な扱い |
| --- | --- |
| Ryuthela tanikawai | 独立種として取り上げない。旧研究資料の環境もR. ishigakiensisへ自動統合しない。WSCとの扱いの違いを保持。 |
| Platnickina mneon（サトヒメグモ） | Platnickina adamsoniへ対応。[指定の著者投稿](https://x.com/Sasagani_ya/status/1965374575950328281?s=20)の本文と会話内の解説を確認。真のYunohamella mneonとは区別。 |
| Araneus mitificus（ビジョオニグモ） | 所有者が採用した候補Bijoaraneus komachiへ対応。旧資料の種概念に限った対応。 |
| Diaea sp.（ナカブサカニグモ） | 未同定表記のため対応する種を特定できない。 |
| Cheiracanthium mordax（ミナミコマチグモ） | 所有者が採用したCheiracanthium submordaxへ対応。WSCの同物異名認定とは扱わない。 |
| Phintella versicolor（メスジロハエトリ） | 所有者指定どおりPhintella versicolorを表示。JSCの同和名の分類項目Phintelloides munitus（ID1698）との対応をcatalogScientificに保持する。 |
| Yaginumaella ususudi（ウススジハエトリ） | 所有者指定のYaginumaella striatipesへ対応。WSCはususudiを独立種としているため、WSC確認済みのシノニムとはしない。 |

旧研究資料の対応表は、公開JSCから取得した現行名の分布記録には適用しない。公開JSCの記録は現在の学名で分類表へ対応し、メスジロハエトリの表示だけをサイトの判断で調整する。

WSC由来の編集対応表および公開カタログ中の対応情報は [CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/) で提供する。出典：[WSC Data Resources](https://wsc.nmbe.ch/dataresources)。他のデータ・コードへ一律にこのライセンスを適用するものではない。
