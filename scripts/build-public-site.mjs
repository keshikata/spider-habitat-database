import fs from 'node:fs';
import path from 'node:path';
import {gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {validateDelivery} from '../site/delivery.js';
import {PUBLICATION_POLICY,publicStratum,publicationRule} from '../site/publication-policy.js';
import {APPLICATION_ASSETS} from './public-assets.mjs';
const out=path.resolve(process.argv[2]||'output/public-site'),spatial=path.resolve(process.argv[3]||'local/public-spatial'),slides=path.resolve(process.argv[4]||'local/public-presentation');
if(fs.existsSync(out)&&fs.readdirSync(out).length)throw new Error('Output must be a new empty directory');
const read=n=>JSON.parse(fs.readFileSync(path.join(spatial,n))),d=validateDelivery(read('delivery-manifest.json')),m=read('manifest.json');
function verified(info){
  if(path.basename(info.file)!==info.file)throw new Error('Invalid asset path');
  const b=fs.readFileSync(path.join(spatial,info.file));
  if(b.length!==info.bytes||createHash('sha256').update(b).digest('hex')!==info.sha256)throw new Error('Asset digest mismatch');
  if(!Number.isSafeInteger(info.decodedBytes)||info.decodedBytes<1||info.decodedBytes>128000000)throw new Error('Invalid decoded size');
  const decoded=gunzipSync(b,{maxOutputLength:info.decodedBytes});
  if(decoded.length!==info.decodedBytes)throw new Error('Decoded size mismatch');
  return JSON.parse(decoded);
}
const summary=verified(d.summary);
if(summary.publicationPolicy!==PUBLICATION_POLICY||summary.dem!==false||summary.localOnly!==false)throw new Error('Research data must not be published');
if(createHash('sha256').update(fs.readFileSync(path.join(spatial,'manifest.json'))).digest('hex')!==d.sourceManifestSHA256)throw new Error('Manifest digest mismatch');
const validAreas=areas=>Object.keys(areas).every(k=>publicStratum(+k)===+k);
if(!Object.values(summary.summary).every(r=>validAreas(r.areas))||Object.values(summary.rules).flat().some(r=>r.supported&&publicationRule(r).supported===false))throw new Error('Held data or unevaluable habitat found');
const g=verified(d.geography);if(!Object.values(g.regions).every(r=>validAreas(r.areas)))throw new Error('Held regional data found');
const infos=[d.summary,d.geography,...Object.values(d.prefectures),...Object.values(d.regions),m.overview,...m.tiles];
for(const info of infos){const value=verified(info);if(Array.isArray(value.cells)&&value.cells.some(r=>r[3].some((k,i)=>i%2===0&&publicStratum(k)!==k)))throw new Error('Held map data found');}
const slideManifest=JSON.parse(fs.readFileSync(path.join(slides,'manifest.json')));
if(slideManifest.edition!=='web-rights-reviewed-2026-10-08'||slideManifest.pages!==20)throw new Error('Unreviewed slide edition');
for(let n=1;n<=20;n++){
  const name=`page-${String(n).padStart(2,'0')}.png`,info=slideManifest.files?.[name],bytes=fs.readFileSync(path.join(slides,name));
  if(!info||info.bytes!==bytes.length||info.sha256!==createHash('sha256').update(bytes).digest('hex'))throw new Error('Slide differs from reviewed edition');
}
fs.mkdirSync(out,{recursive:true});
function copy(src,relative){const dest=path.join(out,relative);fs.mkdirSync(path.dirname(dest),{recursive:true});fs.copyFileSync(src,dest);}
// Copy only named application/vendor assets, never an entire source directory.
for(const name of APPLICATION_ASSETS)copy(path.join('site',name),name);
for(const name of ['search.json','search.json.gz','taxonomy-crosswalk.json'])copy(path.join('site/data',name),'data/'+name);
for(const name of ['manifest.json','delivery-manifest.json',...infos.map(i=>i.file)])copy(path.join(spatial,name),'data/spatial/'+name);
copy(path.join(slides,'manifest.json'),'slides/manifest.json');
for(let n=1;n<=20;n++){const name=`page-${String(n).padStart(2,'0')}.png`;copy(path.join(slides,name),'slides/'+name);}
let count=0,total=0,max=0;function check(dir){for(const item of fs.readdirSync(dir,{withFileTypes:true})){const f=path.join(dir,item.name);if(item.isDirectory())check(f);else{const bytes=fs.statSync(f).size;if(bytes>25*1024*1024)throw new Error('Asset exceeds free hosting limit');count++;total+=bytes;max=Math.max(max,bytes);}}}check(out);
if(count>20000)throw new Error('Too many assets');console.log(JSON.stringify({directory:out,files:count,bytes:total,maxFileBytes:max,heldAxes:'absent'}));
