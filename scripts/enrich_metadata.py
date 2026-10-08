"""Refresh habitat labels and public JSC area labels without recomputing GIS pixels."""
import argparse
import collections
import gzip
import json
from pathlib import Path
from build_data import norm, read_rows, resolve_name
from spatial_rules import spatial_rule
from sync_jsc import decode

ROOT = Path(__file__).resolve().parents[1]
from jsc_geography import record_geography

def enrich(args):
    data = ROOT / 'site/data'
    catalog = json.loads((data/'catalog.json').read_text(encoding='utf-8'))
    byname = {s['catalogScientific']: s for s in catalog['species']}
    rows = decode(json.loads((args.jsc/'DistributionRecord_web.records.json').read_text(encoding='utf-8')))
    areas = record_geography(rows, byname, catalog['prefectures'], norm)
    for name, species in byname.items():
        species['recordAreas'] = areas.get(name, {})
    def write(path, obj):
        path.write_text(json.dumps(obj, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
    write(data/'catalog.json', catalog)
    search = json.loads((data/'search.json').read_text(encoding='utf-8'))
    for s in search['species']:
        s['recordAreas'] = byname[s['catalogScientific']]['recordAreas']
    write(data/'search.json', search)
    (data/'search.json.gz').write_bytes(gzip.compress((data/'search.json').read_bytes(), compresslevel=9, mtime=0))
    spatial = json.loads((args.spatial/'summary.json').read_text(encoding='utf-8'))
    audit = json.loads((ROOT/'local/rule-audit.json').read_text(encoding='utf-8'))['rules']
    cross = {r['sourceName']:r for r in json.loads((data/'taxonomy-crosswalk.json').read_text(encoding='utf-8'))['rows']}
    rules = {}
    for row in read_rows(args.habitat/'Spiceis habitat index.csv'):
        name = resolve_name(row['Scientific Name'], byname, cross)
        if not name:
            continue
        text = norm(row['habitat_text'])
        base = audit[text]
        rule = {**spatial_rule(text), 'id':base['id'], 'label':text, 'baseClasses':base['classes']}
        dest = rules.setdefault(byname[name]['id'], [])
        if not any(r['id'] == rule['id'] for r in dest):
            dest.append(rule)
    spatial['rules'] = {k:sorted(v, key=lambda r:r['id']) for k,v in rules.items()}
    write(args.spatial/'summary.json', spatial)
    print(json.dumps({'species':len(search['species']), 'habitatSpecies':len(rules), 'searchBytes':(data/'search.json').stat().st_size,
                      'searchGzipBytes':(data/'search.json.gz').stat().st_size}))

if __name__ == '__main__':
    p = argparse.ArgumentParser()
    p.add_argument('--jsc', type=Path, required=True)
    p.add_argument('--habitat', type=Path, required=True)
    p.add_argument('--spatial', type=Path, default=ROOT/'local/spatial')
    enrich(p.parse_args())
