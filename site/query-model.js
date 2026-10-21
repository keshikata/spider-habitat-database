import {heightBand,ELEVATION_STRIDE} from './elevation.js';

export const QUERY_STRIDE=512,QUERY_BASES=24576;
export function compactBase(key){return (key&15)|((key>>>6&15)<<4)|((key>>>12&3)<<8)|((key>>>14&3)<<10)|((key>>>18&7)<<12);}
export function sourceKey(base){return (base&15)|((base>>>4&15)<<6)|((base>>>8&3)<<12)|((base>>>10&3)<<14)|((base>>>12&7)<<18);}
// Compile predicates, not coordinates or counts. Height remains a separate 100m bin.
export function queryCompiler(rules){
  const active=rules.filter(r=>r.supported!==false).slice().sort((a,b)=>a.id.localeCompare(b.id));
  if(active.length>30)throw new Error('Too many query habitats');
  const signatures=[[0,0,0,0]],index=new Map([['0,0,0,0',0]]),lookup=new Uint16Array(QUERY_BASES);
  for(let base=0;base<QUERY_BASES;base++){
    const c=base>>>4&15,w=base>>>2&3,b=base&3,edge=base>>>8&3,rice=base>>>10&3,veg=base>>>12&7;
    const flags=[0,0,0,0];
    for(let i=0;i<active.length;i++){
      const r=active[i],bit=2**i;
      if((r.baseClasses??r.classes).includes(c))flags[3]+=bit;
      if(!r.classes.includes(c)||r.coast||r.river||r.vegetation&&r.vegetation!==veg)continue;
      for(let d=0;d<3;d++)if((!r.water||w<=d)&&(!r.built||b<=d)&&(!r.edge||edge<=d)&&(!r.rice||rice<=d))flags[d]+=bit;
    }
    const key=flags.join(',');let id=index.get(key);
    if(id===undefined){id=signatures.length;index.set(key,id);signatures.push(flags);}
    lookup[base]=id;
  }
  return {habitats:active.map(r=>r.id),signatures,lookup,key(raw,elevation){const sig=lookup[compactBase(elevation?raw%ELEVATION_STRIDE:raw)];return sig?sig*QUERY_STRIDE+(elevation?Math.floor(raw/ELEVATION_STRIDE):raw>>>4&3)*16+(raw>>>6&15):0;}};
}
export function queryMask(query,rules,species,settings){
  const ids=settings.habitats?.[species.id],active=new Set(rules.filter(r=>r.supported!==false&&(!Array.isArray(ids)||ids.includes(r.id))).map(r=>r.id));
  const mode=settings.model==='cover'?3:[100,250,500].indexOf(Number(settings.distance));
  if(mode<0)throw new Error('Invalid distance');
  const excluded=new Set(settings.excludedClasses||[]),byId=new Map(rules.map(r=>[r.id,r]));
  const allowed=Array.from({length:32},(_,bin)=>query.habitats.reduce((bits,id,i)=>{
    const r=byId.get(id),height=settings.elevationStepM===100?heightBand(bin*ELEVATION_STRIDE,settings):bin;
    return bits+(active.has(id)&&(!(r.elevationRequired||settings.model==='elevation'||settings.elevationStepM===100&&settings.model!=='cover')||r.elevation.includes(height))?2**i:0);
  },0));
  const matches=key=>excluded.has(key%16)?0:(query.signatures[Math.floor(key/QUERY_STRIDE)][mode]&allowed[Math.floor(key%QUERY_STRIDE/16)]?1:0);
  return {matches,some:()=>rules.some(r=>active.has(r.id)&&(settings.model==='cover'?(r.baseClasses??r.classes):r.classes).some(c=>!excluded.has(c)))&&query.signatures.some(flags=>allowed.some(bits=>(flags[mode]&bits)!==0))};
}
