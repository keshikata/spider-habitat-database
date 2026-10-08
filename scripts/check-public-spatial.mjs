import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {PUBLICATION_POLICY,publicStratum,projectFlat,projectEntries} from '../site/publication-policy.js';
const source=path.resolve(process.argv[2]||'local/spatial-reference'),root=path.resolve(process.argv[3]||'local/public-spatial');
const json=(r,n)=>JSON.parse(fs.readFileSync(path.join(r,n)));
const unpack=(r,info)=>{const b=fs.readFileSync(path.join(r,info.file));assert.equal(createHash('sha256').update(b).digest('hex'),info.sha256);return JSON.parse(gunzipSync(b));};
const m=json(root,'manifest.json'),old=json(source,'manifest.json'),d=json(root,'delivery-manifest.json'),s=unpack(root,d.summary),before=json(source,'summary.json');
assert.equal(s.publicationPolicy,PUBLICATION_POLICY);assert.equal(s.dem,false);assert.equal(s.localOnly,false);
for(const [p,r] of Object.entries(s.summary))assert.deepEqual(r.areas,Object.fromEntries(projectEntries(Object.entries(before.summary[p].areas))));
let rows=0,pixels=0;
for(let i=0;i<m.tiles.length;i++){
  assert.equal(m.tiles[i].id,old.tiles[i].id);
  const a=unpack(source,old.tiles[i]),b=unpack(root,m.tiles[i]);assert.equal(a.cells.length,b.cells.length);
  for(let j=0;j<a.cells.length;j++){
    assert.deepEqual(b.cells[j].slice(0,3),a.cells[j].slice(0,3));assert.deepEqual(b.cells[j][3],projectFlat(a.cells[j][3]));rows++;
    for(let k=0;k<b.cells[j][3].length;k+=2){assert.equal(publicStratum(b.cells[j][3][k]),b.cells[j][3][k]);pixels+=b.cells[j][3][k+1];}
  }
}
const g=unpack(root,d.geography),og=JSON.parse(gunzipSync(fs.readFileSync(path.join(source,'geography.json.gz'))));
for(const name of ['tiles','islands','mainland'])assert.deepEqual(g[name],og[name]);
for(const [id,r] of Object.entries(g.regions))assert.deepEqual(r.areas,Object.fromEntries(projectEntries(Object.entries(og.regions[id].areas))));
const rules=[...new Map(Object.values(s.rules).flat().map(r=>[r.id,r])).values()];
assert.ok(rules.every(r=>!(r.coast||r.river)||!r.supported));
console.log(JSON.stringify({policy:s.publicationPolicy,tiles:m.tiles.length,rows,pixels,exactProjectedCounts:'passed',prefectureAndIslandAreas:'passed',held:rules.filter(r=>r.publicationHold?.length).map(r=>r.id),supported:rules.filter(r=>r.supported).length}));
