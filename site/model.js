export const MODEL='landcover-rules-1.0.0';
export const REGION_NAMES={all:'全国',hokkaido:'北海道',tohoku:'東北',kanto:'関東',chubu:'中部',kinki:'近畿',chugoku:'中国',shikoku:'四国',kyushu:'九州',okinawa:'沖縄'};
export function prefecturesFor(catalog,region,pref,scope,species){
  let ids=region==='all'?catalog.prefectures.map((_,i)=>i+1):catalog.regions[region];
  if(!ids)throw new Error('Unknown region');
  if(pref)ids=ids.filter(id=>id===Number(pref));
  if(scope==='recorded')ids=ids.filter(id=>Number(species.records[id])>0);
  return ids;
}
export function summarize(catalog,species,{region='all',pref='',scope='recorded'}={}){
  const ids=prefecturesFor(catalog,region,pref,scope,species);
  const categories=[...new Set(species.classes)];
  if(categories.some(c=>!Number.isInteger(c)||c<1||c>15))throw new Error('Invalid cover category');
  const areas=Array(16).fill(0);
  let meshes=0;
  for(const id of ids){const row=catalog.summary[id];for(let c=0;c<16;c++)areas[c]+=row.areas[c];meshes+=row.meshes;}
  return {area:categories.length&&ids.length?categories.reduce((n,c)=>n+areas[c],0):null,
    status:!categories.length?'unmapped':!ids.length?'no_scope':'evaluated',
    total:areas.reduce((a,b)=>a+b,0),missing:areas[0],areas,meshes,prefs:ids,
    records:ids.reduce((n,id)=>n+(Number(species.records[id])||0),0)};
}
export function meshPosition(code){
  if(!/^\d{4}[0-7]{2}\d{2}$/.test(code))throw new Error('Invalid mesh code');
  const x=+code.slice(2,4)*80+(+code[5])*10+(+code[7]);
  const y=+code.slice(0,2)*80+(+code[4])*10+(+code[6]);
  return {x,y,west:100+x/80,south:y/120,east:100+(x+1)/80,north:(y+1)/120};
}
export function pixelArea(lat){
  const a=6378137,e2=6.6943799901413165e-3,e=Math.sqrt(e2),rad=Math.PI/180;
  const f=p=>{const u=Math.sin(p);return u/(2*(1-e2*u*u))+Math.atanh(e*u)/(2*e);};
  return a*a*(1-e2)*rad/12000*(f((lat+1/24000)*rad)-f((lat-1/24000)*rad))/1e6;
}
export function matchCell(counts,classes){
  const total=counts.reduce((a,b)=>a+b,0),matching=[...new Set(classes)].reduce((n,c)=>n+counts[c],0);
  return {total,matching,ratio:total?matching/total:0,missing:counts[0]};
}
export function escapeHTML(value){return String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
export function csv(rows){
  return '\uFEFF'+rows.map(row=>row.map(value=>{let t=String(value??'');if(/^[\s]*[=+@\-]/.test(t))t="'"+t;return '"'+t.replaceAll('"','""')+'"';}).join(',')).join('\r\n');
}
