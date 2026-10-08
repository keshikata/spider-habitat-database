import fs from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {validateDelivery} from '../site/delivery.js';
const root=new URL('../local/spatial-reference/',import.meta.url),read=name=>fs.readFileSync(new URL(name,root));
const d=validateDelivery(JSON.parse(read('delivery-manifest.json'))),manifest=JSON.parse(read('manifest.json'));
const hash=b=>createHash('sha256').update(b).digest('hex');
const unpack=info=>{const b=read(info.file);assert.equal(b.length,info.bytes);assert.equal(hash(b),info.sha256);const raw=gunzipSync(b);assert.equal(raw.length,info.decodedBytes);return JSON.parse(raw);};
assert.equal(d.sourceManifestSHA256,hash(read('manifest.json')));
assert.deepEqual(unpack(d.summary),JSON.parse(read('summary.json')));
const geography=JSON.parse(gunzipSync(read('geography.json.gz'))),{overview:regional,...index}=geography;
assert.deepEqual(unpack(d.geography),index);
const ordinary=JSON.parse(gunzipSync(read(manifest.overview.file))).cells;
let cells=0,regionalCells=0;
for(let p=1;p<=47;p++){
  const a=unpack(d.prefectures[p]),b=unpack(d.regions[p]);assert.equal(a.cells.length,d.prefectures[p].cells);assert.equal(b.cells.length,d.regions[p].cells);
  assert.deepEqual(a.cells,ordinary.filter(r=>r[2]===p));assert.deepEqual(b.cells,regional.filter(r=>r[2]===p));cells+=a.cells.length;regionalCells+=b.cells.length;
}
assert.equal(cells,ordinary.length);assert.equal(regionalCells,regional.length);
const oldTransfer=read('geography.json.gz').length+manifest.overview.bytes+d.summary.bytes;
const startup=d.summary.bytes+d.geography.bytes+read('delivery-manifest.json').length;
console.log(JSON.stringify({summaryAndGeographyExactParity:'passed',overviewCells:cells,regionalOverviewCells:regionalCells,oldStartupAndOverviewBytes:oldTransfer,newStartupBytes:startup,reductionPercent:Math.round((1-startup/oldTransfer)*100),maximumFileBytes:Math.max(d.summary.bytes,d.geography.bytes,...Object.values(d.prefectures).map(x=>x.bytes),...Object.values(d.regions).map(x=>x.bytes))}));
