import test from 'node:test';
import assert from 'node:assert/strict';
import {recordScope,includesRecordRow,attachRegions,geographicNote} from '../site/record-geography.js';
import {summarizeSpatial,acceptedKeys,geoFeature} from '../site/spatial-model.js';
import {habitatSelection,evaluableRules} from '../site/habitat-selection.js';
import {pixelArea} from '../site/model.js';

test('shared habitat selection intersects each species, preserving none versus all',()=>{
  const rules={1:[{id:'H001',classes:[5],baseClasses:[5]},{id:'H002',classes:[6],baseClasses:[]}],2:[{id:'H003',classes:[5],baseClasses:[5]}]};
  assert.deepEqual(habitatSelection(rules,['H001','H003']),{1:['H001'],2:['H003']});
  assert.deepEqual(habitatSelection(rules,[]),{1:[],2:[]});
  assert.deepEqual(habitatSelection(rules,null),{});
  assert.deepEqual(evaluableRules(rules[1],'cover').map(r=>r.id),['H001']);
  assert.equal(evaluableRules(rules[1],'distance').length,2);
});

const key=5*64,rows=attachRegions([[9300,13600,46,[key,100]],[9301,13600,46,[key,50]],[9700,15000,46,[key,200]]],[[0,2],[2,1]]);
const areas=(n)=>{const a=Array(1024).fill(0);a[key]=n;return a;};
const islandArea=150*pixelArea(13600.5/480),mainlandArea=200*pixelArea(15000.5/480);
const geography={islands:{奄美大島:'2'},mainland:{46:'1'},regions:{1:{pref:46,areas:areas(mainlandArea),meshes:1},2:{pref:46,areas:areas(islandArea),meshes:2}}};
const species={id:'1',name:'テスト種',scientific:'Test species',classes:[5],records:{46:1},recordAreas:{46:{mainland:0,islands:['奄美大島'],unspecified:0}}};
const catalog={prefectures:Array.from({length:47},(_,i)=>String(i+1)),regions:{kyushu:[46]}};
const settings={region:'all',pref:'',scope:'recorded',model:'distance',distance:250};
const rules=[{id:'H001',classes:[5],baseClasses:[5],water:false,built:false,elevation:[0,1,2,3]}];
const data={geography,rules:{1:rules},summary:{46:{areas:areas(islandArea+mainlandArea),meshes:3}}};

test('island-only record excludes mainland from map rows, total and GeoJSON area',()=>{
  const scope=recordScope(geography,species,[46],'recorded');
  const filtered=rows.filter(r=>includesRecordRow(scope,r));
  assert.equal(filtered.length,2);assert.ok(filtered.every(r=>r[4]===2));
  const summary=summarizeSpatial(catalog,data,species,settings);
  assert.equal(summary.area,islandArea);assert.equal(summary.meshes,2);
  const mask=acceptedKeys(species,rules,settings);
  const exported=filtered.map(r=>geoFeature(r,mask,species,settings,catalog));
  assert.ok(Math.abs(exported.reduce((n,f)=>n+f.properties.candidate_area_km2,0)-summary.area)<1e-10);
});

test('unknown record detail uses whole prefecture; unresolved named island does not',()=>{
  const unknown={...species,recordAreas:{46:{mainland:0,islands:['奄美大島'],unspecified:1}}};
  assert.equal(summarizeSpatial(catalog,data,unknown,settings).area,islandArea+mainlandArea);
  const unresolved={...species,recordAreas:{46:{mainland:0,islands:['未対応島'],unspecified:0}}};
  const result=summarizeSpatial(catalog,data,unresolved,settings);
  assert.equal(result.area,null);assert.equal(result.status,'no_geography');
  assert.equal(rows.filter(r=>includesRecordRow(result.geography,r)).length,0);
  assert.equal(summarizeSpatial(catalog,data,species,{...settings,scope:'environment',pref:'46'}).area,islandArea+mainlandArea);
  assert.match(geographicNote(geography,recordScope(geography,species,[46],'environment')),/分布記録による制限なし/);
});

test('mainland and island unions are deduplicated and malformed runs rejected',()=>{
  const both={...species,recordAreas:{46:{mainland:1,islands:['奄美大島','奄美大島'],unspecified:0}}};
  assert.equal(summarizeSpatial(catalog,data,both,settings).area,islandArea+mainlandArea);
  assert.throws(()=>attachRegions(rows,[[1,2]]));
  assert.throws(()=>attachRegions(rows,[[0,2],[0,1]]));
});
