export const ELEVATION_STEP=100;
export const ELEVATION_LIMIT=3000;
export const ELEVATION_MISSING=31;
export const ELEVATION_STRIDE=1572864;
export const ELEVATION_STRATA=ELEVATION_STRIDE*32;
export const DEFAULT_ELEVATION_THRESHOLDS={lowlandMax:200,mountainMin:800};
export function elevationThresholds(value={}){
  const lowlandMax=Number(value.lowlandMax),mountainMin=Number(value.mountainMin);
  return Number.isInteger(lowlandMax)&&Number.isInteger(mountainMin)&&lowlandMax>=100&&lowlandMax<ELEVATION_LIMIT&&mountainMin>lowlandMax&&mountainMin<=ELEVATION_LIMIT&&lowlandMax%ELEVATION_STEP===0&&mountainMin%ELEVATION_STEP===0?{lowlandMax,mountainMin}:{...DEFAULT_ELEVATION_THRESHOLDS};
}
export function heightBand(key,settings){
  const bin=Math.floor(key/ELEVATION_STRIDE);
  if(bin===ELEVATION_MISSING)return 3;
  const {lowlandMax,mountainMin}=elevationThresholds(settings),height=bin*ELEVATION_STEP;
  return height<lowlandMax?0:height<mountainMin?1:2;
}
export function elevationRuleDescription(bands,settings){
  const {lowlandMax,mountainMin}=elevationThresholds(settings);
  const low=bands.includes(0),middle=bands.includes(1),high=bands.includes(2);
  if(low&&middle&&high)return '標高のある画素（欠損を除く）';
  if(low&&middle)return `標高${mountainMin}m未満`;
  if(middle&&high)return `標高${lowlandMax}m以上`;
  return [low?`標高${lowlandMax}m未満`:null,middle?`標高${lowlandMax}m以上${mountainMin}m未満`:null,high?`標高${mountainMin}m以上`:null].filter(Boolean).join(' または ');
}
const cache=new WeakMap();
// A sparse view avoids allocating 50 million entries for each threshold choice.
export function elevationMask(base,settings){
  const thresholds=elevationThresholds(settings),signature=JSON.stringify(thresholds);
  let masks=cache.get(base);if(!masks){masks=new Map();cache.set(base,masks);}
  if(masks.has(signature))return masks.get(signature);
  const mappedBands=Array.from({length:32},(_,bin)=>bin===ELEVATION_MISSING?3:bin*ELEVATION_STEP<thresholds.lowlandMax?0:bin*ELEVATION_STEP<thresholds.mountainMin?1:2);
  const target={length:ELEVATION_STRATA,some:callback=>base.some(callback)};
  const mask=new Proxy(target,{get(object,property){
    if(typeof property!=='string'||!/^\d+$/.test(property))return object[property];
    const key=Number(property);
    if(!Number.isSafeInteger(key)||key<0||key>=ELEVATION_STRATA)return 0;
    const legacy=key%ELEVATION_STRIDE+mappedBands[Math.floor(key/ELEVATION_STRIDE)]*16;
    return base[legacy];
  }});
  masks.set(signature,mask);while(masks.size>12)masks.delete(masks.keys().next().value);
  return mask;
}
