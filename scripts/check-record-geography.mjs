import fs from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {attachRegions,recordScope,includesRecordRow} from '../site/record-geography.js';
import {STRATA} from '../site/spatial-model.js';
import {pixelArea} from '../site/model.js';
const root=new URL('../local/spatial-compound/',import.meta.url);
const read=name=>fs.readFileSync(new URL(name,root));
const hash=raw=>createHash('sha256').update(raw).digest('hex');
const info=JSON.parse(read('geography-manifest.json')),raw=read('geography.json.gz'),g=JSON.parse(gunzipSync(raw));
assert.equal(raw.length,info.bytes);assert.equal(hash(raw),info.sha256);
assert.equal(hash(read('manifest.json')),g.sourceManifestSHA256);
const manifest=JSON.parse(read('manifest.json')),sums={},counts={},overview=new Map();
let totalRows=0,assigned=0;
for(const tile of manifest.tiles){
  const packed=read(tile.file);assert.equal(hash(packed),tile.sha256);
  const rows=attachRegions(JSON.parse(gunzipSync(packed)).cells,g.tiles[tile.id]);
  assert.equal(rows.length,tile.cells);totalRows+=rows.length;
  for(const [x,y,p,flat,id] of rows){
    if(!id)continue;assigned++;assert.equal(g.regions[id].pref,p);
    const sum=sums[id]??=Array(STRATA).fill(0);counts[id]=(counts[id]||0)+1;
    const key=[Math.floor(x/64)*64,Math.floor(y/64)*64,p,id].join(','),coarse=overview.get(key)||new Map();
    const area=pixelArea((y+.5)/480);
    for(let k=0;k<flat.length;k+=2){sum[flat[k]]+=flat[k+1]*area;coarse.set(flat[k],(coarse.get(flat[k])||0)+flat[k+1]);}
    overview.set(key,coarse);
  }
}
for(const [id,region] of Object.entries(g.regions)){
  assert.equal(region.meshes,counts[id]||0);
  for(let k=0;k<STRATA;k++)assert.ok(Math.abs((region.areas[k]||0)-(sums[id]?.[k]||0))<1e-6);
}
for(const [x,y,p,flat,id] of g.overview){
  const key=[x,y,p,id].join(','),expected=overview.get(key);
  assert.deepEqual(flat,[...expected].sort((a,b)=>a[0]-b[0]).flat());overview.delete(key);
}
assert.equal(overview.size,0);
const catalog=JSON.parse(fs.readFileSync(new URL('../site/data/catalog.json',import.meta.url)));
const amami=catalog.species.find(s=>s.id==='1'),scope=recordScope(g,amami,[46],'recorded');
assert.equal(scope.fullPrefs.size,0);assert.equal(scope.regionIds.size,1);
assert.equal([...scope.regionIds][0],g.islands['奄美大島']);
assert.equal(includesRecordRow(scope,[0,0,46,[],Number(g.mainland[46])]),false);
console.log(JSON.stringify({totalRows,assigned,regions:Object.keys(g.regions).length,unresolved:g.unresolved,summaryAndMapParity:'passed',amamiIslandOnly:'passed'}));
