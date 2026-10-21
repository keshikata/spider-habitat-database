# 検索流入とアクセス解析の設定

2026年10月19日。対象は https://spider-habitat-atlas.pages.dev/ 。Search ConsoleとCloudflare Web Analyticsを使用する。GA4・広告連携・有料サービスは追加しない。

## 設定と確認場所

- [Search Console](https://search.google.com/search-console?resource_id=https%3A%2F%2Fspider-habitat-atlas.pages.dev%2F)：URLプレフィックスとして登録し、HTMLタグで所有権を確認。`/sitemap.xml`を送信した。
- [Cloudflareダッシュボード](https://dash.cloudflare.com/)：ObservabilityのWeb Analyticsから対象ホストを選ぶ。訪問・閲覧数、表示速度とCore Web Vitalsを確認できる。
- サイトマップには正規URLの1ページを記載する。種・地域・フィルターのクエリURLを大量に列挙しない。robots.txtからサイトマップを案内する。

Googleの取り込み・インデックス・検索結果表示は登録とは別の処理。2026年10月19日19:41:19（日本時間）、Googleの公開URLテストでサイトマップの「クロールを許可：はい」「ページの取得：成功」を確認した。HTTP200・XML形式・配信内容とrobots.txtの許可も確認済み。その後一度再送信し、送信完了の表示を確認した。一覧には引き続き「取得できませんでした」が残っており、Google側の再処理待ち。サイトマップの取り込みや、サイト本体のインデックス登録は未確認。

### 2026年10月20日の再確認

トップページはSearch Consoleで「URL は Google に登録されています」と表示された。通常のスマートフォン用Googlebotによる前回のクロールは10月19日19:41:21（日本時間）で、取得成功・クロール許可あり・インデックス許可あり。Googleが選択した正規URLもサイトのルートと一致している。

サイトマップ一覧には「取得できませんでした」が残っている。10月20日16:57:29（日本時間）のGoogle公開URLテストでは、サイトマップの取得成功・クロール許可ありを再確認した。Googleのrobots.txtレポートも「取得済み」、手動による対策も問題なし。公開HTTP応答はサイトマップ・robots.txt・トップページがすべて200で、XMLの構文・名前空間・正規URL、配信内容の一致を検査した。リダイレクト、noindex応答、チャレンジ応答は確認されなかった。GooglebotのUser-Agentを指定した追加検査でも同じXMLが返ったが、この追加検査は実際のGoogle送信元IPによる取得を再現するものではない。

サイト側の取得不良は再現できず、Search Consoleの詳細画面にも具体的な失敗理由は表示されないため、根本原因は確定できていない。Google側のサイトマップ処理に関する一時的な問題・遅延が考えられる。確認済みの同じURLを一度再送信し、10月20日付の送信受付を確認した。直後の一覧はエラーのままで、サイトマップの取り込み完了としては扱わない。正常に取得できる配信設定や、承認待ちの固定版には変更を加えていない。証拠はワークスペースの `sitemap-check-20261020/` に保存した。

## 計測とプライバシー

`site/analytics.js`は本番のHTTPS Originだけで公式スクリプトを読み込む。ローカル、版固有のプレビュー、Do Not TrackまたはGlobal Privacy Controlが有効なブラウザーでは読み込まない。ページのload後に独立して読み込み、主機能を待たせない。

SPA自動計測を無効にし、種や環境の選択ごとにページ閲覧を増やさない。カスタムイベント、検索文字列、CSV・GeoJSONの中身、ユーザーIDを渡す処理は加えない。Cloudflare Pages側の自動挿入は重ねて有効にしない。

CSPで許可する追加通信は、公式の `https://static.cloudflareinsights.com/beacon.min.js` と `https://cloudflareinsights.com` のみ。unsafe-eval、任意の外部スクリプト、フレームやworkerの許可は追加しない。ブラウザーの広告ブロック等で解析が欠ける場合がある。収集数を全アクセスの厳密な総数として扱わない。

所有権確認タグと計測用トークンは公開する識別子で、管理APIの認証情報ではない。確認後もタグを削除せず、標高版へ差し替える際も同じホスト・同じ計測設定を維持する。

## 配信版と検証

公開フォルダーは `output/release-2026-10-19-measurement/`、版URLは https://ee412865.spider-habitat-atlas.pages.dev/ 。前の本番版 `release-2026-10-09-height` と比較し、変更はindex.html、robots.txt、_headers、追加はanalytics.jsとsitemap.xml。残る2,405ファイルの計算・データ・資料はバイト単位で同じ。標高・海岸線・河川の保留は維持する。

JavaScript58件とサイトマップの正規URL検査が合格。ローカル配信を本番Originとして読む隔離テストで公式スクリプトを実行し、集計送信を捕捉してCookie0、検索語・URLクエリのテスト文字列の混入なしを確認した。検証用プロキシではローカルへの要求ヘッダーだけを正規化し、CSPやサーバー本体の防御は無効にしていない。

実サイトでは33ファイル・19,307,430 bytesのハッシュ、HTTPSとセキュリティヘッダーが一致。実際の集計先はHTTP204で受理し、Cookie0・コンソールエラー0・山地の「判定保留」を確認。390・1280pxの説明表示と検索への復帰も確認した。実機Safari・読み上げや新たな全面セキュリティ監査は含まない。

証拠はワークスペースの `site-measurement-20261019/` に保存し、一般配信しない。承認待ち版は `local/elevation-preview-site-2026-10-19-measurement/` として固定。原DEMの取得記録・申請する利用範囲は変更せず、未承認の標高版を公開していない。公開用ソースはローカルのミラーにも同期する。GitHubへpushしたという記録ではない。

### 確認の記録

- 書き手: 決めていない／読み手: general（推定）／場面: manual（推定）
- 実行した検査: lint、diff、資料との照合、最終稿の照合
- 実行しなかった検査: なし
- 硬化の検査: 候補なし
- 勢いの検査: 候補なし
- 見直し候補: 原文 2件 → 最終稿 2件（件数は点数ではなく、増減は読みやすさの良し悪しを示さない）
- yomiyasu-check: executed via=verify run=20261019T103133Z-f1c79311 attempt=1 final=sha256:ec3989a05215 mode=rewrite doc_type=manual reader=general checks=lint,diff,materials meaning_risk=1 replay=skipped

意味リスクの1候補は、今回依頼されたアクセス解析の追加を説明する「使用します」。実装・実送信・公式資料と一致するため維持し、以前の「独自のアクセス解析はない」という説明を更新した。

## 参照と保守

- [Cloudflare Web Analytics](https://www.cloudflare.com/web-analytics/)：CookieやlocalStorageを使った追跡を行わないサービスの説明。
- [計測元と通信先](https://developers.cloudflare.com/web-analytics/data-metrics/data-origin-and-collection/)と[FAQ](https://developers.cloudflare.com/web-analytics/faq/)：CSP、通信先、クエリ文字列の扱い。
- [SPA計測の設定](https://developers.cloudflare.com/web-analytics/get-started/web-analytics-spa/)：種の選択を新しいページ閲覧としない設定。
- [Googleの所有権確認](https://support.google.com/webmasters/answer/9008080?hl=ja)と[サイトマップレポート](https://support.google.com/webmasters/answer/7451001)：タグ維持と取得エラーの確認方法。

personal-dev-kitのComputer Use優先、最小の通信許可、読者に必要な説明、変更に見合う回帰確認を再利用した。再利用できる境界テストはプロジェクトに残し、共通kitへは今回固有の識別子・設定を持ち込まない。
