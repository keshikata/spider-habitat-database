"""Download a dated snapshot of the public JSC site; never use private API credentials."""
import argparse
import hashlib
import json
from pathlib import Path
import urllib.request

BASE = 'https://japan-spider-catalog.pages.dev/'
FILES = ('TaxonName.json', 'DistributionRecord_web.records.json', 'UpdateHistory.json')

def decode(payload):
    columns, dictionaries = payload['columns'], payload.get('dictionaries', {})
    if len(set(columns)) != len(columns):
        raise ValueError('Duplicate columns')
    result = []
    for row in payload['rows']:
        if len(row) != len(columns):
            raise ValueError('Invalid row width')
        result.append({key: dictionaries[key][value] if key in dictionaries and isinstance(value, int) else value
                       for key, value in zip(columns, row)})
    return result

def sync(destination, date):
    destination.mkdir(parents=True, exist_ok=True)
    manifest = {'retrieved': date, 'site': BASE, 'files': []}
    for name in FILES:
        url = BASE + 'data/' + name
        request = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0', 'Referer': BASE})
        with urllib.request.urlopen(request, timeout=60) as response:
            raw = response.read(20 * 1024 * 1024 + 1)
        if len(raw) > 20 * 1024 * 1024:
            raise ValueError('Source exceeds expected size')
        payload = json.loads(raw)
        decode(payload)
        (destination / name).write_bytes(raw)
        manifest['files'].append({'url': url, 'sha256': hashlib.sha256(raw).hexdigest()})
    (destination / 'source.json').write_text(json.dumps(manifest, ensure_ascii=False), encoding='utf-8')
    print(json.dumps(manifest, ensure_ascii=False))

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--out', type=Path, default=Path('local/jsc-live'))
    parser.add_argument('--date', required=True)
    args = parser.parse_args()
    sync(args.out, args.date)
