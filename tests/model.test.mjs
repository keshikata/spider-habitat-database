import test from 'node:test';
import assert from 'node:assert/strict';
import {summarize,prefecturesFor,meshPosition,pixelArea,matchCell,csv} from '../site/model.js';
const catalog={prefectures:['A','B'],regions:{part:[1]},summary:{1:{areas:[4,0,0,0,10,20,...Array(10).fill(0)],meshes:2},2:{areas:[6,0,0,0,30,40,...Array(10).fill(0)],meshes:3}}};
test('record restriction differs from absence; unknown environment is not zero',()=>{
  const species={classes:[4,5],records:{1:2}};
  assert.equal(summarize(catalog,species).area,30);
  assert.equal(summarize(catalog,species,{scope:'environment'}).area,100);
  assert.equal(summarize(catalog,{...species,classes:[]}).area,null);
  assert.equal(summarize(catalog,species,{pref:2}).area,null);
  assert.equal(summarize(catalog,species,{pref:2}).status,'no_scope');
  assert.deepEqual(prefecturesFor(catalog,'part',2,'environment',species),[]);
});
test('overlapping habitat categories do not double count',()=>{
  assert.equal(summarize(catalog,{classes:[4,4,5],records:{1:2}}).area,30);
  assert.deepEqual(matchCell([20,0,0,0,10,70],[4,4,5]),{total:100,matching:80,ratio:.8,missing:20});
});
test('NoData remains in denominator and is separately reported',()=>{
  assert.equal(matchCell([90,10],[1]).ratio,.1);
  assert.equal(summarize(catalog,{classes:[5],records:{1:1}}).missing,4);
});
test('standard Japanese mesh decoding and latitude-dependent area',()=>{
  const p=meshPosition('53394525');
  assert.ok(Math.abs(p.west-139.6875)<1e-10);
  assert.ok(Math.abs(p.south-35.68333333333333)<1e-10);
  assert.ok(pixelArea(25)>pixelArea(45));
  assert.ok(pixelArea(35)*1e6>60&&pixelArea(35)*1e6<75);
  assert.throws(()=>meshPosition('bad'));
});
test('CSV preserves Japanese and quotes while neutralizing formulas',()=>{
  const data=csv([['和名','=1+1','a"b','x\ny']]);
  assert.ok(data.startsWith('\uFEFF'));assert.ok(data.includes('"\'=1+1"'));assert.ok(data.includes('"a""b"'));
});
