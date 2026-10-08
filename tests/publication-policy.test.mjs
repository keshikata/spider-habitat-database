import test from 'node:test';
import assert from 'node:assert/strict';
import {publicationRule,publicStratum,projectFlat} from '../site/publication-policy.js';
import {acceptedKeys,evaluateStrata,habitatMetadata} from '../site/spatial-model.js';

const grass={id:'H125',label:'河川敷',supported:true,classes:[5],baseClasses:[5],coast:false,river:true,edge:false,rice:false,water:false,built:false,vegetation:0,elevation:[0,1,2,3],pending:[],limitations:[]};
const s={id:'1',classes:[5]},settings={model:'distance',distance:500};
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
  assert.equal(publicationRule({...rule,label:'海岸～低山地の森林'}).supported,true);
});
