import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {MODEL,meshPosition,pixelArea,summarize} from '../site/model.js';
const root=fileURLToPath(new URL('../site/',import.meta.url));
const d=JSON.parse(fs.readFileSync(path.join(root,'data/catalog.json'),'utf8'));
assert.equal(d.model,MODEL);
const ids=new Set(),meshes=new Set(), totals=Object.fromEntries(d.prefectures.map((_,i)=>[i+1,Array(16).fill(0)]));
for(const s of d.species){assert.ok(/^\d{1,5}$/.test(s.id));assert.ok(!ids.has(s.id));ids.add(s.id);assert.ok(s.name&&s.scientific);assert.deepEqual(Object.keys(s).sort(),['id','name','scientific','catalogScientific','author','family','familyJa','genus','classes','pending','ruleIds','aliases','taxonomyNotes','environmentCount','mappedEnvironmentCount','records'].sort());for(const c of s.classes)assert.ok(Number.isInteger(c)&&c>=1&&c<=15);}
let total=0;
for(const region of Object.keys(d.regions)){
  const file=path.join(root,'data',region+'.json'),buffer=fs.readFileSync(file),data=JSON.parse(buffer);
  assert.ok(buffer.byteLength<25*1024*1024);
  assert.equal(createHash('sha256').update(buffer).digest('hex'),d.files[region].sha256);
  assert.equal(data.cells.length,d.files[region].cells);
  for(const [code,pref,counts] of data.cells){assert.ok(!meshes.has(code));meshes.add(code);assert.ok(d.regions[region].includes(pref));assert.equal(counts.length,16);assert.ok(counts.every(n=>Number.isSafeInteger(n)&&n>=0));const pos=meshPosition(code),a=pixelArea((pos.south+pos.north)/2);for(let i=0;i<16;i++)totals[pref][i]+=counts[i]*a;}
  total+=data.cells.length;
}
assert.equal(total,d.counts.meshes);
for(let pref=1;pref<=47;pref++)for(let c=0;c<16;c++)assert.ok(Math.abs(totals[pref][c]-d.summary[pref].areas[c])<.001,`area ${pref}/${c}`);
for(const s of d.species){const a=summarize(d,s,{scope:'environment'});if(a.area!==null)assert.ok(a.area>=0&&a.area<=a.total+.00001);}
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
for(const match of html.matchAll(/(?:src|href)="\.\/([^"?#]+)"/g))assert.ok(fs.existsSync(path.join(root,match[1])),match[1]);
for(const f of ['index.html','style.css','app.js','model.js','favicon.svg','_headers'])assert.ok(fs.statSync(path.join(root,f)).size>0);
console.log(JSON.stringify({species:d.species.length,habitat:d.counts.habitat,mapped:d.counts.mapped,meshes:total,areaParity:'passed',assetLinks:'passed'}));
