"""Build small overview/prefecture map assets; exact area totals remain in catalog."""
import collections
import gzip
import hashlib
import json
from pathlib import Path
from build_data import mesh_xy

ROOT = Path(__file__).resolve().parents[1]

def pack():
    data = ROOT / 'site/data'
    catalog = json.loads((data / 'catalog.json').read_text(encoding='utf-8'))
    pref_cells = collections.defaultdict(list)
    overview = {}
    bounds = {}
    for region in catalog['regions']:
        rows = json.loads((data / (region + '.json')).read_text(encoding='utf-8'))['cells']
        for code, pref, counts in rows:
            x, y = mesh_xy(code)
            pref_cells[pref].append([x, y, counts])
            b = bounds.setdefault(pref, [x, y, x + 1, y + 1])
            b[:] = [min(b[0], x), min(b[1], y), max(b[2], x + 1), max(b[3], y + 1)]
            key = (x // 8 * 8, y // 8 * 8, pref)
            dest = overview.setdefault(key, [0] * 16)
            for c, n in enumerate(counts):
                dest[c] += n
    output = data / 'maps'
    output.mkdir(exist_ok=True)
    def write(name, obj):
        raw = json.dumps(obj, ensure_ascii=False, separators=(',', ':')).encode('utf-8')
        compressed = gzip.compress(raw, compresslevel=9, mtime=0)
        digest = hashlib.sha256(compressed).hexdigest()
        file = name + '-' + digest[:12] + '.json.gz'
        (output / file).write_bytes(compressed)
        return {'file': file, 'bytes': len(compressed), 'decodedBytes': len(raw), 'sha256': digest,
                'cells': len(obj['cells'])}
    overview_file = write('overview', {'schema': 1, 'step': 8,
                         'cells': [[x, y, p, counts] for (x, y, p), counts in sorted(overview.items())]})
    prefs = {str(pref): {**write('pref-' + str(pref), {'schema': 1, 'step': 1, 'pref': pref,
                          'cells': rows}), 'bounds': bounds[pref]} for pref, rows in sorted(pref_cells.items())}
    manifest = {'schema': 1, 'overview': overview_file, 'prefectures': prefs}
    (output / 'manifest.json').write_bytes(json.dumps(manifest, separators=(',', ':')).encode('utf-8'))
    # Browser's compact catalog does not need the large audit note/evidence strings.
    for s in catalog['species']:
        s.pop('taxonomyNotes', None)
        s.pop('ruleIds', None)
    catalog.pop('rules', None)
    catalog.pop('sources', None)
    catalog.pop('files', None)
    raw = json.dumps(catalog, ensure_ascii=False, separators=(',', ':')).encode('utf-8')
    (data / 'search.json').write_bytes(raw)
    (data / 'search.json.gz').write_bytes(gzip.compress(raw, compresslevel=9, mtime=0))
    print(json.dumps({'searchGzipBytes': (data/'search.json.gz').stat().st_size,
                      'overview': overview_file, 'allDetailGzipBytes': sum(p['bytes'] for p in prefs.values())}))

if __name__ == '__main__':
    pack()
