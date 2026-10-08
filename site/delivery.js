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
  return value;
}

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
