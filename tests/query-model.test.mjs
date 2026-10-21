import test from 'node:test';import assert from 'node:assert/strict';
import {queryCompiler,queryMask,sourceKey,QUERY_BASES} from '../site/query-model.js';
import {acceptedKeys} from '../site/spatial-model.js';
import {ELEVATION_STRIDE} from '../site/elevation.js';
const rule=(id,extra={})=>({id,classes:[4,6],baseClasses:[4,6],supported:true,elevation:[0,1,2,3],edge:false,rice:false,water:false,built:false,coast:false,river:false,vegetation:0,...extra});
const rules=[rule('H001',{water:true,elevation:[0,1],elevationRequired:true}),rule('H002',{edge:true,vegetation:2,elevation:[2],elevationRequired:true}),rule('H003',{rice:true,built:true,classes:[4],baseClasses:[4]})],species={id:'1',classes:[4,6]};
test('compiled predicates exactly match native masks for all distance/vegetation bases and habitat subsets',()=>{
  const query=queryCompiler(rules);
  for(const model of ['cover','distance','elevation'])for(const distance of [100,250,500])for(let subset=0;subset<8;subset++){
    const settings={model,distance,habitats:{1:rules.filter((r,i)=>subset&2**i).map(r=>r.id)},excludedClasses:subset===5?[4]:[]};
    const native=acceptedKeys(species,rules,settings),compiled=queryMask(query,rules,species,settings);
    for(let base=0;base<QUERY_BASES;base++)for(let h=0;h<4;h++){
      const raw=sourceKey(base)+h*16,key=query.key(raw,false);
      assert.equal(key?compiled.matches(key):0,native[raw],`${model}/${distance}/${subset}/${raw}`);
    }
  }
});
test('height boundaries, missing values and full-range strata use the same exact predicate as native data',()=>{
  const query=queryCompiler(rules);
  for(const [lowlandMax,mountainMin] of [[100,200],[200,800],[500,1000],[2900,3000]])for(let subset=0;subset<8;subset++){
    const settings={model:'elevation',distance:250,elevationStepM:100,lowlandMax,mountainMin,habitats:{1:rules.filter((r,i)=>subset&2**i).map(r=>r.id)}};
    const native=acceptedKeys(species,rules,settings),compiled=queryMask(query,rules,species,settings);
    for(let base=0;base<QUERY_BASES;base+=7)for(let bin=0;bin<32;bin++){
      const raw=bin*ELEVATION_STRIDE+sourceKey(base),key=query.key(raw,true);assert.equal(key?compiled.matches(key):0,native.matches(raw),`${lowlandMax}/${mountainMin}/${subset}/${base}/${bin}`);
    }
  }
});
