"""Reviewed predicates for all registered habitat labels; unresolved parts never vanish."""
import re
from build_data import classify, norm

FOREST = [6, 7, 8, 9]
GREEN = [5, 6, 7, 8, 9, 11]
TERRESTRIAL = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15]

def spatial_rule(text):
    s = norm(text)
    base = classify(s)
    classes = base['classes'][:]
    limits = []
    unresolved = []
    coast_range = bool(re.search(r'海岸[~〜～]', s))
    coast = bool(re.search(r'海岸|海浜|海辺|港湾', s)) and not coast_range
    water = '水辺' in s
    specific_water = bool(re.search(r'川|河|渓流|沼沢|湖沼', s))
    edge = '林縁' in s
    rice = bool(re.search(r'水田.*(?:周囲|畦)', s))
    indoor = '屋内・洞窟・隙間' in base['pending']
    urban = bool(re.search(r'市街地|都市|人家|建造物|建物', s))
    managed = bool(re.search(r'公園|庭|緑地|空き地|街路樹|寺社|社寺', s))
    around_built = bool(re.search(r'(?:人家|建造物).*周囲', s))
    built = managed or around_built or (urban and any(c != 2 for c in classes))
    if re.search(r'森林|樹林|林地|寺社林|社寺林|緑地林|植林地|造林地|(?:^|の)(?:良い)?林(?:$|の)', s):
        classes = FOREST[:]
    if re.search(r'草原|草地|草むら|芝生', s): classes = [5]
    if rice:
        classes = [5] if '畦' in s else [c for c in TERRESTRIAL if c != 2]
        limits.append('畦の幅・形状は識別せず、水田に近い草地で近似' if '畦' in s else '周囲は水田から指定距離以内の陸地')
    if edge and not classes: classes = [c for c in TERRESTRIAL if c != 2]
    if (coast or water or around_built) and not classes and not indoor: classes = TERRESTRIAL[:]
    if managed and not classes and not indoor: classes = GREEN[:]
    if managed: limits.append('公園・庭・寺社等の敷地を識別せず、人工構造物に近い植生で近似')
    if around_built:
        classes = [c for c in classes if c != 2]
        limits.append('人工構造物自体を除いた周辺の陸地。建物の用途・敷地境界は識別しない')
    if edge: limits.append('林縁は森林・竹林と他の既知の土地被覆の境界で近似')
    low = bool(re.search(r'平地|低地', s)) or coast_range
    middle = bool(re.search(r'低山|丘陵', s))
    high = bool(re.search(r'(?<!低)山地|高山|高地|高原|亜高山', s))
    elevation = list(range(4))
    if low or middle or high:
        lo = 0 if low else 1 if middle else 2
        hi = 2 if high else 1 if middle else 0
        elevation = list(range(lo, hi + 1))
        limits.append('地形・植生帯そのものではなく、200m・800mの仮の標高区分で近似')
        if not classes and not base['pending'] == ['屋内・洞窟・隙間']:
            classes = TERRESTRIAL[:]
    if coast_range: limits.append('海岸から低山地までの範囲を800m未満として扱い、海岸距離で限定しない')
    if urban and classes and classes != [2] and not indoor:
        built = True
        limits.append('市街地・集落の区域を識別せず、人工構造物への近さで近似')
    if '芝生' in s: limits.append('草地の管理状態や芝の種類は識別しない')
    if '湿原' in s: limits.append('湿地の土地被覆で近似し、湿原の植生・泥炭・水文条件は識別しない')
    if s == '海浜': limits.append('海岸線に近い陸地で近似し、砂浜や礫浜の底質は識別しない')
    for item in base['pending']:
        if item in ['水際・海岸への距離','公園・庭・緑地の位置','標高・気候','土地被覆への対応','建物内外の環境']: continue
        if item == '微環境・植生構造' and edge: continue
        if item == '水田の畦' and rice: continue
        unresolved.append(item)
    if specific_water: unresolved.append('河川・湖沼・沼沢の種類や範囲（汎用の水域で代用しない）')
    if '里山' in s or '人里' in s: unresolved.append('里山・人里の土地利用の構成と範囲')
    if re.search(r'植林|造林', s): unresolved.append('人工林と自然林の区別')
    if '牧草' in s: unresolved.append('牧草地の利用区分')
    if '良い林' in s: unresolved.append('林の質・植生構造')
    if '街路樹' in s: unresolved.append('道路沿いの樹木の位置')
    if '旧家' in s: unresolved.append('建物の年代')
    if '港湾' in s: unresolved.append('港湾の区域')
    if '潮間帯' in s: unresolved.append('潮位・干出範囲')
    if re.search(r'砂浜|岩場|岩礁', s): unresolved.append('砂・岩などの底質区分')
    if '島嶼' in s: unresolved.append('環境条件としての島嶼限定')
    if s in ['亜高山帯','高山帯','ハイマツ帯','寒冷地']: unresolved.append('気候・植生帯の地域差')
    if indoor: classes = []
    if classes == [2]: limits.append('人工構造物の土地被覆で近似し、建物の用途や内部は識別しない')
    if not classes: unresolved.append('土地被覆への対応')
    unresolved = list(dict.fromkeys(unresolved))
    candidates = classes[:]
    if unresolved: classes = []
    return {'classes': classes, 'candidateClasses': candidates, 'water': water, 'coast': coast,
            'built': built, 'edge': edge, 'rice': rice, 'elevation': elevation,
            'supported': not unresolved, 'pending': unresolved,
            'limitations': list(dict.fromkeys(limits)), 'proxy': bool(limits)}

def accepts(key, rules, distance=1, elevation=False):
    rice = key // 16384 % 4; edge = key // 4096 % 4; coast = key // 1024 % 4; key %= 1024
    built = key % 4; water = key // 4 % 4; height = key // 16 % 4; cover = key // 64
    return any(r.get('supported', True) and cover in r['classes'] and (not r['water'] or water <= distance)
               and (not r['built'] or built <= distance) and (not r.get('coast') or coast <= distance)
               and (not r.get('edge') or edge <= distance) and (not r.get('rice') or rice <= distance)
               and (not elevation or height in r['elevation']) for r in rules)
