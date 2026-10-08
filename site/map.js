import {pixelArea, escapeHTML as esc} from './model.js';

async function readLimited(response, limit, signal) {
  if (!response.ok) throw new Error('データを取得できません');
  signal?.throwIfAborted();
  const reader=response.body.getReader(), chunks=[];let size=0;
  const abort=()=>{reader.cancel().catch(()=>{});};signal?.addEventListener('abort',abort,{once:true});
  try {while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>limit)throw new Error('データが上限を超えています');chunks.push(value);}}
  finally {signal?.removeEventListener('abort',abort);await reader.cancel();}
  signal?.throwIfAborted();
  const result=new Uint8Array(size);let offset=0;for(const chunk of chunks){result.set(chunk,offset);offset+=chunk.length;}return result;
}
export async function readCompressed(url, {signal, bytes=2000000, decodedBytes=12000000, sha256}={}) {
  if(!Number.isSafeInteger(bytes)||bytes<1||bytes>64000000||!Number.isSafeInteger(decodedBytes)||decodedBytes<1||decodedBytes>192000000)throw new Error('データサイズの指定が不正です');
  const packed=await readLimited(await fetch(url,{signal,credentials:'same-origin'}),bytes,signal);
  if(sha256){const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',packed)),v=>v.toString(16).padStart(2,'0')).join('');if(hash!==sha256)throw new Error('地図データの版が一致しません');}
  signal?.throwIfAborted();
  if(typeof DecompressionStream!=='function')throw new Error('地図の表示には新しいブラウザが必要です');
  const stream=new Blob([packed]).stream().pipeThrough(new DecompressionStream('gzip'));
  const raw=await readLimited(new Response(stream),decodedBytes,signal);
  return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(raw));
}
const validCell=(x,y,counts)=>Number.isInteger(x)&&x>=1600&&x<=4400&&Number.isInteger(y)&&y>=2400&&y<=6000&&counts.length===16&&counts.every(n=>Number.isSafeInteger(n)&&n>=0&&n<=2000000);
const bounds=(x,y,step)=>({x,y,west:100+x/80,east:100+(x+step)/80,south:y/120,north:(y+step)/120});

export function createHabitatMap(catalog, formatArea, unit){
  const $=id=>document.getElementById(id),m=L.map('map',{zoomControl:true,preferCanvas:true,minZoom:4,maxZoom:14,zoomAnimation:false}).setView([36.5,137.5],5);
  const tile=L.tileLayer('https://cyberjapandata.gsi.go.jp/xyz/pale/{z}/{x}/{y}.png',{maxZoom:18,referrerPolicy:'no-referrer',attribution:'<a href="https://maps.gsi.go.jp/development/ichiran.html">地理院タイル</a>'});
  let manifest,overview,prefs=[],species,version=0,controller,ready=false,spatial,settings,latestOptions;
  const cache=new Map();
  const Layer=L.Layer.extend({
    onAdd(map){this._map=map;this.canvas=L.DomUtil.create('canvas','habitat-canvas');map.getPanes().overlayPane.appendChild(this.canvas);this.cells=[];this.hit=new Map();map.on('moveend resize zoomend',this.redraw,this);map.on('click',this.onClick,this);},
    setCells(cells,step){this.step=step;this.cells=[];this.hit=new Map();for(const c of cells){const total=c.counts.reduce((a,b)=>a+b,0),matching=c.matching??species.classes.reduce((n,k)=>n+c.counts[k],0);if(!matching)continue;const cell={...c,total,matching,ratio:total?matching/total:0};this.cells.push(cell);this.hit.set(c.x+','+c.y,cell);}this.redraw();},
    redraw(){const size=m.getSize(),dpr=Math.min(devicePixelRatio||1,2);this.canvas.width=size.x*dpr;this.canvas.height=size.y*dpr;this.canvas.style.width=size.x+'px';this.canvas.style.height=size.y+'px';L.DomUtil.setPosition(this.canvas,m.containerPointToLayerPoint([0,0]));const ctx=this.canvas.getContext('2d');ctx.scale(dpr,dpr);const b=m.getBounds(),xs=new Map(),ys=new Map();ctx.globalAlpha=.76;for(const c of this.cells){if(c.east<b.getWest()||c.west>b.getEast()||c.north<b.getSouth()||c.south>b.getNorth())continue;if(!xs.has(c.x)){const p=m.latLngToContainerPoint([b.getNorth(),c.west]),p2=m.latLngToContainerPoint([b.getNorth(),c.east]);xs.set(c.x,[p.x,p2.x-p.x]);}if(!ys.has(c.y)){const p=m.latLngToContainerPoint([c.north,b.getWest()]),p2=m.latLngToContainerPoint([c.south,b.getWest()]);ys.set(c.y,[p.y,p2.y-p.y]);}const[x,w]=xs.get(c.x),[y,h]=ys.get(c.y);ctx.fillStyle=c.ratio<.1?'#88cbd0':c.ratio<.3?'#3698ac':'#07576e';ctx.fillRect(x,y,Math.max(w,.65),Math.max(h,.65));}},
    onClick(e){if(this.canvas.hidden)return;const step=this.step||8,x=Math.floor((e.latlng.lng-100)*80/step)*step,y=Math.floor(e.latlng.lat*120/step)*step,c=this.hit.get(x+','+y);if(!c)return;const detail=step<=1?`該当面積 ${formatArea(c.matching*pixelArea((c.south+c.north)/2))} ${unit()}<br>`:'拡大すると詳細な区画を確認できます。<br>';L.popup().setLatLng(e.latlng).setContent(`<strong>${step===.25?'約250mの区画':step===1?'約1kmの区画':'広域の集計区画'}</strong><p>${c.prefs.map(p=>esc(catalog.prefectures[p-1])).join('・')}<br>${detail}収録画素のうち該当 ${(c.ratio*100).toFixed(1)}%</p><small>区画内のどこに環境があるかは示していません。</small>`).openOn(m);}
  });
  const layer=new Layer().addTo(m);L.control.scale({imperial:false}).addTo(m);
  const controls=L.control({position:'topright'});
  controls.onAdd=()=>{
    const panel=L.DomUtil.create('div','map-actions');L.DomEvent.disableClickPropagation(panel);L.DomEvent.disableScrollPropagation(panel);
    const add=(label,action,pressed)=>{const b=document.createElement('button');b.type='button';b.textContent=label;b.title=label;if(pressed!==undefined)b.setAttribute('aria-pressed',String(pressed));b.onclick=()=>action(b);panel.append(b);return b;};
    add('全国へ',()=>m.setView([36.5,137.5],5));
    add('候補範囲へ',()=>fit());
    add('候補を隠す',b=>{const hidden=b.getAttribute('aria-pressed')!=='true';layer.canvas.hidden=hidden;m.closePopup();b.setAttribute('aria-pressed',String(hidden));b.textContent=hidden?'候補を表示':'候補を隠す';},false);
    add('地図を広げる',b=>{const wrap=$('map').closest('.map-wrap'),expanded=wrap.classList.toggle('map-expanded');document.body.classList.toggle('map-is-expanded',expanded);if(expanded){wrap.setAttribute('role','dialog');wrap.setAttribute('aria-modal','true');wrap.setAttribute('aria-label','環境候補マップ');}else{for(const attr of ['role','aria-modal','aria-label'])wrap.removeAttribute(attr);}b.setAttribute('aria-pressed',String(expanded));b.textContent=expanded?'元の大きさ':'地図を広げる';m.invalidateSize();},false);
    const close=()=>{if($('map').closest('.map-wrap').classList.contains('map-expanded')){panel.lastElementChild.click();panel.lastElementChild.focus();}};
    document.addEventListener('keydown',e=>{if(e.key==='Escape')close();if(e.key==='Tab'){const wrap=$('map').closest('.map-wrap');if(!wrap.classList.contains('map-expanded'))return;const items=[...wrap.querySelectorAll('button:not(:disabled),select,a[href],[tabindex="0"]')].filter(el=>el.getClientRects().length);const first=items[0],last=items.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}}});
    return panel;
  };controls.addTo(m);
  const retry=()=>{const status=$('map-status');status.replaceChildren(document.createTextNode('地図データを読み込めませんでした。'));const button=document.createElement('button');button.className='small-button';button.textContent='再読込';button.onclick=()=>render(latestOptions);status.append(button);};
  function coarse(){const set=new Set(prefs),groups=new Map();for(const row of overview.cells){const[x,y,p,counts]=row;if(!set.has(p))continue;const key=x+','+y;let c=groups.get(key);if(!c){c={...bounds(x,y,8),counts:Array(16).fill(0),prefs:[]};groups.set(key,c);}c.prefs.push(p);for(let k=0;k<16;k++)c.counts[k]+=counts[k];}return [...groups.values()];}
  async function prepare(signal,skipOverview=false){
    if(!manifest){const r=await fetch('./data/maps/manifest.json',{signal});const next=JSON.parse(new TextDecoder().decode(await readLimited(r,30000)));if(next.schema!==1||!next.prefectures||Object.keys(next.prefectures).length!==47)throw new Error('地図形式が一致しません');
      for(const [key,p] of [['overview',next.overview],...Object.entries(next.prefectures)]){const prefix=key==='overview'?'overview':'pref-'+key;if(key!=='overview'&&!/^(?:[1-9]|[1-3][0-9]|4[0-7])$/.test(key))throw new Error('不正な都道府県');if(!p||!Number.isSafeInteger(p.bytes)||p.bytes<1||p.bytes>2000000||!Number.isSafeInteger(p.decodedBytes)||p.decodedBytes<1||p.decodedBytes>64000000||!Number.isSafeInteger(p.cells)||p.cells<1||p.cells>100000||!/^[a-f0-9]{64}$/.test(p.sha256)||p.file!==prefix+'-'+p.sha256.slice(0,12)+'.json.gz')throw new Error('不正な地図情報');if(key!=='overview'&&(!Array.isArray(p.bounds)||p.bounds.length!==4||p.bounds.some(n=>!Number.isInteger(n)||n<0||n>6000)||p.bounds[0]>=p.bounds[2]||p.bounds[1]>=p.bounds[3]))throw new Error('不正な地図範囲');}manifest=next;
    }
    if(!skipOverview&&!overview){const info=manifest.overview,next=await readCompressed('./data/maps/'+info.file,{...info,signal});if(next.schema!==1||next.step!==8||!Array.isArray(next.cells)||next.cells.length!==info.cells||next.cells.length>15000||next.cells.some(([x,y,p,c])=>!validCell(x,y,c)||!Number.isInteger(p)||p<1||p>47))throw new Error('広域データの形式が不正です');overview=next;}

  }
  function fit(){if(!manifest||!prefs.length)return;if(spatial){const b=spatial.scopeBounds(species,prefs,settings);if(b)m.fitBounds([[b[1],b[0]],[b[3],b[2]]],{padding:[20,20],maxZoom:12,animate:false});return;}const bs=prefs.map(p=>manifest.prefectures[p]?.bounds).filter(Boolean);if(!bs.length)return;m.fitBounds([[Math.min(...bs.map(b=>b[1]))/120,100+Math.min(...bs.map(b=>b[0]))/80],[Math.max(...bs.map(b=>b[3]))/120,100+Math.max(...bs.map(b=>b[2]))/80]],{padding:[20,20],maxZoom:10,animate:false});}
  async function update(){
    if(!ready||!species?.classes.length||!prefs.length)return;
    const own=++version;controller?.abort();controller=new AbortController();const signal=controller.signal;
    if(spatial){
      const b=m.getBounds();$('map-status').textContent='250mの環境条件を読み込んでいます…';
      try{const result=await spatial.mapCells({bounds:{west:b.getWest(),east:b.getEast(),south:b.getSouth(),north:b.getNorth()},zoom:m.getZoom(),prefs,species,settings,signal});if(own!==version||signal.aborted)return;layer.setCells(result.cells,result.step);$('map-resolution').textContent=result.detail?'約250mメッシュ':'広域表示（拡大すると約250m）';$('map-status').textContent='';}catch(error){if(error.name!=='AbortError'&&own===version){retry();console.error(error);}}return;
    }
    layer.setCells(coarse(),8);$('map-resolution').textContent='広域表示（拡大すると約1km）';
    if(m.getZoom()<9){$('map-status').textContent='';return;}
    const b=m.getBounds(),needed=prefs.filter(p=>{const a=manifest.prefectures[p].bounds;return 100+a[2]/80>=b.getWest()&&100+a[0]/80<=b.getEast()&&a[3]/120>=b.getSouth()&&a[1]/120<=b.getNorth();});
    $('map-status').textContent='表示範囲の詳細を読み込んでいます…';
    try {const results=[];let index=0;async function worker(){while(index<needed.length){const p=needed[index++];let cells=cache.get(p);if(!cells){const info=manifest.prefectures[p],data=await readCompressed('./data/maps/'+info.file,{...info,signal});if(data.schema!==1||data.step!==1||data.pref!==p||data.cells.length!==info.cells||data.cells.some(([x,y,c])=>!validCell(x,y,c)))throw new Error('詳細データの形式が不正です');cells=data.cells.map(([x,y,counts])=>({...bounds(x,y,1),counts,prefs:[p]}));if(signal.aborted)return;cache.set(p,cells);while(cache.size>4)cache.delete(cache.keys().next().value);}else{cache.delete(p);cache.set(p,cells);}for(const cell of cells)results.push(cell);}}
      await Promise.all([worker(),worker()]);if(own!==version||signal.aborted)return;layer.setCells(results,1);$('map-resolution').textContent='約1kmメッシュ';$('map-status').textContent='';
    }catch(error){if(error.name!=='AbortError'&&own===version){retry();console.error(error);}}
  }
  async function render(options){latestOptions=options;spatial=options.spatial;settings=options.settings;species=options.species;prefs=options.prefs;const own=++version;controller?.abort();controller=new AbortController();layer.setCells([],1);m.closePopup();if(!species.classes.length||!prefs.length){ready=false;$('map-status').textContent=!species.classes.length?(species.availableClassCount?'対象の土地被覆がすべてオフです。ボタンをオンにすると候補を表示します。':species.publicationHoldCount?'選択した生息環境は、データの配布条件を確認するまで計算を保留しています。':'選択した生息環境は、現在のデータでは判定できません。'):'選択範囲にこの種の県別記録はありません。';return;}$('map-status').textContent='環境候補を読み込んでいます…';try{await prepare(controller.signal,Boolean(spatial));if(own!==version)return;ready=true;if(options.fit){ready=false;fit();ready=true;}await update();}catch(error){if(error.name!=='AbortError'&&own===version){retry();console.error(error);}}}
  m.on('moveend',update);
  new ResizeObserver(()=>{if($('map').clientWidth&&$('map').clientHeight)m.invalidateSize({pan:false});}).observe($('map'));
  return {render,fit,bounds(){const b=m.getBounds();return {west:b.getWest(),east:b.getEast(),south:b.getSouth(),north:b.getNorth()};},resize(){m.invalidateSize();layer.redraw();},closePopup(){m.closePopup();},suspend(){ready=false;version++;controller?.abort();},setBasemap(value){value==='pale'?tile.addTo(m):m.removeLayer(tile);}};
}
