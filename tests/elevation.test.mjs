import test from 'node:test';
import assert from 'node:assert/strict';
import {elevationThresholds,heightBand,ELEVATION_STRIDE,ELEVATION_STRATA,elevationRuleDescription} from '../site/elevation.js';
import {acceptedKeys,evaluateStrata,summarizeSpatial,habitatMetadata,geoFeature} from '../site/spatial-model.js';
import {publicationRule,publicationProfile,elevationApproval,ELEVATION_PREVIEW_POLICY,ELEVATION_PUBLICATION_POLICY,ELEVATION_METHOD,ELEVATION_OUTPUTS,publicStratum,projectFlat} from '../site/publication-policy.js';
const key=(metres,c=6)=>Math.floor(metres/100)*ELEVATION_STRIDE+c*64;
const missing=31*ELEVATION_STRIDE+6*64;
const species={id:'1',name:'テスト',scientific:'Test species',classes:[6],records:{1:1}};
const original={id:'H025',label:'山地の森林',classes:[6],baseClasses:[6],supported:true,elevation:[2],edge:false,rice:false,river:false,coast:false,water:false,built:false,vegetation:0,pending:[],limitations:[]};
const mountain=publicationRule(original,{elevation:true});
const settings={model:'elevation',distance:100,elevationStepM:100,lowlandMax:200,mountainMin:800,region:'all',pref:'',scope:'environment'};
test('thresholds are valid 100m steps, ordered and bounded; malformed values restore the default pair',()=>{
  for(const value of [{},{lowlandMax:0,mountainMin:800},{lowlandMax:200,mountainMin:200},{lowlandMax:250,mountainMin:800},{lowlandMax:200,mountainMin:3100},{lowlandMax:NaN,mountainMin:800}])assert.deepEqual(elevationThresholds(value),{lowlandMax:200,mountainMin:800});
  assert.deepEqual(elevationThresholds({lowlandMax:300,mountainMin:1000}),{lowlandMax:300,mountainMin:1000});
  assert.equal(heightBand(key(100),settings),0);assert.equal(heightBand(key(200),settings),1);assert.equal(heightBand(key(700),settings),1);assert.equal(heightBand(key(800),settings),2);assert.equal(heightBand(missing,settings),3);
  assert.equal(elevationRuleDescription([0,1],settings),'標高800m未満');
});
test('moving the mountain threshold changes the actual accepted pixels and keeps missing height excluded',()=>{
  const flat=[key(100),1,key(500),2,key(700),3,key(800),5,key(1000),7,missing,11];
  for(const model of ['elevation','distance','cover']){
    const initial=acceptedKeys(species,[mountain],{...settings,model});
    const lower=acceptedKeys(species,[mountain],{...settings,model,mountainMin:500});
    const higher=acceptedKeys(species,[mountain],{...settings,model,mountainMin:1000});
    assert.equal(initial[missing],0);assert.equal(lower[missing],0);assert.equal(initial.length,ELEVATION_STRATA);
    assert.equal(evaluateStrata(flat,initial).matching,12);assert.equal(evaluateStrata(flat,lower).matching,17);assert.equal(evaluateStrata(flat,higher).matching,7);
    assert.equal(evaluateStrata(flat,initial).total,29);
    assert.equal(acceptedKeys(species,[mountain],{...settings,model}),initial);
  }
});
test('unconstrained alternative habitats can retain missing heights without inventing a lowland height',()=>{
  const forest={...mountain,id:'forest',elevation:[0,1,2,3],elevationRequired:false};
  const mask=acceptedKeys(species,[mountain,forest],settings);
  assert.equal(mask[missing],1);assert.equal(mask[key(100)],1);
  const flat=[key(800),5,missing,11];assert.equal(evaluateStrata(flat,mask).matching,16);
});
test('summary and exported polygons use the selected thresholds and the same candidate counts',()=>{
  const data={schema:6,rules:{1:[mountain]},summary:{1:{meshes:2,areas:{[key(500)]:2,[key(800)]:5,[missing]:11}}}},catalog={prefectures:['北海道'],regions:{hokkaido:[1]}};
  assert.equal(summarizeSpatial(catalog,data,species,settings).area,5);
  const lower={...settings,mountainMin:500};assert.equal(summarizeSpatial(catalog,data,species,lower).area,7);
  assert.equal(summarizeSpatial(catalog,data,species,settings).elevationMissing,11);
  const feature=geoFeature([10000,16000,1,[key(500),2,key(800),5,missing,11]],acceptedKeys(species,[mountain],lower),species,lower,catalog);
  assert.equal(feature.properties.matching_pixel_fraction,7/18);
  assert.deepEqual(habitatMetadata(species,[mountain],lower)[0].elevation_bands,[2]);
});
test('fine-height projection removes coast and river dimensions but preserves the height bucket',()=>{
  const profile={elevation:true};
  for(const bin of [0,1,2,8,30,31])for(const coast of [0,1,2,3])for(const river of [0,1,2,3]){
    const original=bin*ELEVATION_STRIDE+6*64+coast*1024+river*65536;
    assert.equal(publicStratum(original,profile),bin*ELEVATION_STRIDE+6*64);
  }
  assert.deepEqual(projectFlat([key(800),3,key(800)+1024,5],profile),[key(800),8]);
});
test('local pending data cannot be enabled on a public host, and partial approval cannot release any output',()=>{
  const preview={schema:6,strata:ELEVATION_STRATA,elevationStepM:100,dem:true,localOnly:true,publicationPolicy:ELEVATION_PREVIEW_POLICY,elevationMethod:ELEVATION_METHOD,elevationBands:ELEVATION_METHOD.bands,elevationFilter:'required'};
  assert.throws(()=>publicationProfile(preview));assert.equal(publicationProfile(preview,{allowLocalPreview:true}).preview,true);
  const approval={status:'approved',authority:'国土地理院',article:30,number:'TEST-ONLY-001',issuedOn:'2026-10-13',site:'https://spider-habitat-atlas.pages.dev/',receiptSHA256:'a'.repeat(64),outputs:ELEVATION_OUTPUTS,attribution:'TEST-ONLY-001 をテスト'};
  assert.equal(elevationApproval(approval).status,'approved');
  for(const field of ['number','receiptSHA256','issuedOn','outputs'])assert.throws(()=>elevationApproval({...approval,[field]:undefined}));
  assert.throws(()=>elevationApproval({...approval,outputs:['web_map']}));
  const release={...preview,localOnly:false,publicationPolicy:ELEVATION_PUBLICATION_POLICY,elevationApproval:approval};
  assert.equal(publicationProfile(release).preview,false);assert.throws(()=>publicationProfile({...release,elevationFilter:'optional'}));
});
