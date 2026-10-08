import test from 'node:test';
import assert from 'node:assert/strict';
import {acceptedKeys,evaluateStrata,geoFeature,summarizeSpatial,habitatMetadata} from '../site/spatial-model.js';
const key=(c,h,w,b)=>c*64+h*16+w*4+b;
const s={id:'1',name:'テスト種',scientific:'Test species',classes:[5,6],records:{1:1}};

test('river and vegetation predicates are independent, and their union counts a pixel once',()=>{
  const grass=key(5,0,3,3),nearRiver=grass+65536,farRiver=grass+3*65536;
  const pasture=farRiver+3*262144,both=nearRiver+3*262144;
  const rules=[{id:'river',classes:[5],river:true,elevation:[0,1,2,3]}, {id:'pasture',classes:[5],vegetation:3,elevation:[0,1,2,3]}];
  const settings={model:'distance',distance:250};
  const mask=acceptedKeys(s,rules,settings);
  assert.equal(mask[farRiver],0);assert.equal(mask[pasture],1);assert.equal(mask[nearRiver],1);
  assert.equal(evaluateStrata([nearRiver,3,pasture,5,both,7,farRiver,11],mask).matching,15);
  assert.equal(acceptedKeys(s,[rules[0]],{...settings,distance:100})[nearRiver],0);
  assert.equal(acceptedKeys(s,[rules[1]],settings)[nearRiver+2*262144],0);
  assert.equal(habitatMetadata(s,rules,settings)[0].river_distance_m,250);
  assert.equal(habitatMetadata(s,rules,settings)[1].vegetation_group,3);
});

test('forest-edge and paddy predicates survive sparse summaries and habitat unions',()=>{
  const edge={id:'E',label:'林縁の草地',classes:[5],edge:true,elevation:[0,1,2,3]};
  const rice={id:'R',label:'水田の周囲',classes:[5],rice:true,elevation:[0,1,2,3]};
  const missing={id:'U',label:'植林地',classes:[6],supported:false,pending:['人工林区分'],elevation:[0,1,2,3]};
  const nearEdge=key(5,0,3,3)+3072+3*16384,nearRice=key(5,0,3,3)+3072+3*4096,both=key(5,0,3,3)+3072,neither=key(5,0,3,3)+3072+3*4096+3*16384;
  const settings={model:'elevation',distance:100,scope:'environment',region:'all',pref:''};
  const data={rules:{1:[edge,rice,missing]},summary:{1:{meshes:4,areas:{[nearEdge]:2,[nearRice]:3,[both]:5,[neither]:7}}}};
  const catalog={prefectures:['北海道'],regions:{hokkaido:[1]}};
  assert.equal(summarizeSpatial(catalog,data,s,{...settings,habitats:{1:['E']}}).area,7);
  assert.equal(summarizeSpatial(catalog,data,s,{...settings,habitats:{1:['R']}}).area,8);
  const union=summarizeSpatial(catalog,data,s,settings);
  assert.equal(union.area,10);assert.equal(union.total,17);assert.equal(union.status,'partial_environment');
  assert.deepEqual(union.excludedHabitats,['植林地']);
  assert.equal(habitatMetadata(s,[edge],settings)[0].forest_edge_distance_m,100);
  assert.equal(habitatMetadata(s,[rice],settings)[0].paddy_distance_m,100);
});

test('coastal grass requires coastline proximity and excludes inland waterside grass',()=>{
  const shore={id:'H132',label:'海岸の草地',classes:[5],baseClasses:[5],coast:true,water:false,built:false,elevation:[0,1,2,3]};
  const forest={id:'H066',label:'森林',classes:[6],baseClasses:[6],coast:false,water:false,built:false,elevation:[0,1,2,3]};
  const inlandLake=3072+key(5,0,0,3),coastalGrass=key(5,0,3,3),coastalForest=key(6,0,0,3);
  const settings={model:'distance',distance:100,scope:'environment'},mask=acceptedKeys(s,[shore],settings);
  assert.equal(mask[inlandLake],0);assert.equal(mask[coastalGrass],1);assert.equal(mask[coastalForest],0);
  const flat=[coastalGrass,7,coastalForest,11,inlandLake,13];
  assert.equal(evaluateStrata(flat,mask).matching,7);
  assert.equal(evaluateStrata(flat,acceptedKeys(s,[shore,forest],settings)).matching,18);
  const water={...shore,coast:false,water:true};
  assert.equal(evaluateStrata(flat,acceptedKeys(s,[shore,water,forest],settings)).matching,31);
  const rings=[100,250,500].map(distance=>acceptedKeys(s,[shore],{...settings,distance}));
  assert.equal(rings[0][1024+coastalGrass],0);assert.equal(rings[1][1024+coastalGrass],1);assert.equal(rings[2][2048+coastalGrass],1);
  for(let i=0;i<4096;i++){assert.ok(rings[0][i]<=rings[1][i]);assert.ok(rings[1][i]<=rings[2][i]);}
  assert.equal(habitatMetadata(s,[shore],settings)[0].coast_distance_m,100);
});

test('GIS export records only selected habitats and the conditions actually applied',()=>{
  const rules=[{id:'H001',label:'水辺の草地',classes:[5],baseClasses:[5],water:true,built:false,elevation:[0]}, {id:'H002',label:'公園',classes:[5,6],baseClasses:[],water:false,built:true,elevation:[0,1,2,3]}];
  const settings={model:'distance',distance:250,scope:'environment',habitats:{1:['H001']}};
  assert.deepEqual(habitatMetadata(s,rules,settings),[{id:'H001',label:'水辺の草地',classes:[5],excluded_landcover_classes:[],water_distance_m:250,coast_distance_m:null,built_distance_m:null,forest_edge_distance_m:null,paddy_distance_m:null,river_distance_m:null,vegetation_group:null,elevation_bands:null,evaluation:'calculated',unresolved:[],limitations:[]}]);
  assert.equal(habitatMetadata(s,rules,{...settings,model:'cover'})[0].water_distance_m,null);
  assert.deepEqual(habitatMetadata(s,rules,{...settings,model:'elevation'})[0].elevation_bands,[0]);
  assert.deepEqual(habitatMetadata(s,rules,{...settings,habitats:{1:[]}}),[]);
  const f=geoFeature([10000,16000,1,[key(5,0,0,0),100]],acceptedKeys(s,rules,settings),s,settings,{prefectures:['北海道']});
  assert.deepEqual(f.properties.habitat_ids,['H001']);
});
test('habitat selection is species-specific and changes summaries without double counting',()=>{
  const rules=[{id:'H001',classes:[5],baseClasses:[5],water:true,built:false,elevation:[0,1,2,3]}, {id:'H002',classes:[5,6],baseClasses:[6],water:false,built:false,elevation:[0,1,2,3]}];
  const areas=Array(1024).fill(0);areas[key(5,0,0,0)]=2;areas[key(5,0,3,0)]=3;areas[key(6,0,0,0)]=7;
  const data={rules:{1:rules},summary:{1:{areas,meshes:3}}},catalog={prefectures:['北海道'],regions:{hokkaido:[1]}};
  const settings={model:'distance',distance:100,region:'all',pref:'',scope:'environment',habitats:{1:['H001']}};
  assert.equal(summarizeSpatial(catalog,data,s,settings).area,2);
  assert.equal(summarizeSpatial(catalog,data,s,{...settings,habitats:{1:['H001','H002']}}).area,12);
  assert.equal(summarizeSpatial(catalog,data,s,{...settings,model:'cover'}).area,5);
  assert.equal(summarizeSpatial(catalog,data,s,{...settings,habitats:{1:[]}}).status,'no_environment');
  assert.equal(summarizeSpatial(catalog,data,s,{...settings,habitats:{2:['H001']}}).area,12);
});
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
