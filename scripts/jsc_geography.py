"""Public JSC area labels. Unknown island names are never inferred as mainland."""
import collections

MAINLAND = {'北海道', '本州', '四国', '九州'}
UNKNOWN = {'', '不明', '未確認', '-', '―'}

def record_geography(rows, names, prefs, normalize=lambda s:s.strip()):
    out = collections.defaultdict(dict)
    for row in rows:
        name, pref = normalize(row['sci']), row['pref'].strip()
        if row['record_accuracy'] != '通常' or name not in names or pref not in prefs:
            continue
        p = str(prefs.index(pref) + 1)
        area = out[name].setdefault(p, {'mainland': False, 'islands': [], 'unspecified': False})
        island = row.get('island', '').strip()
        if island in MAINLAND:
            area['mainland'] = True
        elif island in UNKNOWN:
            area['unspecified'] = True
        elif island not in area['islands']:
            area['islands'].append(island)
    for areas in out.values():
        for area in areas.values():
            area['islands'].sort()
    return out
