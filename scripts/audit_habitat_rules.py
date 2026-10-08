"""Write the complete habitat/condition review and optionally refresh preview rules."""
import argparse, collections, json
from pathlib import Path
from build_data import ROOT
from spatial_rules import spatial_rule

def audit(args):
    source=json.loads(args.summary.read_text(encoding='utf-8'))
    catalog=json.loads((ROOT/'site/data/catalog.json').read_text(encoding='utf-8'))
    reviewed={sid:[{**r,**spatial_rule(r['label'])} for r in rules] for sid,rules in source['rules'].items()}
    rules={r['id']:r for rs in reviewed.values() for r in rs}
    status=lambda r:'未評価' if not r['supported'] else '代理条件' if r['proxy'] else '条件を計算'
    counts=collections.Counter(status(r) for r in rules.values())
    lines=['# 複合環境178種類の条件確認','', '確認日：2026-10-08。環境名の限定語を省略して、広い森林・草地として計算しない。', '',
           f"全{len(rules)}環境：条件を計算{counts['条件を計算']}、代理条件で計算{counts['代理条件']}、未評価{counts['未評価']}。代理条件は実際の生息環境の同定や予測精度を保証しない。", '',
           '## 全体の判断', '',
           '- 土地被覆、海岸線・水域・人工構造物・林縁・水田からの距離、標高帯を組み合わせる。距離は100・250・500m。各環境の条件はAND、環境間はOR。同じ画素は一度だけ数える。',
           '- 林縁は森林・竹林と既知の他の土地被覆の境界。未分類との境界は林縁としない。市街地の芝生・林には人工構造物への距離を必須にする。',
           '- 「海岸～低山地」は範囲の記述であり、海岸への近さと低山地標高を同時要求する意味にはしない。800m未満の仮区分として扱う。',
           '- 平地・低山地・山地等の200m・800m区分、公園・庭等の位置、水田の畦の近似は代理条件として表示する。標高を外した設定では、その条件が未適用であることを表示する。',
           '- 条件が不足する環境は候補面積と地図に加算しない。一つの種が評価可能・不可能の両方を持つ場合、計算から除いた環境名を表示し、CSVとGeoJSONにも残す。', '',
           '## 追加データまたは定義が必要な条件', '',
           '| 条件 | 必要な情報 |', '| --- | --- |',
           '| 河川・河川敷・渓流・河口・湖沼・沼沢 | 水域の種類、河道・湖岸・河川敷の範囲。汎用の水域には海もあるため、そのまま代用しない。 |',
           '| 里山・人里 | 森林・耕地・集落の組合せ、対象範囲・空間スケールの定義。 |',
           '| 植林地・造林地・牧草地 | 林相・人工林区分、農地の利用区分。 |',
           '| 潮間帯・砂浜・岩場 | 潮位・干出域、砂・岩などの底質。裸地だけで代用しない。 |',
           '| 街路樹・港湾・旧家・良い林 | 道路沿いの樹木、港湾区域、建物年代、林の質の具体的な定義と位置。 |',
           '| ハイマツ帯・亜高山帯・高山帯・寒冷地 | 緯度・地域ごとの植生帯と気候。標高800m以上だけで代用しない。 |',
           '| 落葉層・薮・洞窟・建物内部・石垣など | 現地・微環境データ。約10m土地被覆では区別できない。 |', '',
           '## 全環境の照合結果', '',
           '| ID | 環境名 | 条件 | 扱い | 未評価の条件・限界 |', '| --- | --- | --- | --- | --- |']
    for rid,r in sorted(rules.items()):
        conditions=['・'.join(catalog['classes'][c] for c in r['classes'])]
        for key,label in [('water','水域'),('coast','海岸線'),('built','人工構造物'),('edge','林縁'),('rice','水田')]:
            if r[key]:conditions.append(label+'からn m以内')
        if len(r['elevation'])<4:conditions.append('標高帯 '+','.join(str(n) for n in r['elevation']))
        text=' AND '.join(conditions) if r['supported'] else '面積・地図に加算しない'
        notes='。'.join(r['limitations'] if r['supported'] else r['pending'])
        lines.append('| '+' | '.join([rid,r['label'].replace('~','～').replace('〜','～'),text,status(r),notes or '指定した土地被覆と距離条件を使用'])+' |')
    lines+=['','標高帯0＝200m未満、1＝200m以上800m未満、2＝800m以上。欠損を高さの条件へ適合させない。', '',
            '海岸線は[国土数値情報C23・2006年版](https://nlftp.mlit.go.jp/ksj/gml/datalist/KsjTmplt-C23.html)を加工。距離の近似・原データの年代・利用条件は[sources.md](sources.md)と[spatial-model.md](spatial-model.md)を参照。']
    args.out.write_text('\n'.join(lines)+'\n',encoding='utf-8')
    if args.refresh:
        source['rules']=reviewed;source['ruleReview']='habitat-review-2026-10-08'
        args.summary.write_text(json.dumps(source,ensure_ascii=False,separators=(',',':')),encoding='utf-8')
    print(json.dumps({'total':len(rules),'status':dict(counts),'output':str(args.out),'refreshed':args.refresh},ensure_ascii=False))

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--summary',type=Path,default=ROOT/'local/spatial-compound/summary.json');p.add_argument('--out',type=Path,default=ROOT/'docs/habitat-condition-review.md');p.add_argument('--refresh',action='store_true');audit(p.parse_args())
