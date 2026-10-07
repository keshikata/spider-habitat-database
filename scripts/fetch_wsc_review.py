"""Cache only the public WSC pages needed for this finite name review.

The cache stays local. It is not part of the public site or repository.
"""
from pathlib import Path
import json
import time
import urllib.request
import re
from html.parser import HTMLParser

ROOT = Path(__file__).resolve().parents[1]

class Text(HTMLParser):
    def __init__(self):
        super().__init__()
        self.chunks = []
        self.skip = 0
    def handle_starttag(self, tag, attrs):
        if tag in ('script', 'style'):
            self.skip += 1
        if tag in ('div', 'p', 'li', 'h4', 'h5', 'h6', 'tr', 'br'):
            self.chunks.append('\n')
    def handle_endtag(self, tag):
        if tag in ('script', 'style'):
            self.skip -= 1
        if tag in ('div', 'p', 'li', 'h4', 'h5', 'h6', 'tr'):
            self.chunks.append('\n')
    def handle_data(self, data):
        if not self.skip:
            self.chunks.append(data)
    def text(self):
        return '\n'.join(' '.join(s.split()) for s in ''.join(self.chunks).splitlines() if s.strip())

if __name__ == '__main__':
    rows = json.loads((ROOT/'site/data/taxonomy-crosswalk.json').read_text(encoding='utf-8'))['rows']
    taxa = {c['url'].rsplit('/', 1)[1]: c for r in rows for c in r['evidence']}
    cache = ROOT/'local/wsc-pages'
    cache.mkdir(parents=True, exist_ok=True)
    for i, (sid, taxon) in enumerate(taxa.items(), 1):
        if not re.fullmatch(r'[0-9]{1,8}', sid):
            raise ValueError('Invalid WSC species identifier')
        output = cache/f'{sid}.txt'
        if output.exists():
            continue
        url = f'https://wsc.nmbe.ch/spec-data/{sid}'
        try:
            req = urllib.request.Request(url, headers={'User-Agent':'SpiderHabitatAtlas/0.1 (noncommercial taxonomy review)'})
            with urllib.request.urlopen(req, timeout=40) as response:
                raw = response.read(2 * 1024 * 1024 + 1)
            if len(raw) > 2 * 1024 * 1024:
                raise ValueError('WSC page exceeds expected size')
            parser = Text()
            parser.feed(raw.decode('utf-8'))
            output.write_text(parser.text(), encoding='utf-8')
            print(i, len(taxa), taxon['acceptedName'], flush=True)
        except Exception as e:
            print('FAILED', taxon['acceptedName'], str(e), flush=True)
        time.sleep(.25)
