import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {validateDelivery,validateQueryIndex} from '../site/delivery.js';
import {queryCompiler} from '../site/query-model.js';
import {validateQueryPack} from '../site/query-delivery.js';
import {ELEVATION_STRIDE} from '../site/elevation.js';
import {prefecturesFor} from '../site/model.js';
import {recordScope} from '../site/record-geography.js';

export function checkQueryDelivery(root,onProgress=()=>{}){
  const read=name=>JSON.parse(fs.readFileSync(path.join(root,name))),d=validateDelivery(read('delivery-manifest.json'));
  if(!d.query)return {groups:0};
  const unpack=info=>{const b=fs.readFileSync(path.join(root,info.file));assert.equal(b.length,info.bytes);assert.equal(createHash('sha256').update(b).digest('hex'),info.sha256);const raw=gunzipSync(b,{maxOutputLength:info.decodedBytes});assert.equal(raw.length,info.decodedBytes);return JSON.parse(raw);};
  const data=unpack(d.summary),g=JSON.parse(gunzipSync(fs.readFileSync(path.join(root,'geography.json.gz')))),meta=unpack(d.query.metadata),geo=unpack(d.query.geography),manifest=read('manifest.json');
  assert.equal(g.sourceManifestSHA256,d.sourceManifestSHA256);assert.deepEqual({...meta,summary:data.summary},data);assert.deepEqual({...geo,regions:g.regions,tiles:g.tiles,overview:g.overview},g);
  const runs=unpack(d.query.runs);assert.equal(runs.sourceManifestSHA256,d.sourceManifestSHA256);assert.deepEqual(runs.tiles,g.tiles);
  const totals=row=>{let total=0,missing=0,elevationMissing=0;for(const [k,v] of Object.entries(row.areas)){total+=v;if(Number(k)%1024<64)missing+=v;if(data.schema===6?Math.floor(Number(k)/ELEVATION_STRIDE)===31:(Number(k)>>>4&3)===3)elevationMissing+=v;}return {...row,areas:{},total,missing,elevationMissing};};
  for(const [id,row] of Object.entries(data.summary))assert.deepEqual(meta.summary[id],totals(row));
  for(const [id,row] of Object.entries(g.regions))assert.deepEqual(geo.regions[id],totals(row));
  const catalog=JSON.parse(fs.readFileSync(new URL('../site/data/search.json',import.meta.url))),catalogSHA256=createHash('sha256').update(JSON.stringify(catalog)).digest('hex');
  if(d.query.catalogSHA256)assert.equal(d.query.catalogSHA256,catalogSHA256);
  const ordinary=unpack(manifest.overview).cells,regional=g.overview,all=[...ordinary,...regional],context={...data,geography:g};let checkedRows=0,completed=0,aggregates=0;
  for(const [group,entry] of Object.entries(d.query.groups)){
    const species=Object.keys(d.query.species).find(id=>d.query.species[id]===group),compiler=queryCompiler(data.rules[species]);
    assert.deepEqual(compiler.habitats,entry.habitats);
    const summary=validateQueryPack(unpack(entry.summary),entry,'summary',context,d.sourceManifestSHA256),map=validateQueryPack(unpack(entry.map),entry,'map',context,d.sourceManifestSHA256);
    assert.deepEqual(summary.signatures,compiler.signatures);assert.deepEqual(map.signatures,compiler.signatures);
    const checkAggregate=(info,scope,speciesId,range)=>{
      const value=validateQueryPack(unpack(info),entry,'aggregate',context,d.sourceManifestSHA256),areas=new Map();let meshes=0,total=0,missing=0,elevationMissing=0;
      assert.equal(value.catalogSHA256,catalogSHA256);assert.equal(value.scope,scope);assert.equal(value.speciesId,speciesId);assert.deepEqual(value.signatures,compiler.signatures);
      const rows=[...[...range.fullPrefs].map(p=>({...meta.summary[p],areas:summary.summary[p]})),...[...range.regionIds].map(id=>({...geo.regions[id],areas:summary.regions[id]}))];
      for(const row of rows){meshes+=row.meshes;total+=row.total;missing+=row.missing;elevationMissing+=row.elevationMissing;for(const [key,area] of Object.entries(row.areas))areas.set(Number(key),(areas.get(Number(key))||0)+area);}
      assert.deepEqual(value.aggregate,{meshes,total,missing,elevationMissing,areas:Object.fromEntries([...areas].sort((a,b)=>a[0]-b[0]))});aggregates++;
    };
    if(entry.national)checkAggregate(entry.national,'environment',null,{fullPrefs:new Set(Array.from({length:47},(_,i)=>i+1)),regionIds:new Set()});
    for(const [id,gid] of Object.entries(d.query.species))if(gid===group&&d.query.recorded?.[id]){const s=catalog.species.find(s=>s.id===id),prefs=prefecturesFor(catalog,'all','','recorded',s);checkAggregate(d.query.recorded[id],'recorded',id,recordScope(geo,s,prefs,'recorded'));}
    for(const [name,source] of [['summary',data.summary],['regions',g.regions]])for(const [id,row] of Object.entries(source)){
      const values=new Map();for(const [k,v] of Object.entries(row.areas)){const key=compiler.key(Number(k),data.schema===6);if(key)values.set(key,(values.get(key)||0)+v);}assert.deepEqual(summary[name][id],Object.fromEntries([...values].sort((a,b)=>a[0]-b[0])));
    }
    assert.equal(map.cells.length,all.length);
    for(let j=0;j<all.length;j++){
      const r=all[j],actual=map.cells[j],values=new Map(),counts=Array(16).fill(0);
      for(let i=0;i<r[3].length;i+=2){const raw=r[3][i],count=r[3][i+1],key=compiler.key(raw,data.schema===6);counts[raw>>>6&15]+=count;if(key)values.set(key,(values.get(key)||0)+count);}
      assert.deepEqual(actual,[r[0],r[1],r[2],j<ordinary.length?0:r[4],counts,[...values].sort((a,b)=>a[0]-b[0]).flat()]);checkedRows++;
    }
    if(entry.index){const parts=validateQueryIndex(unpack(entry.index),group,d.sourceManifestSHA256);for(let p=1;p<=47;p++){const part=validateQueryPack(unpack(parts[p]),entry,'map',context,d.sourceManifestSHA256);assert.deepEqual(part.signatures,map.signatures);assert.deepEqual(part.cells,map.cells.filter(r=>r[2]===p));}}
    onProgress({completed:++completed,total:Object.keys(d.query.groups).length});
  }
  return {groups:completed,checkedRows,aggregates,metadata:'exact',compiledCountsAndCoordinates:'exact',areas:'full_float64_no_rounding',prefecturePartitions:'exact',scopedAggregates:'exact',catalogSHA256};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))console.log(JSON.stringify(checkQueryDelivery(path.resolve(process.argv[2]||'local/elevation-delivery-ready-2026-10-13'),r=>console.log(JSON.stringify(r)))));
