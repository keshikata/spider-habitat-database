import {MODEL,REGION_NAMES,prefecturesFor,summarize,meshPosition,pixelArea,matchCell,escapeHTML as esc,csv} from './model.js';
import {readCompressed,createHabitatMap} from './map.js';
const $=id=>document.getElementById(id);
let catalog,selected,view='explore',shown=50,comparison=[],map,mapPromise,toastTimer,compareCandidate;
const views=['explore','compare','methods','updates','export'];
const searchIndex=new Map();
const state={region:'all',pref:'',scope:'recorded',unit:'km2'};
const number=new Intl.NumberFormat('ja-JP',{maximumFractionDigits:1});
const int=new Intl.NumberFormat('ja-JP');
const fmt=area=>area==null?'判定保留':number.format(area*(state.unit==='ha'?100:1));
const resultValue=a=>a.status==='no_scope'?'対象県なし':fmt(a.area);
const unit=()=>state.unit==='ha'?'ha':'km²';
function toast(message){$('toast').textContent=message;$('toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').hidden=true,3500);}
function byId(id){return catalog.species.find(s=>s.id===id);}
function scopeLabel(){return (state.pref?catalog.prefectures[+state.pref-1]:REGION_NAMES[state.region])+' / '+(state.scope==='recorded'?'種ごとの記録県内':'全地域の環境のみ');}
function saveURL(){const p=new URLSearchParams({species:selected.id,region:state.region,scope:state.scope,unit:state.unit,view});if(state.pref)p.set('pref',state.pref);if(comparison.length)p.set('compare',comparison.join(','));history.replaceState(null,'','?'+p);}
function setView(next){
  if(!views.includes(next))return;
  view=next;for(const id of views)$(id).hidden=id!==view;
  for(const button of document.querySelectorAll('.nav-button')){const active=button.dataset.view===view;button.classList.toggle('active',active);if(active)button.setAttribute('aria-current','page');else button.removeAttribute('aria-current');}
  document.querySelector('.scope-bar').hidden=['methods','updates'].includes(view);
  if(view==='explore'){map?.resize();renderMap(true);}else map?.suspend();if(view==='compare'){renderCompare();renderPicker();}if(view==='export')renderExportScope();saveURL();
}
function renderPrefs(){
  const ids=state.region==='all'?catalog.prefectures.map((_,i)=>i+1):catalog.regions[state.region];
  if(state.pref&&!ids.includes(+state.pref))state.pref='';
  $('pref').innerHTML='<option value="">すべての都道府県</option>'+ids.map(id=>`<option value="${id}">${esc(catalog.prefectures[id-1])}</option>`).join('');$('pref').value=state.pref;
}
function renderSearch(){
  const term=$('search').value.normalize('NFKC').trim().toLocaleLowerCase();
  const found=catalog.species.filter(s=>(!$('mapped-only').checked||s.classes.length)&&searchIndex.get(s.id).includes(term));
  $('search-count').textContent=`${int.format(found.length)}種${found.length>shown?` / ${shown}種を表示`:''}`;
  $('species-list').innerHTML=found.slice(0,shown).map(s=>`<button class="species-item${s.id===selected.id?' selected':''}" data-species="${s.id}" aria-pressed="${s.id===selected.id}"><strong>${esc(s.name)}</strong><em>${esc(s.scientific)}</em><small>${esc(s.familyJa)} · ${s.classes.length?'環境条件あり':s.environmentCount?'土地被覆は判定保留':'環境情報なし'}</small></button>`).join('')||'<p class="empty">該当する種がありません。<br>学名や科名でも検索できます。</p>';
  $('more-species').hidden=found.length<=shown;
}
function renderSelected(){
  const s=selected,a=summarize(catalog,s,state),allprefs=prefecturesFor(catalog,state.region,state.pref,'environment',s);
  $('selected-name').textContent=s.name;$('selected-scientific').textContent=`${s.scientific} ${s.author}`;$('selected-family').textContent=`${s.familyJa} / ${s.family}`;
  $('taxonomy-note').textContent=s.scientific!==s.catalogScientific?`本サイトでは ${s.scientific} として扱います。JSCの表記：${s.catalogScientific}。`:'';
  $('taxonomy-note').hidden=s.scientific===s.catalogScientific;
  $('area').innerHTML=a.area==null?resultValue(a):`${resultValue(a)}<span>${unit()}</span>`;
  $('recorded-count').innerHTML=`${allprefs.filter(id=>s.records[id]).length}<span>県</span>`;
  $('rule-count').innerHTML=`${s.mappedEnvironmentCount}<span>/ ${s.environmentCount} 環境</span>`;
  $('rule-status').textContent=s.environmentCount?'環境記述のうち土地被覆に対応できた数':'研究用の環境情報は未収録';
  $('rule-tags').innerHTML=s.classes.map(c=>`<span class="tag">${esc(catalog.classes[c])}</span>`).join('')||'<span class="tag gray">対応する土地被覆を判定できません</span>';
  $('pending-note').textContent=s.pending.length?`未評価：${s.pending.join('、')}。表示は対応できた土地被覆だけの候補です。`:'この種も、生息の有無・季節・局所環境の確認が必要です。';
  $('coverage-note').textContent=`${scopeLabel()}。集計対象 ${int.format(a.meshes)}メッシュ、土地被覆の未分類 ${fmt(a.missing)} ${unit()}。県境などの除外範囲は面積に含みません。`;
  updateCompareButton();
}
function updateCompareButton(){const included=comparison.includes(selected.id);$('add-compare').textContent=included?'比較から外す':'比較に追加';$('add-compare').setAttribute('aria-pressed',String(included));$('compare-count').textContent=comparison.length;}
function changeSpecies(id){const s=byId(id);if(!s)return;selected=s;renderSearch();renderSelected();renderMap(true);saveURL();}
function toggleComparison(id){
  if(comparison.includes(id))comparison=comparison.filter(x=>x!==id);
  else if(comparison.length>=8){toast('比較できるのは8種までです。先に1種外してください。');return;}
  else comparison.push(id);
  updateCompareButton();renderCompare();saveURL();
}
function renderCompare(){
  const series=comparison.map(byId).filter(Boolean).map(s=>({s,a:summarize(catalog,s,state)})).sort((a,b)=>(b.a.area??-1)-(a.a.area??-1));
  const max=Math.max(0,...series.map(x=>x.a.area||0));
  $('comparison-chips').innerHTML=series.map(({s})=>`<span class="chip">${esc(s.name)}<button data-remove="${s.id}" aria-label="${esc(s.name)}を比較から外す">×</button></span>`).join('');
  $('comparison-scope').textContent=scopeLabel()+'。'+(state.scope==='recorded'?'記録県は種ごとに異なります。環境条件自体を比べるには「全地域の環境だけで比較」を選んでください。':'すべての種を同じ地域で比較します。既知の分布外も含む環境条件の比較です。');
  $('comparison-chart').innerHTML=series.map(({s,a},i)=>`<div class="bar-row"><div class="bar-name"><strong>${esc(s.name)}</strong><small>${esc(s.scientific)}</small></div><div class="bar-track" role="img" aria-label="${esc(s.name)} ${resultValue(a)}${a.area==null?'':' '+unit()}">${a.area>0?`<div class="bar-fill" style="width:${a.area/max*100}%;background:${['#147d85','#246d9c','#356088','#586da1','#667c9b','#4b898c','#286173','#536b72'][i]}"></div>`:''}</div><div class="bar-value">${resultValue(a)}${a.area==null?'':` <small>${unit()}</small>`}</div></div>`).join('')||'<p class="empty">種を追加すると、同じ条件で候補面積を比較できます。</p>';
  $('comparison-table').innerHTML=series.map(({s,a})=>`<tr><td>${esc(s.name)}<br><em>${esc(s.scientific)}</em></td><td>${resultValue(a)} ${a.area==null?'':unit()}</td><td>${a.prefs.length}</td><td>${s.classes.length?s.classes.map(c=>`<div class="environment-row"><span>${esc(catalog.classes[c])}</span><span>${a.status==='no_scope'?'対象県なし':fmt(a.areas[c])+' '+unit()}</span></div>`).join(''):'判定保留'}</td><td>${esc(s.pending.join('、')||'在不在・局所環境')}</td></tr>`).join('');
  $('export-csv').disabled=!series.length;
}
function downloadFile(name,rows){const url=URL.createObjectURL(new Blob([csv(rows)],{type:'text/csv;charset=utf-8;'}));const link=document.createElement('a');link.href=url;link.download=name+'.csv';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
const csvHeader=['和名','学名','JSC学名','環境','候補面積','面積単位','対象地域','分布条件','対象県数','評価状態','未評価条件','分類取得日','JSC版','土地被覆版','モデル','面積の定義','出典・利用条件'];
function exportRow(s,a,environment,area,region){return [s.name,s.scientific,s.catalogScientific,environment,area==null?resultValue(a):(area*(state.unit==='ha'?100:1)).toFixed(3),unit(),region,state.scope==='recorded'?'記録県に限定':'環境のみ',a.prefs.length,a.status,s.pending.join(' / '),catalog.date,catalog.jsc.version,catalog.landcover,MODEL,'収録範囲の該当画素。標高等は未評価。境界等の除外あり。','JAXA HRLULC（JAXA利用条件） / 国土数値情報2025（CC BY 4.0） / Japan Spider Catalog / 個人研究の環境整理 / WSC分類対応情報（CC BY-NC-SA 4.0）'];}
function downloadCompare(){const rows=[csvHeader];for(const id of comparison){const s=byId(id),a=summarize(catalog,s,state);rows.push(exportRow(s,a,'合計',a.area,scopeLabel()));}downloadFile('spider-habitat-comparison-'+catalog.date,rows);}
function downloadEnvironment(ids){const rows=[csvHeader];for(const id of ids){const s=byId(id),a=summarize(catalog,s,state);rows.push(exportRow(s,a,'合計',a.area,scopeLabel()));for(const c of s.classes)rows.push(exportRow(s,a,catalog.classes[c],a.area==null?null:a.areas[c],scopeLabel()));}downloadFile('spider-habitat-environments-'+catalog.date,rows);}
function downloadPrefectures(){const rows=[csvHeader],ids=prefecturesFor(catalog,state.region,state.pref,'environment',selected);for(const p of ids){const a=summarize(catalog,selected,{...state,pref:String(p)});rows.push(exportRow(selected,a,'合計',a.area,catalog.prefectures[p-1]));for(const c of selected.classes)rows.push(exportRow(selected,a,catalog.classes[c],a.area==null?null:a.areas[c],catalog.prefectures[p-1]));}downloadFile('spider-habitat-prefectures-'+catalog.date,rows);}
function renderExportScope(){$('export-scope').textContent=selected.name+' / '+scopeLabel()+' / '+unit();$('export-comparison').disabled=!comparison.length;}
function renderPicker(){const term=$('compare-search').value.normalize('NFKC').toLowerCase().trim(),found=catalog.species.filter(s=>s.environmentCount&&searchIndex.get(s.id).includes(term));$('compare-options').innerHTML=found.slice(0,50).map(s=>`<button type="button" data-candidate="${s.id}"><span>${esc(s.name)}</span> <em>${esc(s.scientific)}</em></button>`).join('')+(found.length>50?'<p class="note">検索すると候補を絞れます。</p>':'');if(!found.length)$('compare-options').textContent='該当する種がありません。';}
function chooseCandidate(id){const s=byId(id);if(!s)return;compareCandidate=id;$('compare-choice').innerHTML=`${esc(s.name)} <em>${esc(s.scientific)}</em>`;$('compare-picker').open=false;}
async function ensureMap(){if(map)return map;if(!mapPromise)mapPromise=(async()=>{if(!window.L)await new Promise((resolve,reject)=>{const script=document.createElement('script');script.src='./vendor/leaflet/leaflet.js';script.onload=resolve;script.onerror=()=>{script.remove();reject(new Error('地図ライブラリを取得できません'));};document.head.append(script);});map=createHabitatMap(catalog,fmt,unit);return map;})().catch(e=>{mapPromise=null;throw e;});return mapPromise;}
function fitMap(){map?.fit();}
async function renderMap(fit=false){if(view!=='explore')return;try{const m=await ensureMap();if(view!=='explore'){m.suspend();return;}m.resize();await m.render({species:selected,prefs:prefecturesFor(catalog,state.region,state.pref,state.scope,selected),fit});}catch(error){$('map-status').textContent='地図を読み込めませんでした。ページを再読み込みしてください。';console.error(error);}}
async function init(){
  try{
    catalog=typeof DecompressionStream==='function'?await readCompressed('./data/search.json.gz',{bytes:300000,decodedBytes:2000000}):await (await fetch('./data/search.json')).json();
    if(catalog.schema!==1||catalog.model!==MODEL||catalog.species.length>2500)throw new Error('分類データとモデルの版が一致しません');
    for(const s of catalog.species){if(!/^\d{1,5}$/.test(s.id)||!Array.isArray(s.classes)||s.classes.some(c=>!Number.isInteger(c)||c<1||c>15))throw new Error('分類データが不正です');searchIndex.set(s.id,[s.name,s.scientific,s.catalogScientific,s.family,s.familyJa,s.genus,...s.aliases].join(' ').normalize('NFKC').toLocaleLowerCase());}
    const params=new URLSearchParams(location.search);state.region=Object.keys(REGION_NAMES).includes(params.get('region'))?params.get('region'):'all';state.pref=/^(?:[1-9]|[1-3][0-9]|4[0-7])$/.test(params.get('pref')||'')?params.get('pref'):'';state.scope=params.get('scope')==='environment'?'environment':'recorded';
    selected=byId(params.get('species'))||catalog.species.find(s=>s.name==='ワスレナグモ');
    comparison=params.has('compare')?[...new Set(params.get('compare').split(',').filter(id=>byId(id)))].slice(0,8):['ワスレナグモ','ヒゴキムラグモ','ワタリカニグモ'].map(name=>catalog.species.find(s=>s.name===name)?.id).filter(Boolean);
    state.unit=params.get('unit')==='ha'?'ha':'km2';$('unit').value=state.unit;
    $('region').value=state.region;$('scope').value=state.scope;renderPrefs();$('boot').hidden=true;$('workspace').hidden=false;
    $('catalog-count').textContent=int.format(catalog.counts.taxonomy)+'種';
    chooseCandidate(catalog.species.find(s=>s.environmentCount).id);
    renderSearch();renderSelected();renderCompare();setView(views.includes(params.get('view'))?params.get('view'):'explore');
    document.addEventListener('click',event=>{const el=event.target.closest('button');if(!el)return;if(el.dataset.view)setView(el.dataset.view);if(el.dataset.species)changeSpecies(el.dataset.species);if(el.dataset.remove)toggleComparison(el.dataset.remove);if(el.dataset.candidate)chooseCandidate(el.dataset.candidate);});
    $('search').addEventListener('input',()=>{shown=50;renderSearch();});$('mapped-only').onchange=()=>{shown=50;renderSearch();};$('more-species').onclick=()=>{shown+=50;renderSearch();};
    for(const id of ['region','pref','scope','unit'])$(id).addEventListener('change',()=>{state[id]=$(id).value;if(id==='region'){state.pref='';renderPrefs();}map?.closePopup();renderSelected();renderCompare();renderExportScope();if(id!=='unit')renderMap(view==='explore');saveURL();});
    $('add-compare').onclick=()=>{const exists=comparison.includes(selected.id);toggleComparison(selected.id);if(!exists&&comparison.includes(selected.id))toast('面積比較に追加しました');};
    $('compare-add-button').onclick=()=>{const id=compareCandidate;if(comparison.includes(id))toast('この種は比較に入っています');else toggleComparison(id);};
    $('export-csv').onclick=downloadCompare;$('fit-map').onclick=fitMap;$('basemap').onchange=()=>map?.setBasemap($('basemap').value);
    $('compare-search').oninput=renderPicker;$('export-selected').onclick=()=>downloadEnvironment([selected.id]);$('export-comparison').onclick=()=>downloadEnvironment(comparison);$('export-prefectures').onclick=downloadPrefectures;
  }catch(error){$('boot').hidden=false;$('boot').innerHTML='<p>初期データを読み込めませんでした。接続を確認して再読み込みしてください。</p><button id="retry-init" class="primary-button">再読み込み</button>';$('retry-init').onclick=()=>location.reload();console.error(error);}
}
init();
