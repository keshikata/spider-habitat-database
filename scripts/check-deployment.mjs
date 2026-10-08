import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {APPLICATION_ASSETS} from './public-assets.mjs';
import {checkSharing} from './check-sharing.mjs';

const base=new URL(process.argv[2]||'https://spider-habitat-atlas.pages.dev/');
assert.equal(base.protocol,'https:');assert.equal(base.username,'');assert.equal(base.password,'');
const root=path.resolve(process.argv[3]||'output/public-site');
const sharing=checkSharing(root);
const delivery=JSON.parse(fs.readFileSync(path.join(root,'data/spatial/delivery-manifest.json')));
const manifest=JSON.parse(fs.readFileSync(path.join(root,'data/spatial/manifest.json')));
const hash=b=>createHash('sha256').update(b).digest('hex');
const checked=[];
const spatial=[delivery.summary,delivery.geography,delivery.prefectures['43'],manifest.overview,manifest.tiles[0]].filter(Boolean).map(i=>'data/spatial/'+i.file);
const names=[...APPLICATION_ASSETS.filter(n=>n!=='_headers'),'data/search.json.gz','data/taxonomy-crosswalk.json','data/spatial/delivery-manifest.json','data/spatial/manifest.json',...spatial,'slides/manifest.json','slides/page-01.png','slides/page-06.png','slides/page-20.png'];
const required={'x-content-type-options':'nosniff','referrer-policy':'no-referrer','x-frame-options':'DENY','cross-origin-opener-policy':'same-origin','cross-origin-resource-policy':'same-origin'};
const headers=fs.readFileSync(path.join(root,'_headers'),'utf8');
const csp=headers.match(/^\s+Content-Security-Policy: (.+)$/m)?.[1].trim();assert.ok(csp);
async function check(name){
  const response=await fetch(new URL(name==='index.html'?'./':name,base),{signal:AbortSignal.timeout(30000)});
  assert.equal(response.status,200,name+' HTTP status');assert.ok(response.url.startsWith(base.origin+'/'));
  for(const [key,value] of Object.entries(required))assert.equal(response.headers.get(key),value,name+' '+key);
  assert.equal(response.headers.get('content-security-policy'),csp,name+' CSP');
  assert.equal(response.headers.get('permissions-policy'),'geolocation=(), camera=(), microphone=(), payment=(), usb=()',name+' permissions');
  const bytes=Buffer.from(await response.arrayBuffer());
  if(name===sharing.image)assert.match(response.headers.get('content-type')||'',/^image\/png(?:;|$)/);
  assert.equal(hash(bytes),hash(fs.readFileSync(path.join(root,name))),name+' deployment content');
  const cache=response.headers.get('cache-control')||'';
  if(name.startsWith('data/spatial/')&&name.endsWith('.gz')){assert.match(cache,/max-age=31536000/);assert.match(cache,/immutable/);assert.doesNotMatch(cache,/max-age=0(?:,|$)/);}
  if(name.includes('manifest.json')&&name.startsWith('data/spatial/'))assert.match(cache,/must-revalidate/);
  checked.push({file:name,bytes:bytes.length,cache});
}
for(let n=0;n<names.length;n+=4)await Promise.all(names.slice(n,n+4).map(check));
const http=new URL(base);http.protocol='http:';
const redirect=await fetch(http,{redirect:'manual',signal:AbortSignal.timeout(30000)});
assert.ok([301,302,307,308].includes(redirect.status),'HTTP redirects to HTTPS');
assert.ok(redirect.headers.get('location')?.startsWith(base.origin),'HTTPS redirect destination');
for(const name of ['index.html',sharing.image]){
  const response=await fetch(new URL(name==='index.html'?'./':name,base),{headers:{'user-agent':'Twitterbot/1.0'},signal:AbortSignal.timeout(30000)});
  assert.equal(response.status,200,'Twitterbot '+name);assert.equal(hash(Buffer.from(await response.arrayBuffer())),hash(fs.readFileSync(path.join(root,name))),'Twitterbot '+name+' content');
}
console.log(JSON.stringify({origin:base.origin,files:checked.length,bytes:checked.reduce((n,v)=>n+v.bytes,0),https:'passed',securityHeaders:'passed',cache:'passed',sampledContentDigests:'passed',twitterbotUserAgent:'passed',sharing,checked},null,2));
