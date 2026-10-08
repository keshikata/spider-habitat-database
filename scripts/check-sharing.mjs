import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

// Read the delivered HTML, as link preview crawlers do, without running scripts.
export function checkSharing(root){
  const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
  const head=html.match(/<head>([\s\S]*?)<\/head>/)?.[1];assert.ok(head,'HTML head');
  const tags=new Map();
  for(const match of head.matchAll(/<meta\s+(?:name|property)="([^"]+)"\s+content="([^"]*)"\s*\/?>/g)){
    assert.ok(!tags.has(match[1]),'Duplicate metadata: '+match[1]);tags.set(match[1],match[2]);
  }
  const origin='https://spider-habitat-atlas.pages.dev/';
  const title=head.match(/<title>([^<]+)<\/title>/)?.[1];assert.ok(title);
  assert.equal(tags.get('og:type'),'website');assert.equal(tags.get('og:locale'),'ja_JP');
  assert.equal(tags.get('og:url'),origin);assert.equal(head.match(/<link rel="canonical" href="([^"]+)"/)[1],origin);
  for(const key of ['og:title','og:site_name','twitter:title'])assert.equal(tags.get(key),title);
  const description=tags.get('description');assert.ok(description&&description.length<=200);
  assert.match(description,/候補地は生息確認や出現確率を示すものではありません/);
  for(const key of ['og:description','twitter:description'])assert.equal(tags.get(key),description);
  assert.equal(tags.get('twitter:card'),'summary_large_image');
  assert.equal(tags.get('twitter:image'),tags.get('og:image'));
  assert.equal(tags.get('twitter:image:alt'),tags.get('og:image:alt'));assert.ok(tags.get('og:image:alt'));
  const url=new URL(tags.get('og:image'));assert.equal(url.origin,new URL(origin).origin);assert.equal(url.search,'');
  const imagePath=url.pathname.slice(1);assert.match(imagePath,/^ogp-\d{4}-\d{2}-\d{2}\.png$/);
  const image=fs.readFileSync(path.join(root,imagePath));
  assert.deepEqual(image.subarray(0,8),Buffer.from([137,80,78,71,13,10,26,10]));
  assert.equal(image.toString('ascii',12,16),'IHDR');assert.ok(image.length<5*1024*1024);
  const width=image.readUInt32BE(16),height=image.readUInt32BE(20);
  assert.equal(width,1200);assert.equal(height,630);
  assert.equal(tags.get('og:image:type'),'image/png');assert.equal(tags.get('og:image:width'),String(width));assert.equal(tags.get('og:image:height'),String(height));
  assert.match(fs.readFileSync(path.join(root,'robots.txt'),'utf8'),/^User-agent: \*\r?\nAllow: \/\s*$/);
  return {image:imagePath,width,height,bytes:image.length,staticMetadata:'passed'};
}
