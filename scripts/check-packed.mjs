import fs from 'node:fs';
import {gunzipSync,gzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {meshPosition} from '../site/model.js';
const data=new URL('../site/data/',import.meta.url);
const read=name=>JSON.parse(fs.readFileSync(new URL(name,data)));
const catalog=read('catalog.json'),manifest=read('maps/manifest.json'),search=read('search.json');
const originals=new Map(),expectedOverview=new Map();
for(const region of Object.keys(catalog.regions))for(const [code,pref,counts] of read(region+'.json').cells){const {x,y}=meshPosition(code);originals.set(`${x},${y},${pref}`,counts);const key=`${Math.floor(x/8)*8},${Math.floor(y/8)*8},${pref}`;const sum=expectedOverview.get(key)||Array(16).fill(0);for(let c=0;c<16;c++)sum[c]+=counts[c];expectedOverview.set(key,sum);}
function unpack(info){const raw=fs.readFileSync(new URL('maps/'+info.file,data));assert.equal(raw.length,info.bytes);assert.equal(createHash('sha256').update(raw).digest('hex'),info.sha256);const json=gunzipSync(raw,{maxOutputLength:12000000});assert.equal(json.length,info.decodedBytes);const d=JSON.parse(json);assert.equal(d.cells.length,info.cells);return d;}
let detailCells=0;
for(const [pref,info] of Object.entries(manifest.prefectures)){const d=unpack(info);assert.equal(d.pref,+pref);for(const [x,y,c] of d.cells){const key=`${x},${y},${pref}`;assert.deepEqual(c,originals.get(key));originals.delete(key);detailCells++;}}
assert.equal(originals.size,0);assert.equal(detailCells,catalog.counts.meshes);
for(const [x,y,p,c] of unpack(manifest.overview).cells){const key=`${x},${y},${p}`;assert.deepEqual(c,expectedOverview.get(key));expectedOverview.delete(key);}assert.equal(expectedOverview.size,0);
assert.deepEqual(JSON.parse(gunzipSync(fs.readFileSync(new URL('search.json.gz',data)))),search);
for(let i=0;i<search.species.length;i++){const s=search.species[i],o=catalog.species[i];for(const key of ['id','scientific','classes','records','recordAreas'])assert.deepEqual(s[key],o[key]);assert.ok(!Object.hasOwn(s,'taxonomyNotes'));}
const base=new URL('../site/',import.meta.url),allowed=/^(?:index\.html|app\.js|map\.js|spatial\.js|spatial-model\.js|comparison\.js|delivery\.js|habitat-selection\.js|record-geography\.js|model\.js|style\.css|favicon\.svg|_headers|vendor\/leaflet\/(?:leaflet\.(?:js|css)|LICENSE\.txt|images\/(?:layers|layers-2x|marker-icon|marker-icon-2x|marker-shadow)\.png)|data\/(?:catalog|search|taxonomy-crosswalk|hokkaido|tohoku|kanto|chubu|kinki|chugoku|shikoku|kyushu|okinawa)\.json(?:\.gz)?|data\/maps\/(?:manifest\.json|(?:overview|pref-[1-9][0-9]?)-[a-f0-9]{12}\.json\.gz))$/;
for(const file of fs.readdirSync(base,{recursive:true,withFileTypes:true})){assert.ok(!file.isSymbolicLink());if(!file.isFile())continue;const relative=path.relative(fileURLToPath(base),path.join(file.parentPath,file.name)).replaceAll('\\','/');assert.match(relative,allowed);}
const oldBytes=Object.values(catalog.files).reduce((n,f)=>n+f.bytes,0),firstMap=manifest.overview.bytes+fs.statSync(new URL('maps/manifest.json',data)).size;
assert.ok(firstMap<350000);assert.ok(fs.statSync(new URL('search.json.gz',data)).size<225000);
console.log(JSON.stringify({detailCells,overviewCells:manifest.overview.cells,exactMapParity:'passed',publicFileAllowlist:'passed',oldNationalMapBytes:oldBytes,newFirstMapBytes:firstMap,searchGzipBytes:fs.statSync(new URL('search.json.gz',data)).size,oldMapGzipBytes:Object.keys(catalog.regions).reduce((n,r)=>n+gzipSync(fs.readFileSync(new URL(r+'.json',data))).length,0)}));
