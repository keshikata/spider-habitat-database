import {prefecturesFor,pixelArea} from './model.js';
import {recordScope,scopedSummaries} from './record-geography.js';
export const SPATIAL_MODEL='spatial-exploration-1.2.0';
export const STRATA=65536;
export function selectedRules(species,rules,settings){
  const ids=settings.habitats?.[species.id];
  return Array.isArray(ids)?rules.filter(r=>ids.includes(r.id)):rules;
}
export function habitatMetadata(species,rules,settings){
  return selectedRules(species,rules,settings).map(r=>({id:r.id,label:r.label,classes:r.supported===false?[]:settings.model==='cover'?(r.baseClasses??r.classes):r.classes,water_distance_m:settings.model!=='cover'&&r.water?Number(settings.distance):null,coast_distance_m:settings.model!=='cover'&&r.coast?Number(settings.distance):null,built_distance_m:settings.model!=='cover'&&r.built?Number(settings.distance):null,forest_edge_distance_m:settings.model!=='cover'&&r.edge?Number(settings.distance):null,paddy_distance_m:settings.model!=='cover'&&r.rice?Number(settings.distance):null,elevation_bands:settings.model==='elevation'?r.elevation:null,evaluation:r.supported===false?'unavailable':r.proxy?'proxy':'calculated',unresolved:r.pending||[],limitations:r.limitations||[]}));
}
export function acceptedKeys(species,rules,settings){
  const active=selectedRules(species,rules,settings).filter(r=>r.supported!==false);
  const cover=Array.isArray(settings.habitats?.[species.id])?active.flatMap(r=>r.baseClasses??r.classes):species.classes;
  const result=new Uint8Array(STRATA),limit=[100,250,500].indexOf(Number(settings.distance));
  if(limit<0)throw new Error('Invalid distance');
  for(let key=0;key<STRATA;key++){
    const rice=Math.floor(key/16384)%4,edge=Math.floor(key/4096)%4,coast=Math.floor(key/1024)%4,c=Math.floor(key%1024/64),h=Math.floor(key/16)%4,w=Math.floor(key/4)%4,b=key%4;
    if(!c)continue;
    result[key]=settings.model==='cover'?Number(cover.includes(c)):Number(active.some(r=>r.classes.includes(c)&&(!r.edge||edge<=limit)&&(!r.rice||rice<=limit)&&(!r.coast||coast<=limit)&&(!r.water||w<=limit)&&(!r.built||b<=limit)&&(settings.model!=='elevation'||r.elevation.includes(h))));
  }
  return result;
}
export function effectiveSpecies(data,s,settings){
  const rules=selectedRules(s,data.rules[s.id]||[],settings);
  const classes=[...new Set(rules.filter(r=>r.supported!==false).flatMap(r=>settings.model==='cover'?(r.baseClasses??r.classes):r.classes))].sort((a,b)=>a-b);
  const pending=[...new Set(rules.flatMap(r=>r.pending||[]))];
  if(settings.model!=='elevation'&&rules.some(r=>r.supported!==false&&r.elevation.length<4))pending.push('標高条件は未適用');
  if(settings.model==='cover'&&rules.some(r=>r.water))pending.push('水域への距離');
  if(settings.model==='cover'&&rules.some(r=>r.coast))pending.push('海岸線への距離');
  if(settings.model==='cover'&&rules.some(r=>r.built))pending.push('人工構造物への距離');
  return {...s,classes,pending:[...new Set(pending)],mappedEnvironmentCount:rules.filter(r=>r.supported!==false&&(settings.model==='cover'?(r.baseClasses??r.classes):r.classes).length).length,selectedEnvironmentCount:rules.length};
}
export function summarizeSpatial(catalog,data,s,settings){
  const prefs=prefecturesFor(catalog,settings.region,settings.pref,settings.scope,s),mask=acceptedKeys(s,data.rules[s.id]||[],settings),areas=Array(16).fill(0);
  let meshes=0,total=0,missing=0,elevationMissing=0;
  const geography=recordScope(data.geography,s,prefs,settings.scope),rows=scopedSummaries(data,geography);
  for(const row of rows){meshes+=row.meshes;for(const [key,a] of Object.entries(row.areas)){const k=Number(key);total+=a;if(k%1024<64)missing+=a;if(Math.floor(k/16)%4===3)elevationMissing+=a;if(mask[k])areas[Math.floor(k%1024/64)]+=a;}}
  const mapped=mask.some(Boolean);
  const empty=Array.isArray(settings.habitats?.[s.id])&&!settings.habitats[s.id].length;
  const excludedHabitats=selectedRules(s,data.rules[s.id]||[],settings).filter(r=>r.supported===false).map(r=>r.label);
  return {area:mapped&&prefs.length&&rows.length?areas.reduce((a,b)=>a+b,0):null,status:empty?'no_environment':!mapped?'unmapped':!prefs.length?'no_scope':!rows.length?'no_geography':geography.unresolved.length?'partial_geography':excludedHabitats.length?'partial_environment':'evaluated',excludedHabitats,geography,areas,prefs,meshes,total,missing,elevationMissing,records:prefs.reduce((n,p)=>n+(Number(s.records[p])||0),0)};
}
export function evaluateStrata(flat,mask){
  let total=0,matching=0;const counts=Array(16).fill(0),matched=Array(16).fill(0);
  for(let i=0;i<flat.length;i+=2){const k=flat[i],n=flat[i+1],c=Math.floor(k%1024/64);total+=n;counts[c]+=n;if(mask[k]){matching+=n;matched[c]+=n;}}
  return {counts,matched,total,matching,ratio:total?matching/total:0};
}
export function geoFeature(row,mask,s,settings,catalog){
  const [x,y,p,flat]=row,v=evaluateStrata(flat,mask);if(!v.matching)return null;
  const west=100+x/320,east=100+(x+1)/320,south=y/480,north=(y+1)/480;
  return {type:'Feature',geometry:{type:'Polygon',coordinates:[[[west,south],[east,south],[east,north],[west,north],[west,south]]]},properties:{species_id:s.id,japanese_name:s.name,scientific_name:s.scientific,prefecture:catalog.prefectures[p-1],grid:'quarter_third_order_approximately_250m',candidate_area_km2:v.matching*pixelArea((south+north)/2),matching_pixel_fraction:v.ratio,model:SPATIAL_MODEL,conditions:settings.model,habitat_ids:settings.habitats?.[s.id]??null,distance_m:Number(settings.distance),elevation_filter:settings.model==='elevation',scope:settings.scope,landcover:catalog.landcover,accessed:catalog.date,interpretation:'Grid containing candidate pixels; polygon is not an occupied habitat boundary.'}};
}
