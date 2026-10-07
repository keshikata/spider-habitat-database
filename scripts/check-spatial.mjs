// Optional full audit of local research outputs; no network or source-raster edits.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {pixelArea} from '../site/model.js';
import {acceptedKeys,SPATIAL_MODEL} from '../site/spatial-model.js';
const root=fileURLToPath(new URL('../local/spatial/',import.meta.url));
const read=name=>JSON.parse(fs.readFileSync(path.join(root,name),'utf8'));
const manifest=read('manifest.json'),summary=read('summary.json');
assert.equal(summary.model,SPATIAL_MODEL);assert.equal(manifest.model,SPATIAL_MODEL);
function unpack(info){
  assert.match(info.file,/^[a-z0-9-]+\.json\.gz$/);
  const packed=fs.readFileSync(path.join(root,info.file));assert.equal(packed.length,info.bytes);assert.ok(info.bytes<=2000000);
  assert.equal(createHash('sha256').update(packed).digest('hex'),info.sha256);
  const raw=gunzipSync(packed,{maxOutputLength:12000000});assert.equal(raw.length,info.decodedBytes);
  const d=JSON.parse(raw);assert.equal(d.schema,2);assert.equal(d.cells.length,info.cells);return d;
}
const overview=unpack(manifest.overview),coarse=new Map();assert.equal(overview.step,64);
for(const [x,y,p,f] of overview.cells){const key=[x,y,p].join(',');assert.ok(!coarse.has(key));const v=new Float64Array(1024);for(let i=0;i<f.length;i+=2)v[f[i]]=f[i+1];coarse.set(key,v);}
const sums=Array.from({length:48},()=>new Float64Array(1024)),meshes=new Uint32Array(48),tileBounds=new Map(),shared=new Map();
for(const t of manifest.tiles){const b=t.bounds.join(',');tileBounds.set(b,(tileBounds.get(b)||0)+1);}
let count=0,pixels=0,maxError=0;
for(const tile of manifest.tiles){
  const boundsKey=tile.bounds.join(',');
  const d=unpack(tile);assert.equal(d.step,1);const seen=shared.get(boundsKey)||new Set();if(tileBounds.get(boundsKey)>1)shared.set(boundsKey,seen);
  for(const [x,y,p,f] of d.cells){
    assert.ok(Number.isInteger(x)&&Number.isInteger(y)&&x>=tile.bounds[0]&&x<tile.bounds[2]&&y>=tile.bounds[1]&&y<tile.bounds[3]);
    assert.ok(Number.isInteger(p)&&p>=1&&p<=47&&tile.prefs.includes(p));
    const key=[x,y].join(',');assert.ok(!seen.has(key));seen.add(key);count++;meshes[p]++;
    const expected=coarse.get([tile.bounds[0],tile.bounds[1],p].join(','));assert.ok(expected);assert.equal(f.length%2,0);
    const area=pixelArea((y+.5)/480);let previous=-1;
    for(let i=0;i<f.length;i+=2){const k=f[i],n=f[i+1];assert.ok(Number.isInteger(k)&&k>previous&&k<1024);assert.ok(Number.isSafeInteger(n)&&n>0&&n<=950);previous=k;pixels+=n;sums[p][k]+=n*area;expected[k]-=n;}
  }
}
assert.equal(count,summary.cells);
for(const v of coarse.values())assert.ok(v.every(n=>n===0),'overview/detail pixel parity');
for(let p=1;p<=47;p++){assert.equal(meshes[p],summary.summary[p].meshes);for(let k=0;k<1024;k++){const err=Math.abs(sums[p][k]-summary.summary[p].areas[k]);maxError=Math.max(maxError,err);assert.ok(err<1e-7,'summary/detail area parity');}}
const catalog=JSON.parse(fs.readFileSync(new URL('../site/data/catalog.json',import.meta.url),'utf8'));
for(const s of catalog.species){const rules=summary.rules[s.id]||[];let previous=new Uint8Array(1024);for(const distance of [100,250,500]){const mask=acceptedKeys(s,rules,{model:'distance',distance}),height=acceptedKeys(s,rules,{model:'elevation',distance});for(let k=0;k<1024;k++){assert.ok(mask[k]>=previous[k],'distance monotonicity');assert.ok(height[k]<=mask[k],'height subset');}previous=mask;}}
console.log(JSON.stringify({passed:true,tiles:manifest.tiles.length,cells:count,pixels,maxAreaErrorKm2:maxError,overviewCompressedBytes:manifest.overview.bytes,maxDetailCompressedBytes:Math.max(...manifest.tiles.map(t=>t.bytes))},null,2));
