"""Explicit exploratory habitat predicates; distances/heights are not fitted limits."""
import re
from build_data import classify, norm

GREEN = [5, 6, 7, 8, 9, 11]
TERRESTRIAL = [5, 6, 7, 8, 9, 10, 11, 13, 15]

def spatial_rule(text):
    s = norm(text)
    base = classify(s)
    classes = base['classes'][:]
    water = bool(re.search(r'水辺|川辺|渓流|河川|河原|河口|沼沢|海岸|海浜|海辺|港湾|湖沼', s))
    built = bool(re.search(r'公園|庭|緑地|空き地|街路樹|寺社|社寺', s))
    indoor = '屋内・洞窟・隙間' in base['pending']
    if built and not classes and not indoor:
        classes = GREEN[:]
    if water and not classes and not indoor:
        classes = TERRESTRIAL[:]
    # Continuation of the slide prototype's 200/800m bands, not universal vegetation zones.
    low = bool(re.search(r'平地|低地', s))
    middle = bool(re.search(r'低山|丘陵', s))
    high = bool(re.search(r'(?<!低)山地|高山|高地|高原|亜高山', s))
    elevation = list(range(4))
    if low or middle or high:
        lo = 0 if low else 1 if middle else 2
        hi = 2 if high else 1 if middle else 0
        elevation = list(range(lo, hi + 1))
    pending = [v for v in base['pending'] if v not in ['水際・海岸への距離', '公園・庭・緑地の位置']]
    return {'classes': classes, 'water': water, 'built': built, 'elevation': elevation,
            'pending': pending, 'proxy': built or (water and not base['classes'])}

def accepts(key, rules, distance=1, elevation=False):
    built = key % 4; water = key // 4 % 4; height = key // 16 % 4; cover = key // 64
    return any(cover in r['classes'] and (not r['water'] or water <= distance)
               and (not r['built'] or built <= distance)
               and (not elevation or height in r['elevation']) for r in rules)
