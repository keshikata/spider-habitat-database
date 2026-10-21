import test from 'node:test';import assert from 'node:assert/strict';
import {validateQueryPack,createQueryDelivery} from '../site/query-delivery.js';
import {validateQueryIndex} from '../site/delivery.js';
const hash='a'.repeat(64),group='b'.repeat(12),entry={habitats:['H001']},data={schema:6,summary:{1:{}},geography:{regions:{1:{pref:1}}}};
const header={schema:1,sourceManifestSHA256:hash,habitats:['H001'],signatures:[[0,0,0,0],[1,1,1,1]]};
test('query files reject incorrect versions, identities, keys, counters and geographic assignments',()=>{
  const counts=Array(16).fill(0);counts[6]=10;
  const map={...header,cells:[[10000,15000,1,1,counts,[518,5]]]};assert.equal(validateQueryPack(map,entry,'map',data,hash),map);
  for(const change of [v=>v.sourceManifestSHA256='f'.repeat(64),v=>v.habitats=['H002'],v=>v.signatures[1][0]=2,v=>v.cells[0][2]=2,v=>v.cells[0][5][0]=512,v=>v.cells[0][5][0]=999999999,v=>v.cells[0][5][1]=11,v=>v.cells[0][5][1]=-1,v=>v.cells[0][4][6]=0]){
    const invalid=structuredClone(map);change(invalid);assert.throws(()=>validateQueryPack(invalid,entry,'map',data,hash));
  }
  assert.equal(validateQueryPack({...header,summary:{1:{518:1.23456789012345}},regions:{1:{518:1.23456789012345}}},entry,'summary',data,hash).summary[1][518],1.23456789012345);
  assert.throws(()=>validateQueryPack({...header,summary:{1:{518:Infinity}},regions:{1:{518:1}}},entry,'summary',data,hash));
});
test('scoped delivery chooses only required national or recorded rows, reuses full summaries and checks catalog binding',async()=>{
  const catalogSHA256='c'.repeat(64),summary={file:'full',bytes:100,decodedBytes:100},national={file:'national',bytes:10,decodedBytes:10},recorded={file:'recorded',bytes:15,decodedBytes:15};
  const aggregate={areas:{518:1.23456789012345},meshes:2,total:3,missing:0,elevationMissing:0},requests=[];
  const delivery={groups:{[group]:{...entry,summary,national,map:{file:'map'}}},species:{1:group},recorded:{1:recorded},catalogSHA256};
  const files={full:{...header,summary:{1:aggregate.areas},regions:{1:aggregate.areas}},national:{...header,catalogSHA256,scope:'environment',speciesId:null,aggregate},recorded:{...header,catalogSHA256,scope:'recorded',speciesId:1,aggregate}};
  // Species IDs in the catalog are strings, including in the scope identity.
  files.recorded.speciesId='1';const read=async info=>{requests.push(info.file);return structuredClone(files[info.file]);};
  const q=createQueryDelivery(delivery,data,read,hash,true),settings={region:'all',pref:'',scope:'environment'};
  await q.ensureSpecies(['1'],settings);assert.deepEqual(requests,['national']);assert.equal(q.summaryFor('1',settings).aggregate.queryAreas.values[0],aggregate.areas[518]);
  settings.scope='recorded';await q.ensureSpecies(['1'],settings);assert.deepEqual(requests,['national','recorded']);
  await q.ensureSpecies(['1'],{...settings,pref:'1'});assert.equal(requests.at(-1),'full');await q.ensureSpecies(['1'],{...settings,pref:'2'});assert.equal(requests.length,3);
  const unverified=createQueryDelivery(delivery,data,read,hash);await unverified.ensureSpecies(['1'],settings);assert.equal(requests.at(-1),'full');
  files.recorded.catalogSHA256='d'.repeat(64);const invalid=createQueryDelivery(delivery,data,read,hash,true);await assert.rejects(invalid.ensureSpecies(['1'],settings),/分類版/);
});
test('a whole group is fetched once when multiple recorded scopes cost more, and a failed fetch can be retried',async()=>{
  const full={file:'full',bytes:20,decodedBytes:100},rec={file:'rec',bytes:15,decodedBytes:20},requests=[];
  const delivery={groups:{[group]:{...entry,summary:full,map:{file:'map'}}},species:{1:group,2:group},recorded:{1:rec,2:rec},catalogSHA256:'c'.repeat(64)};
  let fail=true;const q=createQueryDelivery(delivery,data,async info=>{requests.push(info.file);if(fail)throw new Error('offline');return{...header,summary:{1:{518:1}},regions:{1:{518:1}}};},hash,true),settings={region:'all',pref:'',scope:'recorded'};
  await assert.rejects(q.ensureSpecies(['1','2'],settings),/offline/);fail=false;await q.ensureSpecies(['1','2'],settings);assert.deepEqual(requests,['full','full']);assert.equal(q.needsSpecies(['1','2'],settings),false);assert.equal(q.summaryFor('2',settings).summary[1].queryAreas.values[0],1);
});
test('lazy query indexes cannot name remote, traversing or unversioned files',()=>{
  const info=p=>({sha256:hash,file:'query-pref-'+group+'-'+p+'-'+hash.slice(0,12)+'.json.gz',bytes:1,decodedBytes:1});
  const index={schema:1,group,sourceManifestSHA256:hash,prefectures:Object.fromEntries(Array.from({length:47},(_,i)=>[i+1,info(i+1)]))};
  assert.equal(Object.keys(validateQueryIndex(index,group,hash)).length,47);
  for(const file of ['https://example.com/x','../private.json','query-pref.json.gz'])assert.throws(()=>validateQueryIndex({...index,prefectures:{...index.prefectures,1:{...info(1),file}}},group,hash));
});
