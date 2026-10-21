import {createHash} from 'node:crypto';
import {queryCompiler} from '../site/query-model.js';
import {ELEVATION_STRIDE} from '../site/elevation.js';
import {prefecturesFor} from '../site/model.js';
import {recordScope} from '../site/record-geography.js';

export function addQueryAggregates(query,catalog,read,pack,sourceManifestSHA256){
  if(catalog.prefectures?.length!==47)throw new Error('Query aggregates need the complete catalog');
  const metadata=read(query.metadata),geography=read(query.geography),byId=new Map(catalog.species.map(s=>[s.id,s]));
  query.catalogSHA256=createHash('sha256').update(JSON.stringify(catalog)).digest('hex');query.recorded={};
  const aggregate=(value,prefs,scope)=>{
    const rows=[...scope.fullPrefs].map(p=>({...metadata.summary[p],areas:value.summary[p]})).concat([...scope.regionIds].map(id=>({...geography.regions[id],areas:value.regions[id]}))),areas=new Map();let meshes=0,total=0,missing=0,elevationMissing=0;
    for(const row of rows){meshes+=row.meshes;total+=row.total;missing+=row.missing;elevationMissing+=row.elevationMissing;for(const [key,area] of Object.entries(row.areas))areas.set(Number(key),(areas.get(Number(key))||0)+area);}
    return {meshes,total,missing,elevationMissing,areas:Object.fromEntries([...areas].sort((a,b)=>a[0]-b[0]))};
  };
  for(const [group,entry] of Object.entries(query.groups)){
    const value=read(entry.summary),header={schema:1,sourceManifestSHA256,habitats:value.habitats,signatures:value.signatures,catalogSHA256:query.catalogSHA256};
    const prefs=Array.from({length:47},(_,i)=>i+1);
    entry.national=pack('query-national-'+group,{...header,scope:'environment',speciesId:null,aggregate:aggregate(value,prefs,{fullPrefs:new Set(prefs),regionIds:new Set()})});
    for(const [id,g] of Object.entries(query.species))if(g===group){const species=byId.get(id);if(!species)throw new Error('Query species missing from catalog');const recorded=prefecturesFor(catalog,'all','','recorded',species),scope=recordScope(geography,species,recorded,'recorded');query.recorded[id]=pack('query-record-'+id,{...header,scope:'recorded',speciesId:id,aggregate:aggregate(value,recorded,scope)});}
  }
  return query;
}

export function packQueryPrefectures(cells,header,group,pack){
  const partitions=Array.from({length:47},()=>[]);for(const r of cells)partitions[r[2]-1].push(r);
  return Object.fromEntries(partitions.map((rows,i)=>[i+1,pack('query-pref-'+group+'-'+(i+1),{...header,cells:rows})]));
}

export function packQueryDelivery(data,geography,ordinary,regional,sourceManifestSHA256,pack,onProgress=()=>{}){
  const elevation=data.schema===6;
  const totals=row=>{let total=0,missing=0,elevationMissing=0;for(const [k,v] of Object.entries(row.areas)){const key=Number(k);total+=v;if(key%1024<64)missing+=v;if(elevation?Math.floor(key/ELEVATION_STRIDE)===31:(key>>>4&3)===3)elevationMissing+=v;}return {...row,areas:{},total,missing,elevationMissing};};
  const {summary,...metadata}=data;
  const {tiles,overview,...geo}=geography;
  const query={schema:1,metadata:pack('query-metadata',{...metadata,summary:Object.fromEntries(Object.entries(summary).map(([p,r])=>[p,totals(r)]))}),geography:pack('query-geography',{...geo,regions:Object.fromEntries(Object.entries(geo.regions).map(([id,r])=>[id,totals(r)])),tiles:{}}),runs:pack('query-runs',{schema:1,sourceManifestSHA256,tiles}),species:{},groups:{}};
  const groups=new Map();
  for(const [id,rules] of Object.entries(data.rules)){
    const active=rules.filter(r=>r.supported).slice().sort((a,b)=>a.id.localeCompare(b.id));
    if(!active.length){query.species[id]=null;continue;}
    const signature=JSON.stringify(active.map(({label,pending,limitations,...r})=>r)),group=createHash('sha256').update(signature).digest('hex').slice(0,12);
    query.species[id]=group;if(!groups.has(group))groups.set(group,active);
  }
  const preparedRows=rows=>rows.map(r=>{const counts=Array(16).fill(0);for(let i=0;i<r[3].length;i+=2)counts[r[3][i]>>>6&15]+=r[3][i+1];return{row:r,counts};});
  const ordinaryRows=preparedRows(ordinary),regionalRows=preparedRows(regional);
  let completed=0;
  for(const [group,rules] of groups){
    const compiler=queryCompiler(rules);
    const areas=row=>{const result=new Map();for(const [raw,value] of Object.entries(row.areas)){const key=compiler.key(Number(raw),elevation);if(key)result.set(key,(result.get(key)||0)+value);}return Object.fromEntries([...result].sort((a,b)=>a[0]-b[0]));};
    const rows=(source,regional)=>source.map(({row:r,counts})=>{const result=new Map();for(let i=0;i<r[3].length;i+=2){const key=compiler.key(r[3][i],elevation);if(key)result.set(key,(result.get(key)||0)+r[3][i+1]);}return[r[0],r[1],r[2],regional?r[4]:0,counts,[...result].sort((a,b)=>a[0]-b[0]).flat()];});
    const header={schema:1,sourceManifestSHA256,habitats:compiler.habitats,signatures:compiler.signatures};
    const summaryInfo=pack('query-summary-'+group,{...header,summary:Object.fromEntries(Object.entries(summary).map(([p,r])=>[p,areas(r)])),regions:Object.fromEntries(Object.entries(geo.regions).map(([id,r])=>[id,areas(r)]))});
    const cells=[...rows(ordinaryRows,false),...rows(regionalRows,true)],mapInfo=pack('query-map-'+group,{...header,cells});
    const prefectures=packQueryPrefectures(cells,header,group,pack);
    query.groups[group]={habitats:compiler.habitats,summary:summaryInfo,map:mapInfo,index:pack('query-index-'+group,{schema:1,sourceManifestSHA256,group,prefectures})};
    onProgress({group,completed:++completed,total:groups.size,summaryBytes:summaryInfo.bytes,mapBytes:mapInfo.bytes});
  }
  return query;
}
