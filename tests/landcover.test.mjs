import test from 'node:test';
import assert from 'node:assert/strict';
import {excludedClasses,includedClasses,summarize,pixelArea} from '../site/model.js';
import {acceptedKeys,effectiveSpecies,evaluateStrata,summarizeSpatial,geoFeature,habitatMetadata} from '../site/spatial-model.js';

const rule={id:'H066',label:'水辺の森林',supported:true,classes:[6,8],baseClasses:[6,8],water:true,elevation:[0,1,2,3],pending:[]};
const species={id:'1',classes:[6,8],records:{1:1}};
const settings={model:'distance',distance:100,region:'all',scope:'recorded'};
const keys=[6*64,8*64,6*64+12,8*64+12];
const catalog={prefectures:['A'],summary:{1:{areas:Array(16).fill(0),meshes:1}}};
const data={rules:{1:[rule],2:[{...rule,classes:[8]}]},summary:{1:{meshes:1,areas:Object.fromEntries(keys.map((key,i)=>[key,[2,3,5,7][i]]))}}};

test('landcover URL choices reject malformed ids and default to all allowed classes',()=>{
  assert.deepEqual(excludedClasses('8.6.8.0.16.-1.6x..NaN'),[6,8]);
  assert.deepEqual(excludedClasses([null,true,{},6,'8',Infinity]),[6,8]);
  assert.deepEqual(includedClasses([6,8,6]),[6,8]);
  assert.deepEqual(includedClasses([6,8],{excludedClasses:[6]}),[8]);
});

test('landcover toggles preserve distance AND, habitat OR, total denominator and mask cache restoration',()=>{
  const flat=keys.flatMap((key,i)=>[key,[2,3,5,7][i]]);
  const initial=acceptedKeys(species,[rule],settings),changed={...settings,excludedClasses:[6]};
  assert.equal(evaluateStrata(flat,initial).matching,5);
  const mask=acceptedKeys(species,[rule],changed),result=evaluateStrata(flat,mask);
  assert.equal(result.matching,3);assert.equal(result.total,17);assert.equal(mask[keys[3]],0);
  assert.equal(summarizeSpatial(catalog,data,species,changed).area,3);
  const overlap={...rule,id:'H067'};
  assert.equal(evaluateStrata(flat,acceptedKeys(species,[rule,overlap],changed)).matching,3);
  assert.equal(acceptedKeys(species,[rule],settings),initial);
  assert.equal(summarizeSpatial(catalog,data,species,settings).area,5);
});

test('comparison shares exclusions and all-off is not zero or missing habitat information',()=>{
  const changed={...settings,excludedClasses:[8]};
  const other={...species,id:'2',classes:[8]};
  assert.deepEqual(effectiveSpecies(data,species,changed).classes,[6]);
  assert.equal(summarizeSpatial(catalog,data,species,changed).area,2);
  assert.equal(summarizeSpatial(catalog,data,other,changed).status,'no_landcover');
  const allOff={...settings,excludedClasses:[6,8]};
  assert.equal(summarizeSpatial(catalog,data,species,allOff).area,null);
  assert.equal(summarizeSpatial(catalog,data,species,allOff).status,'no_landcover');
  assert.equal(summarizeSpatial(catalog,data,species,{...allOff,habitats:{1:[]}}).status,'no_environment');
  catalog.summary[1].areas[6]=2;catalog.summary[1].areas[8]=3;
  assert.equal(summarize(catalog,species,changed).area,2);
  assert.equal(summarize(catalog,species,allOff).status,'no_landcover');
});

test('GeoJSON retains exclusions and applied habitat conditions with the matching area',()=>{
  const changed={...settings,excludedClasses:[6]},flat=keys.flatMap((key,i)=>[key,[2,3,5,7][i]]);
  const feature=geoFeature([10000,16000,1,flat],acceptedKeys(species,[rule],changed),species,changed,catalog);
  assert.deepEqual(feature.properties.excluded_landcover_classes,[6]);
  assert.equal(feature.properties.matching_pixel_fraction,3/17);
  assert.ok(Math.abs(feature.properties.candidate_area_km2-3*pixelArea((16000+.5)/480))<1e-12);
  const metadata=habitatMetadata(species,[rule],changed)[0];
  assert.deepEqual(metadata.classes,[8]);assert.equal(metadata.water_distance_m,100);
  const allOff={...settings,excludedClasses:[6,8]};
  assert.equal(habitatMetadata(species,[rule],allOff)[0].evaluation,'excluded_landcover');
  assert.equal(geoFeature([10000,16000,1,flat],acceptedKeys(species,[rule],allOff),species,allOff,catalog),null);
});
