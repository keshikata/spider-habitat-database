"""Build a static, allowlisted research dataset. Source files stay outside the site."""
from __future__ import annotations
import argparse
import collections
import csv
import hashlib
import json
import math
from pathlib import Path
import re
import unicodedata
from sync_jsc import decode

ROOT = Path(__file__).resolve().parents[1]
REGIONS = {'hokkaido': [1], 'tohoku': list(range(2, 8)), 'kanto': list(range(8, 15)),
           'chubu': list(range(15, 24)), 'kinki': list(range(24, 31)),
           'chugoku': list(range(31, 36)), 'shikoku': list(range(36, 40)),
           'kyushu': list(range(40, 47)), 'okinawa': [47]}
PREFS = '北海道 青森県 岩手県 宮城県 秋田県 山形県 福島県 茨城県 栃木県 群馬県 埼玉県 千葉県 東京都 神奈川県 新潟県 富山県 石川県 福井県 山梨県 長野県 岐阜県 静岡県 愛知県 三重県 滋賀県 京都府 大阪府 兵庫県 奈良県 和歌山県 鳥取県 島根県 岡山県 広島県 山口県 徳島県 香川県 愛媛県 高知県 福岡県 佐賀県 長崎県 熊本県 大分県 宮崎県 鹿児島県 沖縄県'.split()
CLASSES = ['未分類', '水域', '人工構造物', '水田', '畑地', '草地', '落葉広葉樹林', '落葉針葉樹林', '常緑広葉樹林', '常緑針葉樹林', '裸地', '竹林', 'ソーラーパネル', '湿地', '農業用温室', '岩礁・干潟']
MODEL_VERSION = 'landcover-rules-1.0.0'

def norm(s):
    return re.sub(r'\s+', ' ', unicodedata.normalize('NFKC', s)).strip()

def scientific_key(label):
    """Strip authorship, preserving a named subspecies instead of joining its parent."""
    match = re.match(r'^([A-Z][a-z]+ (?:[a-z][a-z-]+|sp\.)(?: (?!van\b|von\b|de\b|del\b|da\b)[a-z][a-z-]+)?)(?=\s|$)', norm(label))
    return match.group(1) if match else norm(label)

def resolve_name(label, byname, crosswalk):
    key = scientific_key(label)
    if key in crosswalk:
        row = crosswalk[key]
        return row['catalogName'] if row['status'] == 'mapped' else None
    return key if key in byname else None

def classify(text):
    """Finite deterministic rules, NOT trained probabilities or occurrence estimates."""
    s = norm(text)
    classes, pending = set(), set()
    if re.search(r'平地|低山|山地|高山|高地|高原|丘陵|亜高山|寒冷', s):
        pending.add('標高・気候')
    # Microhabitats cannot be inferred from a surface-cover code.
    if re.search(r'洞窟|暗所|建造物.*内|建物|倉庫|畜舎|物置|石垣|岩の間', s):
        return {'classes': [], 'pending': sorted(pending | {'屋内・洞窟・隙間'})}
    if re.search(r'水辺|川辺|渓流|河川|河原|河口|沼沢|海岸|海浜|海辺|港湾|湖沼', s):
        pending.add('水際・海岸への距離')
    if re.search(r'林縁|落葉層|薮|藪|植えこみ|ハイマツ', s):
        pending.add('微環境・植生構造')
    if re.search(r'竹林', s):
        classes.add(11)
    elif re.search(r'森林|樹林|林地|社寺林|寺社林|造林地|植林地|(?:の|^|い)林$', s):
        classes.update([6, 7, 8, 9])
    if re.search(r'草原|草地|草むら|芝生|牧草地', s):
        classes.add(5)
    if '水田' in s:
        if '畦' in s:
            pending.add('水田の畦')
        else:
            classes.add(3)
    if re.search(r'耕作地|農耕地', s):
        classes.update([3, 4])
    if re.search(r'湿地|湿原', s):
        classes.add(13)
    if '裸地' in s:
        classes.add(10)
    if re.search(r'公園|庭|緑地|空き地|街路樹|寺社|社寺', s):
        pending.add('公園・庭・緑地の位置')
    if re.search(r'里山|人里', s):
        pending.add('里山の環境構成')
    if re.search(r'岩場|崖地|砂浜|潮間帯|果樹園|乾燥地|荒地|荒れ地', s):
        pending.add('土地被覆で識別できない環境')
    if s in {'市街地', '都市部', '都市部~市街地', '平地の市街地', '市街地の人工的な環境', '建造物', '市街地の建造物', '人家', '市街地の人家'}:
        classes.add(2)
        pending.add('建物内外の環境')
    if not classes and not pending:
        pending.add('土地被覆への対応')
    return {'classes': sorted(classes), 'pending': sorted(pending)}

def mesh_xy(code):
    if not re.fullmatch(r'\d{4}[0-7]{2}\d{2}', code):
        raise ValueError(f'Invalid mesh code: {code}')
    return int(code[2:4])*80 + int(code[5])*10 + int(code[7]), int(code[:2])*80 + int(code[4])*10 + int(code[6])

def pixel_area_km2(lat):
    """WGS84 latitude/longitude rectangle, located at mesh center (approximation)."""
    a, e2 = 6378137.0, 6.6943799901413165e-3
    e = math.sqrt(e2)
    def integral(phi):
        u = math.sin(phi)
        return u/(2*(1-e2*u*u)) + math.atanh(e*u)/(2*e)
    half = math.radians(1/24000)
    phi = math.radians(lat)
    return a*a*(1-e2)*math.radians(1/12000)*(integral(phi+half)-integral(phi-half))/1e6

def read_rows(path, delimiter=','):
    with path.open(encoding='utf-8-sig', newline='') as f:
        return list(csv.DictReader(f, delimiter=delimiter))

def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

def write_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')

def build(args):
    out = ROOT/'site/data'
    out.mkdir(parents=True, exist_ok=True)
    sources = []
    def source(path, label):
        sources.append({'label': label, 'filename': path.name, 'sha256': sha(path)})
        return path
    habfile = source(args.habitat/'Spiceis habitat index.csv', '研究用生息環境整理')
    taxfile = source(args.jsc/'TaxonName.json', '公開JSC分類 2026-10-08取得')
    recfile = source(args.jsc/'DistributionRecord_web.records.json', '公開JSC県別記録 2026-10-08取得')
    historyfile = source(args.jsc/'UpdateHistory.json', '公開JSC更新履歴')
    live_tax = decode(json.loads(taxfile.read_text(encoding='utf-8')))
    rename = {'No':'Species_no','JapaneseName':'Japanese_name','ScientificName':'Scientific_name',
              'AuthorYear':'Author_Year','FamilyJa':'Family_ja','GenusJa':'Genus_ja'}
    tax = [{rename.get(k,k):v for k,v in r.items()} for r in live_tax if r['Rank'] in ('species','subspecies')]
    habitats = read_rows(habfile)
    records = decode(json.loads(recfile.read_text(encoding='utf-8')))
    history = decode(json.loads(historyfile.read_text(encoding='utf-8')))
    byname = {norm(r['Scientific_name']): r for r in tax}
    crossfile = source(out/'taxonomy-crosswalk.json', 'WSCによる84学名の照合')
    crossdata = json.loads(crossfile.read_text(encoding='utf-8'))
    crosswalk = {r['sourceName']: r for r in crossdata['rows']}
    for r in crosswalk.values():
        if r['status'] == 'mapped':
            assert r['catalogName'] in byname and r['evidence']
    def resolve(name):
        return resolve_name(name, byname, crosswalk)
    habitat_by_species = collections.defaultdict(set)
    unmatched = collections.Counter()
    vocabulary = sorted({norm(r['habitat_text']) for r in habitats})
    rules = {h: {'id': f'H{i+1:03d}', **classify(h)} for i,h in enumerate(vocabulary)}
    for row in habitats:
        key = resolve(row['Scientific Name'])
        if key:
            habitat_by_species[key].add(norm(row['habitat_text']))
        else:
            unmatched[row['Scientific Name']] += 1
    record_by_species = collections.defaultdict(collections.Counter)
    ignored_records = 0
    for row in records:
        # Current public JSC names already express its present taxonomic concept.
        # Old research-name overrides must never be applied to these modern records.
        key, pref = norm(row['sci']), row['pref'].strip()
        if row['record_accuracy'] != '通常':
            ignored_records += 1
            continue
        if key in byname and pref in PREFS:
            record_by_species[key][PREFS.index(pref)+1] += 1
        else:
            ignored_records += 1
    species = []
    for name,row in byname.items():
        hs = sorted(habitat_by_species[name])
        selected = [rules[h] for h in hs]
        classes = sorted({v for r in selected for v in r['classes']})
        pending = sorted({v for r in selected for v in r['pending']})
        species.append({'id': str(row['Species_no']), 'name': row['Japanese_name'].strip(),
                        'scientific': 'Phintella versicolor' if str(row['Species_no'])=='1698' else name,
                        'catalogScientific': name,
                        'author': '' if str(row['Species_no'])=='1698' else row['Author_Year'].strip(),
                        'family': row['Family'].strip(), 'familyJa': row['Family_ja'].strip(),
                        'genus': 'Phintella' if str(row['Species_no'])=='1698' else row['Genus'].strip(), 'classes': classes, 'pending': pending,
                        'ruleIds': [r['id'] for r in selected],
                        'aliases': [r['sourceName'] for r in crosswalk.values() if r['status']=='mapped' and r['catalogName']==name],
                        'taxonomyNotes': [{'sourceName':r['sourceName'],'acceptedName':r['acceptedName'],'relation':r['relation'],
                                           'note':r['note'],'url':r['evidence'][0]['url']} for r in crosswalk.values() if r['status']=='mapped' and r['catalogName']==name],
                        'environmentCount': len(hs), 'mappedEnvironmentCount': sum(bool(r['classes']) for r in selected),
                        'records': dict(sorted(record_by_species[name].items()))})
    species.sort(key=lambda s: int(s['id']))
    summary = {str(i): {'areas': [0.0]*16, 'pixels': [0]*16, 'meshes': 0} for i in range(1,48)}
    inventory, allids = {}, set()
    for region,prefs in REGIONS.items():
        p=source(args.environment/f'{region}.json', f'環境集計 {region}')
        d=json.loads(p.read_text(encoding='utf-8'))
        assert d['version']==3 and d['grid']=='third_order' and d['aggregation']=='all_source_pixel_centers_by_prefecture'
        cells=[]
        for code,parts in d['cells']:
            if code in allids or len(parts)!=1:
                raise ValueError('Overlapping/border mesh in input')
            allids.add(code)
            pref,counts=parts[0]
            assert pref in prefs and len(counts)==16 and all(isinstance(n,int) and n>=0 for n in counts)
            x,y=mesh_xy(code)
            area=pixel_area_km2((y+0.5)/120)
            ss=summary[str(pref)]
            for i,n in enumerate(counts):
                ss['areas'][i]+=n*area
                ss['pixels'][i]+=n
            ss['meshes']+=1
            cells.append([code,pref,counts])
        output=out/f'{region}.json'
        write_json(output, {'schema': 1, 'region':region, 'cells':cells})
        inventory[region]={'cells':len(cells),'bytes':output.stat().st_size,'sha256':sha(output)}
    metadata={'schema':1,'date':'2026-10-08','model':MODEL_VERSION,'landcover':'2024JPN_v25.04',
              'jsc':{'url':'https://japan-spider-catalog.pages.dev/','retrieved':'2026-10-08',
                     'version':history[-1]['Version'],'published':history[-1]['Published'],
                     'recordPolicy':'通常のみ。引用・未確認・不明を含む。要確認・誤同定は除外。',
                     'inputRecords':len(records),'excludedRecords':ignored_records},
              'species':species,'classes':CLASSES,'prefectures':PREFS,'regions':REGIONS,
              'summary':summary,'files':inventory,
              'rules':[{'id':r['id'],'classes':r['classes'],'pending':r['pending']} for r in rules.values()],
              'sources':sources,
              'counts':{'taxonomy':len(species),'habitat':sum(s['environmentCount']>0 for s in species),
                        'mapped':sum(bool(s['classes']) for s in species),'sourceHabitatTaxa':len({r['Scientific Name'] for r in habitats}),
                        'unmatchedHabitatTaxa':len(unmatched),'wscReviewed':len(crosswalk),
                        'wscMapped':sum(r['status']=='mapped' and not r.get('decision') for r in crosswalk.values()),
                        'ownerMapped':sum(r['status']=='mapped' and bool(r.get('decision')) for r in crosswalk.values()),'meshes':len(allids)}}
    write_json(out/'catalog.json',metadata)
    # Raw habitat expressions and unmatched names are local audit data, not published.
    write_json(ROOT/'local/rule-audit.json', {'model':MODEL_VERSION,'rules':rules,'unmatched':dict(unmatched),'ignoredRecords':ignored_records})
    write_json(ROOT/'docs/build-audit.json', {'counts':metadata['counts'],'sources':sources,'environment':inventory,'ignoredRecords':ignored_records,
                                            'ruleSourceSha256':sha(Path(__file__))})
    print(json.dumps(metadata['counts'],ensure_ascii=False))

if __name__=='__main__':
    parser=argparse.ArgumentParser()
    parser.add_argument('--jsc',type=Path,required=True)
    parser.add_argument('--habitat',type=Path,required=True)
    parser.add_argument('--environment',type=Path,required=True)
    build(parser.parse_args())
