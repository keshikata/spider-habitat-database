import {prefecturesFor,pixelArea,includedClasses,excludedClasses} from './model.js';
import {recordScope,scopedSummaries} from './record-geography.js';
export const SPATIAL_MODEL='spatial-exploration-1.3.0';
export const STRATA=1572864;
const maskCache=new Map(),baseCache=new Map(),rowCache=new WeakMap();
export function selectedRules(species,rules,settings){
  const ids=settings.habitats?.[species.id];
  return Array.isArray(ids)?rules.filter(r=>ids.includes(r.id)):rules;
}
export function habitatMetadata(species,rules,settings){
  return selectedRules(species,rules,settings).map(r=>{
    const usable=r.supported!==false,distance=usable&&settings.model!=='cover';
    return {id:r.id,label:r.label,classes:usable?includedClasses(settings.model==='cover'?(r.baseClasses??r.classes):r.classes,settings):[],excluded_landcover_classes:excludedClasses(settings.excludedClasses),water_distance_m:distance&&r.water?Number(settings.distance):null,coast_distance_m:distance&&r.coast?Number(settings.distance):null,built_distance_m:distance&&r.built?Number(settings.distance):null,forest_edge_distance_m:distance&&r.edge?Number(settings.distance):null,paddy_distance_m:distance&&r.rice?Number(settings.distance):null,river_distance_m:distance&&r.river?Number(settings.distance):null,vegetation_group:usable?r.vegetation||null:null,elevation_bands:usable&&settings.model==='elevation'?r.elevation:null,evaluation:r.publicationHold?.length?'publication_hold':!usable?'unavailable':!includedClasses(settings.model==='cover'?(r.baseClasses??r.classes):r.classes,settings).length?'excluded_landcover':r.proxy?'proxy':'calculated',unresolved:r.pending||[],limitations:r.limitations||[]};
  });
}
export function acceptedKeys(species,rules,settings){
  const active=selectedRules(species,rules,settings).filter(r=>r.supported!==false).map(r=>({...r,classes:includedClasses(r.classes,settings)}));
  const cover=includedClasses(rules.length?active.flatMap(r=>r.baseClasses??r.classes):species.classes,settings);
  const signature=JSON.stringify([settings.model,settings.distance,cover,active.map(r=>[r.classes,r.edge,r.rice,r.coast,r.water,r.built,r.elevation,r.river,r.vegetation])]);
  if(maskCache.has(signature))return maskCache.get(signature);
  const result=new Uint8Array(STRATA),limit=[100,250,500].indexOf(Number(settings.distance));
  if(limit<0)throw new Error('Invalid distance');
  for(let vegetation=0;vegetation<6;vegetation++)for(let river=0;river<4;river++){
    const eligible=active.filter(r=>(!r.river||river<=limit)&&(!r.vegetation||vegetation===r.vegetation));
    const baseKey=JSON.stringify([settings.model,limit,cover,eligible.map(r=>[r.classes,r.edge,r.rice,r.coast,r.water,r.built,r.elevation])]);
    let base=baseCache.get(baseKey);
    if(!base){
      base=new Uint8Array(65536);
      for(let key=0;key<65536;key++){
        const rice=key>>>14,edge=(key>>>12)%4,coast=(key>>>10)%4,c=(key>>>6)%16,h=(key>>>4)%4,w=(key>>>2)%4,b=key%4;
        if(c)base[key]=settings.model==='cover'?Number(cover.includes(c)):Number(eligible.some(r=>r.classes.includes(c)&&(!r.edge||edge<=limit)&&(!r.rice||rice<=limit)&&(!r.coast||coast<=limit)&&(!r.water||w<=limit)&&(!r.built||b<=limit)&&(settings.model!=='elevation'||r.elevation.includes(h))));
      }
      baseCache.set(baseKey,base);while(baseCache.size>128)baseCache.delete(baseCache.keys().next().value);
    }
    result.set(base,vegetation*262144+river*65536);
  }
  maskCache.set(signature,result);while(maskCache.size>24)maskCache.delete(maskCache.keys().next().value);
  return result;
}
export function effectiveSpecies(data,s,settings){
  const rules=selectedRules(s,data.rules[s.id]||[],settings);
  const available=[...new Set(rules.filter(r=>r.supported!==false).flatMap(r=>settings.model==='cover'?(r.baseClasses??r.classes):r.classes))].sort((a,b)=>a-b),classes=includedClasses(available,settings);
  const pending=[...new Set(rules.flatMap(r=>r.pending||[]))];
  if(settings.model!=='elevation'&&rules.some(r=>r.supported!==false&&r.elevation.length<4))pending.push('標高条件は未実装');
  if(settings.model==='cover'&&rules.some(r=>r.water))pending.push('水域への距離');
  if(settings.model==='cover'&&rules.some(r=>r.coast))pending.push('海岸線への距離');
  if(settings.model==='cover'&&rules.some(r=>r.built))pending.push('人工構造物への距離');
  return {...s,classes,publicationHoldCount:rules.filter(r=>r.publicationHold?.length).length,availableClassCount:available.length,pending:[...new Set(pending)],mappedEnvironmentCount:rules.filter(r=>r.supported!==false&&includedClasses(settings.model==='cover'?(r.baseClasses??r.classes):r.classes,settings).length).length,selectedEnvironmentCount:rules.length};
}
export function summarizeSpatial(catalog,data,s,settings){
  const prefs=prefecturesFor(catalog,settings.region,settings.pref,settings.scope,s),mask=acceptedKeys(s,data.rules[s.id]||[],settings),areas=Array(16).fill(0);
  let meshes=0,total=0,missing=0,elevationMissing=0;
  const geography=recordScope(data.geography,s,prefs,settings.scope),rows=scopedSummaries(data,geography);
  for(const row of rows){
    let cached=rowCache.get(row);
    if(!cached){const entries=Object.entries(row.areas);cached={keys:Uint32Array.from(entries,([k])=>Number(k)),values:Float64Array.from(entries,([,v])=>v),total:0,missing:0,elevationMissing:0};for(let i=0;i<cached.keys.length;i++){const k=cached.keys[i],a=cached.values[i];cached.total+=a;if(k%1024<64)cached.missing+=a;if(Math.floor(k/16)%4===3)cached.elevationMissing+=a;}rowCache.set(row,cached);}
    meshes+=row.meshes;total+=cached.total;missing+=cached.missing;elevationMissing+=cached.elevationMissing;
    for(let i=0;i<cached.keys.length;i++){const k=cached.keys[i];if(mask[k])areas[Math.floor(k%1024/64)]+=cached.values[i];}
  }
  const mapped=mask.some(Boolean);
  const empty=Array.isArray(settings.habitats?.[s.id])&&!settings.habitats[s.id].length;
  const noLandcover=!mapped&&selectedRules(s,data.rules[s.id]||[],settings).some(r=>r.supported!==false&&(settings.model==='cover'?(r.baseClasses??r.classes):r.classes).length)&&excludedClasses(settings.excludedClasses).length>0;
  const excludedHabitats=selectedRules(s,data.rules[s.id]||[],settings).filter(r=>r.supported===false).map(r=>r.label);
  return {area:mapped&&prefs.length&&rows.length?areas.reduce((a,b)=>a+b,0):null,status:empty?'no_environment':noLandcover?'no_landcover':!mapped?'unmapped':!prefs.length?'no_scope':!rows.length?'no_geography':geography.unresolved.length?'partial_geography':excludedHabitats.length?'partial_environment':'evaluated',excludedHabitats,geography,areas,prefs,meshes,total,missing,elevationMissing,records:prefs.reduce((n,p)=>n+(Number(s.records[p])||0),0)};
}
export function evaluateStrata(flat,mask){
  let total=0,matching=0;const counts=Array(16).fill(0),matched=Array(16).fill(0);
  for(let i=0;i<flat.length;i+=2){const k=flat[i],n=flat[i+1],c=Math.floor(k%1024/64);total+=n;counts[c]+=n;if(mask[k]){matching+=n;matched[c]+=n;}}
  return {counts,matched,total,matching,ratio:total?matching/total:0};
}
export function geoFeature(row,mask,s,settings,catalog){
  const [x,y,p,flat]=row,v=evaluateStrata(flat,mask);if(!v.matching)return null;
  const west=100+x/320,east=100+(x+1)/320,south=y/480,north=(y+1)/480;
  return {type:'Feature',geometry:{type:'Polygon',coordinates:[[[west,south],[east,south],[east,north],[west,north],[west,south]]]},properties:{species_id:s.id,japanese_name:s.name,scientific_name:s.scientific,prefecture:catalog.prefectures[p-1],grid:'quarter_third_order_approximately_250m',candidate_area_km2:v.matching*pixelArea((south+north)/2),matching_pixel_fraction:v.ratio,model:SPATIAL_MODEL,conditions:settings.model,excluded_landcover_classes:excludedClasses(settings.excludedClasses),habitat_ids:settings.habitats?.[s.id]??null,distance_m:Number(settings.distance),elevation_filter:settings.model==='elevation',scope:settings.scope,landcover:catalog.landcover,accessed:catalog.date,interpretation:'Grid containing candidate pixels; polygon is not an occupied habitat boundary.'}};
}
