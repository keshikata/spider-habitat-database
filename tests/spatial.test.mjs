import test from 'node:test';
import assert from 'node:assert/strict';
import {acceptedKeys,evaluateStrata,geoFeature,summarizeSpatial} from '../site/spatial-model.js';
const key=(c,h,w,b)=>c*64+h*16+w*4+b;
const s={id:'1',name:'テスト種',scientific:'Test species',classes:[5,6],records:{1:1}};
test('proximity uses AND inside a habitat and OR between alternative habitats',()=>{
  const rules=[{classes:[5],water:true,built:true,elevation:[0,1]}, {classes:[6],water:false,built:false,elevation:[0,1,2,3]}];
  const m=acceptedKeys(s,rules,{model:'distance',distance:100});
  assert.equal(m[key(5,0,0,0)],1);assert.equal(m[key(5,0,0,1)],0);assert.equal(m[key(5,0,1,0)],0);
  assert.equal(m[key(6,2,3,3)],1); // A different, unconstrained forest habitat remains eligible.
  assert.equal(evaluateStrata([key(5,0,0,0),7,key(6,2,3,3),11],m).matching,18);
});
test('distance thresholds nest; missing elevation is not silently treated as lowland',()=>{
  const rules=[{classes:[5],water:true,built:false,elevation:[0]}];
  const masks=[100,250,500].map(distance=>acceptedKeys(s,rules,{model:'distance',distance}));
  assert.equal(masks[0][key(5,0,1,3)],0);assert.equal(masks[1][key(5,0,1,3)],1);assert.equal(masks[2][key(5,0,2,3)],1);
  const e=acceptedKeys(s,rules,{model:'elevation',distance:500});assert.equal(e[key(5,3,0,0)],0);assert.equal(e[key(5,0,0,0)],1);
  for(let i=0;i<1024;i++){assert.ok(masks[0][i]<=masks[1][i]);assert.ok(masks[1][i]<=masks[2][i]);assert.ok(e[i]<=masks[2][i]);}
});
test('GeoJSON is a closed counterclockwise longitude-latitude polygon with an area attribute',()=>{
  const settings={model:'cover',distance:250,scope:'environment'},mask=acceptedKeys(s,[],settings);
  const f=geoFeature([10000,16000,1,[key(5,0,0,0),100]],mask,s,settings,{prefectures:['北海道'],date:'2026-10-08',landcover:'test'});
  const ring=f.geometry.coordinates[0];assert.deepEqual(ring[0],ring.at(-1));assert.equal(ring[0][0],131.25);assert.ok(ring[2][1]>ring[0][1]);
  assert.ok(f.properties.candidate_area_km2>0&&f.properties.candidate_area_km2<.01);assert.equal(f.properties.matching_pixel_fraction,1);
});
test('a new garden proxy is evaluated, while absent records remain no_scope',()=>{
  const rules={1:[{classes:[5],water:false,built:true,elevation:[0,1,2,3]}]},areas=Array(1024).fill(0);areas[key(5,0,0,0)]=2;
  const data={rules,summary:{1:{areas,meshes:4}}},catalog={prefectures:['北海道'],regions:{hokkaido:[1]}};
  const a=summarizeSpatial(catalog,data,{...s,classes:[],records:{}},{model:'distance',distance:100,region:'all',pref:'',scope:'environment'});
  assert.equal(a.area,2);assert.equal(a.status,'evaluated');
  const b=summarizeSpatial(catalog,data,{...s,records:{}},{model:'distance',distance:100,region:'all',pref:'',scope:'recorded'});
  assert.equal(b.status,'no_scope');assert.equal(b.area,null);
});
