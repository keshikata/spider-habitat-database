import {excludedClasses} from './model.js';
import {readCompressed} from './map.js';
import {SPATIAL_MODEL,STRATA,acceptedKeys,evaluateStrata,geoFeature,habitatMetadata} from './spatial-model.js';
import {recordScope,includesRecordRow,attachRegions,geographicNote} from './record-geography.js';
import {validateDelivery,createDeliveryCache} from './delivery.js';
const base='./preview-data/';
async function json(name,limit,hash=false){
  const r=await fetch(base+name,{credentials:'same-origin'});if(r.status===404)return null;if(!r.ok)throw new Error('追加データを取得できません');
  const reader=r.body.getReader();let length=0;const chunks=[];
  try{while(true){const {done,value}=await reader.read();if(done)break;length+=value.length;if(length>limit)throw new Error('追加データが上限を超えています');chunks.push(value);}}finally{await reader.cancel();}
  const raw=await new Blob(chunks).arrayBuffer(),value=JSON.parse(new TextDecoder().decode(raw));
  return hash?{value,sha256:Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',raw)),v=>v.toString(16).padStart(2,'0')).join('')}:value;
}
const validStrata=f=>Array.isArray(f)&&f.length%2===0&&f.length<=STRATA*2&&f.every((v,i)=>Number.isSafeInteger(v)&&v>=0&&v<=(i%2?100000000:STRATA-1))&&f.every((v,i)=>i%2||i===0||v>f[i-2]);
const validAreas=a=>a&&typeof a==='object'&&!Array.isArray(a)&&Object.keys(a).length<=STRATA&&Object.entries(a).every(([k,v])=>/^(?:0|[1-9]\d{0,6})$/.test(k)&&Number(k)<STRATA&&Number.isFinite(v)&&v>0&&v<1000000);
const validRows=(d,info,step)=>d?.schema===5&&d.step===step&&Array.isArray(d.cells)&&d.cells.length===info.cells&&d.cells.length<=20000&&d.cells.every(r=>Array.isArray(r)&&r.length===4&&Number.isInteger(r[0])&&r[0]>=6400&&r[0]<18000&&Number.isInteger(r[1])&&r[1]>=9600&&r[1]<25000&&Number.isInteger(r[2])&&r[2]>=1&&r[2]<=47&&validStrata(r[3]));
function validInfo(info,prefix){const overview=prefix==='overview';return info&&/^[a-f0-9]{64}$/.test(info.sha256)&&info.file===prefix+'-'+info.sha256.slice(0,12)+'.json.gz'&&Number.isSafeInteger(info.bytes)&&info.bytes>0&&info.bytes<=(overview?48000000:16000000)&&Number.isSafeInteger(info.decodedBytes)&&info.decodedBytes>0&&info.decodedBytes<=(overview?128000000:32000000)&&Number.isInteger(info.cells)&&info.cells>0&&info.cells<=20000;}
const intersects=(t,b)=>100+t.bounds[2]/320>=b.west&&100+t.bounds[0]/320<=b.east&&t.bounds[3]/480>=b.south&&t.bounds[1]/480<=b.north;
export async function loadSpatial(){
  const deliveryInfo=await json('delivery-manifest.json',40000),delivery=deliveryInfo?validateDelivery(deliveryInfo):null;
  const data=delivery?await readCompressed(base+delivery.summary.file,delivery.summary):await json('summary.json',64000000);if(!data)return null;
  if(data.schema!==5||data.model!==SPATIAL_MODEL||data.localOnly!==true||Object.keys(data.summary||{}).length!==47)throw new Error('追加データの形式が不正です');
  for(let p=1;p<=47;p++){const r=data.summary[p];if(!r||!validAreas(r.areas)||!Number.isSafeInteger(r.meshes)||r.meshes<0)throw new Error('集計データが不正です');}
  for(const [id,rules] of Object.entries(data.rules||{})){if(!/^\d{1,5}$/.test(id)||!Array.isArray(rules)||rules.length>100)throw new Error('環境条件が不正です');for(const r of rules)if(!/^H\d{3,4}$/.test(r.id)||typeof r.label!=='string'||r.label.length>500||!Array.isArray(r.baseClasses)||r.baseClasses.some(c=>!Number.isInteger(c)||c<1||c>15)||!Array.isArray(r.classes)||r.classes.some(c=>!Number.isInteger(c)||c<1||c>15)||!Array.isArray(r.elevation)||r.elevation.some(c=>!Number.isInteger(c)||c<0||c>3)||typeof r.supported!=='boolean'||typeof r.edge!=='boolean'||typeof r.rice!=='boolean'||typeof r.river!=='boolean'||!Number.isInteger(r.vegetation)||r.vegetation<0||r.vegetation>5||!Array.isArray(r.limitations)||r.limitations.some(v=>typeof v!=='string'||v.length>500)||typeof r.coast!=='boolean'||typeof r.water!=='boolean'||typeof r.built!=='boolean'||!Array.isArray(r.pending)||r.pending.some(p=>typeof p!=='string'))throw new Error('環境条件が不正です');}
  const geographyInfo=delivery?{...delivery.geography,schema:1,sourceManifestSHA256:delivery.sourceManifestSHA256}:await json('geography-manifest.json',2000);
  if(geographyInfo){
    if(geographyInfo.schema!==1||!/^[a-f0-9]{64}$/.test(geographyInfo.sha256)||!/^[a-f0-9]{64}$/.test(geographyInfo.sourceManifestSHA256))throw new Error('地域データの情報が不正です');
    const g=await readCompressed(base+(delivery?delivery.geography.file:'geography.json.gz'),geographyInfo);
    if(delivery)g.overview=[];
    if(g.schema!==1||g.sourceManifestSHA256!==geographyInfo.sourceManifestSHA256||!g.regions||Object.keys(g.regions).length>1000||!Array.isArray(g.overview)||g.overview.length>30000)throw new Error('地域データが不正です');
    for(const [id,r] of Object.entries(g.regions))if(!/^\d{1,6}$/.test(id)||!Number.isInteger(r.pref)||r.pref<1||r.pref>47||!validAreas(r.areas)||!Number.isSafeInteger(r.meshes)||r.meshes<0||r.bounds?.length!==4||r.bounds.some(v=>!Number.isFinite(v))||r.bounds[0]<120||r.bounds[2]>155||r.bounds[1]<20||r.bounds[3]>46)throw new Error('地域集計が不正です');
    if(g.overview.some(r=>r.length!==5||!Number.isInteger(r[0])||!Number.isInteger(r[1])||!g.regions[r[4]]||g.regions[r[4]].pref!==r[2]||!validStrata(r[3])))throw new Error('地域の広域図が不正です');
    data.geography=g;
  }
  let manifest,overview;const cache=new Map();
  const coarseRows=createDeliveryCache(async(info,signal)=>{
    const d=await readCompressed(base+info.file,{...info,signal});
    if(d?.schema!==5||d.step!==64||!Array.isArray(d.cells)||d.cells.length!==info.cells||d.cells.some(r=>!Array.isArray(r)||![4,5].includes(r.length)||!Number.isInteger(r[0])||r[0]<6400||r[0]>=18000||!Number.isInteger(r[1])||r[1]<9600||r[1]>=25000||!Number.isInteger(r[2])||r[2]<1||r[2]>47||!validStrata(r[3])||(r.length===5&&data.geography?.regions[r[4]]?.pref!==r[2])))throw new Error('地域の広域図が不正です');
    return d.cells;
  });
  async function prepare(signal){
    if(!manifest){const loaded=await json('manifest.json',3000000,true),next=loaded?.value;if(geographyInfo&&loaded?.sha256!==geographyInfo.sourceManifestSHA256)throw new Error('地域と地図データの版が一致しません');if(next?.schema!==5||next.model!==SPATIAL_MODEL||!Array.isArray(next.tiles)||next.tiles.length>5000||!validInfo(next.overview,'overview'))throw new Error('追加地図の形式が不正です');
      const ids=new Set();for(const t of next.tiles){if(!/^(?:hokkaido|tohoku|kanto|chubu|kinki|chugoku|shikoku|kyushu|okinawa)-\d{2,3}-\d{2,3}$/.test(t.id)||ids.has(t.id)||!validInfo(t,t.id)||!Array.isArray(t.bounds)||t.bounds.length!==4||t.bounds.some(v=>!Number.isInteger(v)||v<0||v>25000)||t.bounds[0]>=t.bounds[2]||t.bounds[1]>=t.bounds[3]||!Array.isArray(t.prefs)||t.prefs.some(p=>!Number.isInteger(p)||p<1||p>47))throw new Error('追加地図の範囲が不正です');ids.add(t.id);}manifest=next;
    }
  }
  async function rows(t,signal){let d=cache.get(t.id);if(!d){d=await readCompressed(base+t.file,{...t,signal});if(!validRows(d,t,1))throw new Error('250mデータが不正です');if(data.geography){d.cells=attachRegions(d.cells,data.geography.tiles[t.id]);if(d.cells.some(r=>r[4]&&data.geography.regions[r[4]]?.pref!==r[2]))throw new Error('地域と県の対応が不正です');}signal?.throwIfAborted();cache.set(t.id,d);while(cache.size>8)cache.delete(cache.keys().next().value);}return d.cells;}
  function converted(rows,prefs,mask,step){const set=new Set(prefs),groups=new Map();for(const row of rows){const [x,y,p,flat]=row;if(!set.has(p))continue;const v=evaluateStrata(flat,mask),key=x+','+y;const old=groups.get(key);if(old){old.matching+=v.matching;old.total+=v.total;if(!old.prefs.includes(p))old.prefs.push(p);for(let c=0;c<16;c++)old.counts[c]+=v.counts[c];}else groups.set(key,{x:x/4,y:y/4,west:100+x/320,east:100+(x+step)/320,south:y/480,north:(y+step)/480,counts:v.counts,matching:v.matching,total:v.total,prefs:[p]});}return [...groups.values()].map(cell=>({...cell,prefs:cell.prefs.sort((a,b)=>a-b)}));}
  async function mapCells({bounds,zoom,prefs,species,settings,signal}){
    await prepare(signal);const mask=acceptedKeys(species,data.rules[species.id]||[],settings),scope=recordScope(data.geography,species,prefs,settings.scope);
    const needed=manifest.tiles.filter(t=>t.prefs.some(p=>prefs.includes(p))&&intersects(t,bounds));
    if((zoom<11&&!(zoom>=8&&scope.regionIds.size&&!scope.fullPrefs.size))||needed.length>24){
      let source=[];
      if(delivery){
        const jobs=[...scope.fullPrefs].map(p=>({info:delivery.prefectures[p],pref:p,regional:false}));
        const regionPrefs=new Set([...scope.regionIds].map(id=>data.geography.regions[id].pref));
        for(const p of regionPrefs)jobs.push({info:delivery.regions[p],pref:p,regional:true});
        let i=0;async function worker(){while(i<jobs.length){signal?.throwIfAborted();const job=jobs[i++],rows=await coarseRows(job.info,signal);if(rows.some(r=>r[2]!==job.pref||r.length!==(job.regional?5:4)))throw new Error('広域図の県が一致しません');source.push(...rows.filter(r=>!job.regional||scope.regionIds.has(String(r[4]))));}}
        await Promise.all([worker(),worker()]);
      }else{
        if(!overview){const next=await readCompressed(base+manifest.overview.file,{...manifest.overview,signal});if(!validRows(next,manifest.overview,64))throw new Error('広域データが不正です');overview=next;}
        source=overview.cells.filter(r=>scope.fullPrefs.has(r[2])).concat((data.geography?.overview||[]).filter(r=>scope.regionIds.has(String(r[4]))));
      }
      return {cells:converted(source,prefs,mask,64),step:16,detail:false};
    }
    const all=[];let i=0;async function worker(){while(i<needed.length){if(signal.aborted)return;for(const r of await rows(needed[i++],signal))all.push(r);}}await Promise.all([worker(),worker()]);
    return {cells:converted(all.filter(r=>includesRecordRow(scope,r)),prefs,mask,1),step:.25,detail:true};
  }
  async function exportGeoJSON({prefs,bounds,species,settings,catalog,onProgress,signal}){
    await prepare(signal);const scope=recordScope(data.geography,species,prefs,settings.scope),needed=manifest.tiles.filter(t=>t.prefs.some(p=>prefs.includes(p))&&intersects(t,bounds)),mask=acceptedKeys(species,data.rules[species.id]||[],settings),features=[];
    if(needed.reduce((n,t)=>n+t.cells,0)>150000)throw new Error('範囲が広いため、地図を拡大してから保存してください。');
    for(let i=0;i<needed.length;i++){if(signal.aborted)throw new DOMException('Cancelled','AbortError');for(const row of await rows(needed[i],signal)){if(!includesRecordRow(scope,row)||!intersects({bounds:[row[0],row[1],row[0]+1,row[1]+1]},bounds))continue;const f=geoFeature(row,mask,species,settings,catalog);if(f){f.properties.record_region=row[4]?data.geography.regions[row[4]].names.join(' / '):null;features.push(f);}}if(features.length>50000)throw new Error('件数が多いため出力できません。対象条件を絞ってください。');onProgress(i+1,needed.length);await new Promise(r=>setTimeout(r,0));}
    return {type:'FeatureCollection',name:'spider-habitat-candidates',metadata:{title:'日本産クモ類 生息候補地データベース',model:SPATIAL_MODEL,local_research_preview:true,record_geography:geographicNote(data.geography,scope),unresolved_islands:scope.unresolved,excluded_landcover_classes:excludedClasses(settings.excludedClasses),selected_habitats:habitatMetadata(species,data.rules[species.id]||[],settings),habitat_combination:'OR between habitats; AND within each habitat',elevation:settings.model==='elevation',crs:'OGC:CRS84 (longitude, latitude)',source:(settings.model==='elevation'?'国土地理院 基盤地図情報DEM10m; ':'')+'JAXA HRLULC 2024JPN_v25.04; 国土数値情報 行政区域2025・海岸線2006・河川2006～2009（非商用）を本サイトが加工; 環境省 現存植生図2024（CC BY 4.0）を本サイトが加工; Japan Spider Catalog (2026), ver.2.0.7, accessed 2026-10-08; 小野展嗣・緒方清人 (2018)',license:'JAXA利用条件 / 行政区域 CC BY 4.0 / 海岸線2006・河川2006～2009 国土数値情報旧利用約款（非商用） / 植生 CC BY 4.0 / 分類対応情報 CC BY-NC-SA 4.0',warning:(settings.model==='elevation'?'標高を含む結果の一般公開条件は未確認。':'')+'区画全体が生息地という意味ではありません。'},features};
  }
  function scopeBounds(species,prefs,settings){
    const scope=recordScope(data.geography,species,prefs,settings.scope);
    const bs=[...scope.regionIds].map(id=>data.geography.regions[id].bounds);
    for(const tile of manifest.tiles)if(tile.prefs.some(p=>scope.fullPrefs.has(p))){const b=tile.bounds;bs.push([100+b[0]/320,b[1]/480,100+b[2]/320,b[3]/480]);}
    return bs.length?[Math.min(...bs.map(b=>b[0])),Math.min(...bs.map(b=>b[1])),Math.max(...bs.map(b=>b[2])),Math.max(...bs.map(b=>b[3]))]:null;
  }
  await prepare();
  return {data,mapCells,exportGeoJSON,scopeBounds};
}
