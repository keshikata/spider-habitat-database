// A delivery manifest is data, never authority to fetch an arbitrary URL.
export function validDeliveryInfo(info,prefix){
  return Boolean(info&&/^[a-f0-9]{64}$/.test(info.sha256)&&info.file===`${prefix}-${info.sha256.slice(0,12)}.json.gz`&&Number.isSafeInteger(info.bytes)&&info.bytes>0&&info.bytes<=26214400&&Number.isSafeInteger(info.decodedBytes)&&info.decodedBytes>0&&info.decodedBytes<=64000000);
}
export function validateDelivery(value){
  if(value?.schema!==1||!/^[a-f0-9]{64}$/.test(value.sourceManifestSHA256)||!validDeliveryInfo(value.summary,'summary')||!validDeliveryInfo(value.geography,'geography-index'))throw new Error('配信データの情報が不正です');
  for(const [group,prefix] of [['prefectures','map-pref-'],['regions','map-region-']]){
    if(Object.keys(value[group]||{}).length!==47)throw new Error('配信地域の情報が不正です');
    for(let p=1;p<=47;p++){const info=value[group][p];if(!validDeliveryInfo(info,prefix+p)||!Number.isInteger(info.cells)||info.cells<0||info.cells>20000)throw new Error('配信区画の情報が不正です');}
  }
  if(value.query){
    const q=value.query;
    if(q.schema!==1||!validDeliveryInfo(q.metadata,'query-metadata')||!validDeliveryInfo(q.geography,'query-geography')||!validDeliveryInfo(q.runs,'query-runs')||!q.groups||Object.keys(q.groups).length>1000||!q.species||Object.keys(q.species).length>10000)throw new Error('条件別配信の情報が不正です');
    for(const [id,g] of Object.entries(q.groups))if(!/^[a-f0-9]{12}$/.test(id)||!Array.isArray(g.habitats)||!g.habitats.length||g.habitats.length>30||new Set(g.habitats).size!==g.habitats.length||g.habitats.some(h=>!/^H\d{3,4}$/.test(h))||!validDeliveryInfo(g.summary,'query-summary-'+id)||!validDeliveryInfo(g.map,'query-map-'+id))throw new Error('条件別ファイルが不正です');
    for(const [id,g] of Object.entries(q.groups))if(g.prefectures&&(Object.keys(g.prefectures).length!==47||Array.from({length:47},(_,i)=>i+1).some(p=>!validDeliveryInfo(g.prefectures[p],'query-pref-'+id+'-'+p))))throw new Error('条件別の県ファイルが不正です');
    for(const [id,g] of Object.entries(q.groups))if(g.index&&!validDeliveryInfo(g.index,'query-index-'+id))throw new Error('県別配信の索引が不正です');
    if(q.catalogSHA256){if(!/^[a-f0-9]{64}$/.test(q.catalogSHA256)||!q.recorded||Object.keys(q.recorded).length>10000)throw new Error('集計の分類版が不正です');for(const [id,g] of Object.entries(q.groups))if(!validDeliveryInfo(g.national,'query-national-'+id))throw new Error('全国集計が不正です');for(const [id,info] of Object.entries(q.recorded))if(!/^\d{1,5}$/.test(id)||!q.species[id]||!validDeliveryInfo(info,'query-record-'+id))throw new Error('記録範囲の集計が不正です');}
    for(const [id,g] of Object.entries(q.species))if(!/^\d{1,5}$/.test(id)||g!==null&&!Object.hasOwn(q.groups,g))throw new Error('種の配信対応が不正です');
  }
  return value;
}
export function validateQueryIndex(value,id,sourceManifestSHA256){if(value?.schema!==1||value.group!==id||value.sourceManifestSHA256!==sourceManifestSHA256||Object.keys(value.prefectures||{}).length!==47||Array.from({length:47},(_,i)=>i+1).some(p=>!validDeliveryInfo(value.prefectures[p],'query-pref-'+id+'-'+p)))throw new Error('県別配信の索引が不正です');return value.prefectures;}
export function deliveryAssets(d,read){return[d.summary,d.geography,...Object.values(d.prefectures),...Object.values(d.regions),...(d.query?[d.query.metadata,d.query.geography,d.query.runs,...Object.values(d.query.recorded||{}),...Object.entries(d.query.groups).flatMap(([id,g])=>[g.summary,g.map,...(g.national?[g.national]:[]),...(g.index?[g.index,...Object.values(validateQueryIndex(read(g.index),id,d.sourceManifestSHA256))]:Object.values(g.prefectures||{}))])]:[])];}

export function createDeliveryCache(read,maxBytes=48000000){
  const cache=new Map();let size=0;
  return async(info,signal)=>{
    signal?.throwIfAborted();
    if(cache.has(info.file)){const entry=cache.get(info.file);cache.delete(info.file);cache.set(info.file,entry);return entry.value;}
    const value=await read(info,signal);signal?.throwIfAborted();
    // Aborted or failed work never populates the cache. The budget is decoded data size.
    if(info.decodedBytes<=maxBytes){while(size+info.decodedBytes>maxBytes&&cache.size){const key=cache.keys().next().value;size-=cache.get(key).bytes;cache.delete(key);}const old=cache.get(info.file);if(old)size-=old.bytes;cache.set(info.file,{value,bytes:info.decodedBytes});size+=info.decodedBytes;}
    return value;
  };
}
