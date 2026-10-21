import {createDeliveryCache,validateQueryIndex} from './delivery.js';
import {QUERY_STRIDE} from './query-model.js';

export function validateQueryPack(value,entry,type,data,sourceManifestSHA256){
  if(value?.schema!==1||value.sourceManifestSHA256!==sourceManifestSHA256||JSON.stringify(value.habitats)!==JSON.stringify(entry.habitats)||!Array.isArray(value.signatures)||!value.signatures.length||value.signatures.length>24577||value.signatures.some(s=>!Array.isArray(s)||s.length!==4||s.some(n=>!Number.isSafeInteger(n)||n<0||n>=2**entry.habitats.length))||value.signatures[0].some(Boolean))throw new Error('条件別データの形式が不正です');
  const validKey=k=>Number.isSafeInteger(k)&&k>=QUERY_STRIDE&&k<value.signatures.length*QUERY_STRIDE&&k%16>0&&(data.schema===6||Math.floor(k%QUERY_STRIDE/16)<4);
  const validAreas=a=>a&&typeof a==='object'&&!Array.isArray(a)&&Object.keys(a).length<=1572864&&Object.entries(a).every(([k,v])=>/^(?:0|[1-9]\d{0,8})$/.test(k)&&validKey(Number(k))&&Number.isFinite(v)&&v>0&&v<1000000);
  if(type==='aggregate'){
    const r=value.aggregate;if(!r||!validAreas(r.areas)||!Number.isSafeInteger(r.meshes)||r.meshes<0||![r.total,r.missing,r.elevationMissing].every(v=>Number.isFinite(v)&&v>=0&&v<10000000)||r.missing>r.total||r.elevationMissing>r.total)throw new Error('範囲別集計が不正です');
  }else if(type==='summary'){
    for(const [name,source] of [['summary',data.summary],['regions',data.geography.regions]])if(!value[name]||Object.keys(value[name]).length!==Object.keys(source).length||Object.keys(source).some(id=>!validAreas(value[name][id])))throw new Error('条件別集計が不正です');
  }else if(!Array.isArray(value.cells)||value.cells.length>60000||value.cells.some(r=>!Array.isArray(r)||r.length!==6||!Number.isInteger(r[0])||r[0]<6400||r[0]>=18000||!Number.isInteger(r[1])||r[1]<9600||r[1]>=25000||!Number.isInteger(r[2])||r[2]<1||r[2]>47||!Number.isSafeInteger(r[3])||r[3]<0||r[3]&&data.geography.regions[r[3]]?.pref!==r[2]||!Array.isArray(r[4])||r[4].length!==16||r[4].some(n=>!Number.isSafeInteger(n)||n<0||n>100000000)||!Array.isArray(r[5])||r[5].length%2||r[5].length>3145728||r[5].some((n,i)=>i%2?!Number.isSafeInteger(n)||n<1||n>100000000:!validKey(n)||i>0&&n<=r[5][i-2])))throw new Error('条件別広域図が不正です');
  if(type==='map')for(const r of value.cells){const byClass=Array(16).fill(0);for(let i=0;i<r[5].length;i+=2)byClass[r[5][i]%16]+=r[5][i+1];if(byClass.some((n,c)=>n>r[4][c]))throw new Error('候補画素数が収録画素数を超えています');}
  return value;
}
export function createQueryDelivery(delivery,data,read,sourceManifestSHA256,verifiedCatalog=false){
  const cached=new Map(),pending=new Map(),indexes=new Map(),mapEntries=new Map();let size=0,pinned=new Set();
  for(const g of Object.values(delivery.groups)){mapEntries.set(g.map.file,g);for(const info of Object.values(g.prefectures||{}))mapEntries.set(info.file,g);}
  const empty={habitats:[],signatures:[[0,0,0,0]],summary:data.summary,regions:data.geography.regions};
  const groupFor=id=>delivery.species[id]??null;
  const fullPlan=group=>({key:'g:'+group,group,info:delivery.groups[group].summary,type:'summary'});
  const planFor=(id,settings={})=>{const group=groupFor(id);if(!group)return null;const g=delivery.groups[group];if(verifiedCatalog&&!settings.queryFull&&settings.region==='all'&&!settings.pref){if(settings.scope==='environment'&&g.national)return{key:'n:'+group,group,info:g.national,type:'aggregate',scope:'environment',id:null};if(settings.scope==='recorded'&&delivery.recorded?.[id])return{key:'r:'+id,group,info:delivery.recorded[id],type:'aggregate',scope:'recorded',id};}return fullPlan(group);};
  const effectivePlan=(id,settings)=>{const plan=planFor(id,settings);return plan&&!cached.has(plan.key)&&cached.has('g:'+plan.group)?fullPlan(plan.group):plan;};
  const summaryFor=(id,settings)=>{const plan=effectivePlan(id,settings);if(!plan)return empty;const entry=cached.get(plan.key);if(!entry)throw new Error('種のデータを読み込み中です');cached.delete(plan.key);cached.set(plan.key,entry);return entry.value;};
  const load=plan=>{
    if(cached.has(plan.key))return Promise.resolve();if(pending.has(plan.key))return pending.get(plan.key);
    const entry=delivery.groups[plan.group],promise=(async()=>{
      const value=validateQueryPack(await read(plan.info),entry,plan.type,data,sourceManifestSHA256);
      if(plan.type==='aggregate'&&(value.scope!==plan.scope||value.speciesId!==plan.id||value.catalogSHA256!==delivery.catalogSHA256))throw new Error('集計範囲と分類版が一致しません');
      // Pin the displayed species/comparisons; evict older, unused query summaries.
      while(size+plan.info.decodedBytes>128000000){const old=[...cached.keys()].find(k=>!pinned.has(k));if(!old)throw new Error('比較する種を減らして、もう一度お試しください。');size-=cached.get(old).bytes;cached.delete(old);}
      const typed=(row,areas)=>{const entries=Object.entries(areas);return{...row,areas:{},queryAreas:{keys:Uint32Array.from(entries,([k])=>Number(k)),values:Float64Array.from(entries,([,v])=>v)}};};
      if(plan.type==='aggregate')value.aggregate=typed(value.aggregate,value.aggregate.areas);
      else{value.summary=Object.fromEntries(Object.entries(data.summary).map(([id,row])=>[id,typed(row,value.summary[id])]));value.regions=Object.fromEntries(Object.entries(data.geography.regions).map(([id,row])=>[id,typed(row,value.regions[id])]));}
      cached.set(plan.key,{value,bytes:plan.info.decodedBytes});size+=plan.info.decodedBytes;
    })().finally(()=>pending.delete(plan.key));pending.set(plan.key,promise);return promise;
  };
  const ensureSpecies=async(ids,settings)=>{const chosen=new Map(ids.map(id=>effectivePlan(id,settings)).filter(Boolean).map(p=>[p.key,p])),costs=new Map();for(const p of chosen.values())if(!cached.has(p.key))costs.set(p.group,(costs.get(p.group)||0)+p.info.bytes);for(const [group,cost] of costs)if(cost>=delivery.groups[group].summary.bytes){for(const [key,p] of chosen)if(p.group===group)chosen.delete(key);chosen.set('g:'+group,fullPlan(group));}const plans=[...chosen.values()];pinned=new Set(chosen.keys());let i=0;async function worker(){while(i<plans.length)await load(plans[i++]);}await Promise.all([worker(),worker()]);};
  const maps=createDeliveryCache(async(info,signal)=>{
    const entry=mapEntries.get(info.file);
    return validateQueryPack(await read(info,signal),entry,'map',data,sourceManifestSHA256);
  });
  return {summaryFor,ensureSpecies,needsSpecies:(ids,settings)=>ids.some(id=>{const p=effectivePlan(id,settings);return p&&!cached.has(p.key);}),async mapFor(id,prefs,signal){const group=groupFor(id);if(!group)return null;const entry=delivery.groups[group];if(prefs.length>8||!entry.index&&!entry.prefectures)return maps(entry.map,signal);if(entry.index&&!indexes.has(group)){const parts=validateQueryIndex(await read(entry.index,signal),group,sourceManifestSHA256);indexes.set(group,parts);for(const info of Object.values(parts))mapEntries.set(info.file,entry);}const parts=indexes.get(group)||entry.prefectures,result=[];let i=0;async function worker(){while(i<prefs.length){signal?.throwIfAborted();const p=prefs[i++],value=await maps(parts[p],signal);if(value.cells.some(r=>r[2]!==p))throw new Error('広域図の県が一致しません');result.push(value);}}await Promise.all([worker(),worker()]);return result.length?{...result[0],cells:result.flatMap(r=>r.cells)}:null;}};
}
