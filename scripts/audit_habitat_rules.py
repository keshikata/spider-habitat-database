"""Write the public habitat review; research rule refresh requires --research."""
import argparse, collections, json
from pathlib import Path
from build_data import ROOT
from spatial_rules import spatial_rule

def public_audit(args):
    source=json.loads(args.summary.read_text(encoding='utf-8'))
    if source.get('localOnly') is not False or source.get('dem') is not False or not source.get('publicationPolicy'):
        raise ValueError('Public review requires the prepared public summary')
    catalog=json.loads((ROOT/'site/data/catalog.json').read_text(encoding='utf-8'))
    rules={r['id']:r for rs in source['rules'].values() for r in rs}
    status=lambda r:'計算・配布を保留' if r.get('publicationHold') else '未評価' if not r['supported'] else '近似条件' if r['proxy'] else '条件を計算'
    counts=collections.Counter(status(r) for r in rules.values())
    lines=['# 生息環境の対応一覧','',f"{source.get('publicationDate', source['date'])}。公開用の規則から生成。全{len(rules)}環境のうち{counts['条件を計算']+counts['近似条件']}環境を計算、{counts['計算・配布を保留']}環境は計算・配布を保留、{counts['未評価']}環境はその他の未評価。すべて名称で検索できる。標高条件を必要とする環境は、高さで限定できるまで地図・面積に含めない。",'', '| ID | 環境名 | 現在の条件 | 扱い | 限界・保留理由 |','| --- | --- | --- | --- | --- |']
    vegetation={1:'果樹園',2:'植林地',3:'牧草地',4:'ハイマツ群落',5:'低木群落'}
    for rid,r in sorted(rules.items()):
        conditions=['・'.join(catalog['classes'][c] for c in r['classes'])]
        for key,label in [('water','水域'),('built','人工構造物'),('edge','林縁'),('rice','水田')]:
            if r[key]:conditions.append(label+'から指定距離以内')
        if r['vegetation']:conditions.append('植生図の'+vegetation[r['vegetation']])
        condition=' AND '.join(conditions) if r['supported'] else '地図・面積へ加算しない'
        notes='。'.join(r['limitations'] if r['supported'] else r['pending'])
        lines.append('| '+' | '.join([rid,r['label'].replace('~','～').replace('〜','～'),condition,status(r),notes or '指定した条件を使用'])+' |')
    args.out.write_text('\n'.join(lines)+'\n',encoding='utf-8')
    print(json.dumps({'total':len(rules),'status':dict(counts),'output':str(args.out)},ensure_ascii=False))

def audit(args):
    source=json.loads(args.summary.read_text(encoding='utf-8'))
    catalog=json.loads((ROOT/'site/data/catalog.json').read_text(encoding='utf-8'))
    reviewed={sid:[{**r,**spatial_rule(r['label'])} for r in rules] for sid,rules in source['rules'].items()}
    rules={r['id']:r for rs in reviewed.values() for r in rs}
    status=lambda r:'未評価' if not r['supported'] else '近似条件' if r['proxy'] else '条件を計算'
    counts=collections.Counter(status(r) for r in rules.values())
    lines=['# 生息環境178種類の条件確認','', '確認日：2026-10-08。環境名の限定語を省略して、広い森林・草地として計算しない。', '',
           f"全{len(rules)}環境：条件を計算{counts['条件を計算']}、近似条件で計算{counts['近似条件']}、未評価{counts['未評価']}。近似条件は実際の生息環境の同定や予測精度を保証しない。", '',
           '## 全体の判断', '',
           '- 土地被覆、海岸線・水域・人工構造物・林縁・水田・河川中心線からの距離、植生図の区分を組み合わせる。距離は100・250・500m。各環境の条件はAND、環境間はOR。同じ画素は一度だけ数える。',
           '- 林縁は森林・竹林と既知の他の土地被覆の境界。未分類との境界は林縁としない。市街地の芝生・林には人工構造物への距離を必須にする。',
           '- 「海岸～低山地」は範囲の記述であり、海岸への近さと低山地標高を同時要求する意味にはしない。現在は標高を使わず、土地被覆の条件を使う。',
           '- 標高条件はサイトでは未実装・将来対応。公園・庭等の位置、水田の畦は近似として、その限界を表示する。',
           '- 条件が不足する環境は候補面積と地図に加算しない。一つの種が評価可能・不可能の両方を持つ場合、計算から除いた環境名を表示し、CSVとGeoJSONにも残す。', '',
           '## 追加データまたは定義が必要な条件', '',
           '| 条件 | 必要な情報 |', '| --- | --- |',
           '| 渓流・河口・湖沼・沼沢 | 河川線だけでは流れの特性・河口域・湖岸を確定できない。河川敷は今回W05中心線＋草地で近似。 |',
           '| 里山・人里 | 森林・耕地・集落の組合せ、対象範囲・空間スケールの定義。 |',
           '| 果樹園・植林地・造林地・牧草地・ハイマツ帯・薮 | 今回、GHFの現存植生図2024の対応凡例を使用。原図の調査年代・縮尺・凡例による限界は残る。 |',
           '| 潮間帯・砂浜・岩場 | 潮位・干出域、砂・岩などの底質。裸地だけで代用しない。 |',
           '| 街路樹・港湾・旧家・良い林 | 道路沿いの樹木、港湾区域、建物年代、林の質の具体的な定義と位置。 |',
           '| 亜高山帯・高山帯・寒冷地 | 緯度・地域ごとの植生帯と気候。標高800m以上だけで代用しない。 |',
           '| 落葉層・洞窟・建物内部・石垣など | 現地・微環境データ。約10m土地被覆では区別できない。 |', '',
           '## 全環境の照合結果', '',
           '| ID | 環境名 | 条件 | 扱い | 未評価の条件・限界 |', '| --- | --- | --- | --- | --- |']
    for rid,r in sorted(rules.items()):
        conditions=['・'.join(catalog['classes'][c] for c in r['classes'])]
        for key,label in [('water','水域'),('coast','海岸線'),('built','人工構造物'),('edge','林縁'),('rice','水田'),('river','河川中心線')]:
            if r[key]:conditions.append(label+'からn m以内')
        if r['vegetation']:conditions.append('植生図：'+{1:'果樹園',2:'植林地',3:'牧草地',4:'ハイマツ群落',5:'低木群落'}[r['vegetation']])
        if len(r['elevation'])<4:conditions.append('標高条件は未実装')
        text=' AND '.join(conditions) if r['supported'] else '面積・地図に加算しない'
        notes='。'.join(r['limitations'] if r['supported'] else r['pending'])
        lines.append('| '+' | '.join([rid,r['label'].replace('~','～').replace('〜','～'),text,status(r),notes or '指定した土地被覆と距離条件を使用'])+' |')
    lines+=['','内部の研究計算には標高帯を残すが、現在のサイトでは使用しない。', '',
            '海岸線は[国土数値情報C23・2006年版](https://nlftp.mlit.go.jp/ksj/gml/datalist/KsjTmplt-C23.html)を加工。距離の近似・原データの年代・利用条件は[sources.md](sources.md)と[spatial-model.md](spatial-model.md)を参照。']
    args.out.write_text('\n'.join(lines)+'\n',encoding='utf-8')
    if args.refresh:
        source['rules']=reviewed;source['ruleReview']='habitat-review-2026-10-08'
        args.summary.write_text(json.dumps(source,ensure_ascii=False,separators=(',',':')),encoding='utf-8')
    print(json.dumps({'total':len(rules),'status':dict(counts),'output':str(args.out),'refreshed':args.refresh},ensure_ascii=False))

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--summary',type=Path);p.add_argument('--out',type=Path);p.add_argument('--research',action='store_true');p.add_argument('--refresh',action='store_true');args=p.parse_args()
    if args.refresh and not args.research:p.error('--refresh requires --research')
    args.summary=args.summary or ROOT/('local/spatial-reference/summary.json' if args.research else 'local/public-spatial/summary.json')
    args.out=args.out or ROOT/('local/research-habitat-review.md' if args.research else 'docs/habitat-condition-review.md')
    (audit if args.research else public_audit)(args)
