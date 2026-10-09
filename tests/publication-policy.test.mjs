import test from 'node:test';
import assert from 'node:assert/strict';
import {publicationRule,publicStratum,projectFlat} from '../site/publication-policy.js';
import {acceptedKeys,evaluateStrata,habitatMetadata,summarizeSpatial,geoFeature,effectiveSpecies} from '../site/spatial-model.js';

const grass={id:'H125',label:'河川敷',supported:true,classes:[5],baseClasses:[5],coast:false,river:true,edge:false,rice:false,water:false,built:false,vegetation:0,elevation:[0,1,2,3],pending:[],limitations:[]};
const s={id:'1',classes:[5],records:{1:1}},settings={model:'distance',distance:500};
test('held habitats remain searchable definitions, never broad grassland matches',()=>{
  for(const rule of [grass,{...grass,coast:true,river:false}]){
    const held=publicationRule(rule);assert.equal(held.id,rule.id);assert.equal(held.label,rule.label);assert.equal(held.supported,false);
    for(const model of ['distance','cover'])assert.equal(acceptedKeys(s,[held],{...settings,model}).some(Boolean),false);
    const metadata=habitatMetadata(s,[held],settings)[0];assert.equal(metadata.evaluation,'publication_hold');assert.equal(metadata.river_distance_m,null);assert.equal(metadata.coast_distance_m,null);
  }
});
test('marginalization removes every held axis and preserves allowed predicate counts',()=>{
  const rule={...grass,river:false,edge:true,rice:true,water:true,vegetation:3};
  const mask=acceptedKeys(s,[rule],{...settings,distance:250});
  const original=[];
  for(let river=0;river<4;river++)for(let coast=0;coast<4;coast++)for(let height=0;height<4;height++)for(let edge=0;edge<4;edge++)for(let rice=0;rice<4;rice++)for(let water=0;water<4;water++){
    const k=3*262144+river*65536+rice*16384+edge*4096+coast*1024+5*64+height*16+water*4;
    original.push(k,1);assert.equal(mask[k],mask[publicStratum(k)]);
  }
  const projected=projectFlat(original);assert.ok(projected.length<original.length);
  assert.deepEqual(evaluateStrata(original,mask),evaluateStrata(projected,mask));
  projected.forEach((k,i)=>{if(i%2===0)assert.equal(k&(48|3072|196608),0);});
  assert.equal(publicationRule({...rule,label:'森林'}).supported,true);
});

test('elevation-dependent habitats cannot match broad landcover at any public distance',()=>{
  const forest={...grass,river:false,classes:[6,7,8,9],baseClasses:[6,7,8,9]};
  for(const [label,elevation] of [['山地',[2]],['山地の森林',[2]],['低山地の森林',[1]],['平地の森林',[0]],['平地～山地の森林',[0,1,2]],['海岸～低山地の森林',[0,1]]]){
    const original={...forest,label,elevation},held=publicationRule(original);
    assert.equal(held.supported,false);assert.deepEqual(held.publicationHold,['標高条件']);
    assert.deepEqual(original.classes,[6,7,8,9]);assert.deepEqual(publicationRule(held),held);
    for(const model of ['distance','cover'])for(const distance of [100,250,500]){
      const config={...settings,model,distance},mask=acceptedKeys(s,[held],config);
      assert.equal(mask.some(Boolean),false);
      assert.equal(geoFeature([10000,16000,1,[6*64,10]],mask,s,config,{prefectures:['北海道']}),null);
      assert.equal(habitatMetadata(s,[held],config)[0].evaluation,'publication_hold');
    }
  }
});

test('held height qualifiers yield unknown area; other usable habitats remain a partial result',()=>{
  const height=publicationRule({...grass,id:'mountain',label:'山地の森林',river:false,classes:[6],baseClasses:[6],elevation:[2]});
  const usable=publicationRule({...grass,id:'grass',label:'草地',river:false});
  const data={rules:{1:[height,usable]},summary:{1:{meshes:2,areas:{[6*64]:100,[5*64]:7}}}};
  const config={...settings,scope:'environment',region:'all',pref:''},catalog={prefectures:['北海道'],regions:{hokkaido:[1]}};
  const partial=summarizeSpatial(catalog,data,s,config);
  assert.equal(partial.area,7);assert.equal(partial.status,'partial_environment');assert.deepEqual(partial.excludedHabitats,['山地の森林']);
  const heldOnly={...config,habitats:{1:['mountain']}},result=summarizeSpatial(catalog,data,s,heldOnly);
  assert.equal(result.area,null);assert.equal(result.status,'unmapped');assert.equal(effectiveSpecies(data,s,heldOnly).mappedEnvironmentCount,0);
  assert.deepEqual(habitatMetadata(s,[height,usable],heldOnly).map(r=>r.id),['mountain']);
});

test('all reasons are retained when height and held distances coexist',()=>{
  const held=publicationRule({...grass,elevation:[1],coast:true,pending:['微環境の情報不足']});
  assert.deepEqual(held.publicationHold,['標高条件','海岸線への距離','河川への距離']);
  assert.ok(held.pending.includes('微環境の情報不足'));assert.deepEqual(held.classes,[]);
  assert.equal(publicationRule({...grass,river:false}).supported,true);
});
