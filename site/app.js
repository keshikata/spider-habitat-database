import {PUBLIC_SOURCES,PUBLIC_LICENSES,HELD_LAYERS} from './publication-policy.js';
import {MODEL,REGION_NAMES,prefecturesFor,summarize as summarizeBase,meshPosition,pixelArea,matchCell,escapeHTML as esc,csv,includedClasses,excludedClasses} from './model.js';
import {readCompressed,createHabitatMap} from './map.js';
import {loadSpatial} from './spatial.js';
import {SPATIAL_MODEL,effectiveSpecies,summarizeSpatial,selectedRules} from './spatial-model.js';
import {habitatSelection,evaluableRules} from './habitat-selection.js';
import {recordScope,geographicNote} from './record-geography.js';
import {comparisonCapacity} from './comparison.js';
const $=id=>document.getElementById(id);
let catalog,selected,view='explore',shown=50,comparison=[],map,mapPromise,toastTimer,compareCandidate,spatial,geoController;
const views=['explore','compare','guide','methods','updates','export'];
const searchIndex=new Map();
const state={region:'all',pref:'',scope:'recorded',unit:'km2',model:'cover',distance:250,habitats:{},excludedClasses:[]};
let habitatFilter=null,allHabitats=[],compareGenus='';
let comparisonLimit=1,slidesStarted=false;
const number=new Intl.NumberFormat('ja-JP',{maximumFractionDigits:1});
const int=new Intl.NumberFormat('ja-JP');
const effective=(s,settings=state)=>spatial?effectiveSpecies(spatial.data,s,settings):({...s,classes:includedClasses(s.classes,settings),availableClassCount:s.classes.length,pending:s.pending.map(v=>v==='標高・気候'?'標高':v).filter(v=>!/気候|気温/.test(v))});
const summarize=(c,s,settings=state)=>spatial?summarizeSpatial(c,spatial.data,s,settings):summarizeBase(c,s,settings);
const conditionLabel=()=>!spatial||state.model==='cover'?'土地被覆のみ':`距離 ${state.distance}m`;
const fmt=area=>area==null?'判定保留':number.format(area*(state.unit==='ha'?100:1));
const resultValue=a=>a.status==='no_environment'?'環境未選択':a.status==='no_landcover'?'土地被覆未選択':a.status==='no_scope'?'対象県なし':a.status==='no_geography'?'島の範囲未対応':fmt(a.area);
const unit=()=>state.unit==='ha'?'ha':'km²';
function toast(message){$('toast').textContent=message;$('toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').hidden=true,3500);}
function byId(id){return catalog.species.find(s=>s.id===id);}
function scopeLabel(){return (state.pref?catalog.prefectures[+state.pref-1]:REGION_NAMES[state.region])+' / '+(state.scope==='recorded'?(spatial?.data.geography?'記録のある本土・島':'種ごとの記録県内'):'全地域の環境のみ')+' / '+conditionLabel()+(state.excludedClasses.length?' / '+landcoverNote():'');}
function saveURL(){const p=new URLSearchParams({species:selected.id,region:state.region,scope:state.scope,unit:state.unit,view,model:state.model,distance:String(state.distance)});if(state.pref)p.set('pref',state.pref);if(comparison.length)p.set('compare',comparison.join(','));if(habitatFilter!==null)p.set('habitat',habitatFilter.join('.'));if(state.excludedClasses.length)p.set('excludeCover',state.excludedClasses.join('.'));history.replaceState(null,'','?'+p);}
function setView(next){
  if(!views.includes(next))return;
  view=next;for(const id of views)$(id).hidden=id!==view;
  for(const button of document.querySelectorAll('.nav-button')){const active=button.dataset.view===view;button.classList.toggle('active',active);if(active)button.setAttribute('aria-current','page');else button.removeAttribute('aria-current');}
  document.querySelector('.scope-bar').hidden=['guide','methods','updates'].includes(view);$('analysis-controls').hidden=!spatial||['guide','methods','updates'].includes(view);
  if(view==='explore'){map?.resize();renderMap(true);}else map?.suspend();if(view==='compare'){renderCompare();renderPicker();}if(view==='export')renderExportScope();if(view==='methods'){renderRuleAudit();initSlides();}renderLandcoverNotice();saveURL();
}
function renderPrefs(){
  const ids=state.region==='all'?catalog.prefectures.map((_,i)=>i+1):catalog.regions[state.region];
  if(state.pref&&!ids.includes(+state.pref))state.pref='';
  $('pref').innerHTML='<option value="">すべての都道府県</option>'+ids.map(id=>`<option value="${id}">${esc(catalog.prefectures[id-1])}</option>`).join('');$('pref').value=state.pref;
}
function renderSearch(){
  const term=$('search').value.normalize('NFKC').trim().toLocaleLowerCase();
  const found=catalog.species.filter(s=>searchableSpecies(s)&&searchIndex.get(s.id).includes(term));
  $('search-count').textContent=`${int.format(Math.min(shown,found.length))} / ${int.format(found.length)}種を表示`;
  const scroll=$('species-list').scrollTop,left=$('species-list').scrollLeft,focused=$('species-list').contains(document.activeElement)?document.activeElement.dataset.species:null;
  $('species-list').innerHTML=found.slice(0,shown).map(s=>`<button class="species-item${s.id===selected.id?' selected':''}" data-species="${s.id}" aria-pressed="${s.id===selected.id}"><strong>${esc(s.name)}</strong><em>${esc(s.scientific)}</em><small>${esc(s.familyJa)}${!effectiveSpeciesForSearch(s).classes.length?' · '+(s.environmentCount?'土地被覆は判定保留':'環境情報なし'):''}</small></button>`).join('')||'<p class="empty">該当する種がありません。<br>検索語や環境の条件を変えてください。</p>';
  $('species-list').dataset.more=String(found.length>shown);$('species-list').scrollTop=scroll;$('species-list').scrollLeft=left;
  if(focused)$('species-list').querySelector(`[data-species="${focused}"]`)?.focus({preventScroll:true});
}
function effectiveSpeciesForSearch(s){return spatial?effectiveSpecies(spatial.data,s,{...state,habitats:{},excludedClasses:[]}):s;}
function ruleDescription(r){
  if(r.publicationHold?.length)return '計算・配布は保留：'+r.publicationHold.join('・');
  if(!r.supported)return '未評価：'+r.pending.join('・');
  const classes=state.model==='cover'?(r.baseClasses??r.classes):r.classes;
  const parts=[classes.map(c=>catalog.classes[c]).join('・')||'土地被覆は未対応'];
  if(state.model!=='cover'&&r.edge)parts.push(`林縁から${state.distance}m以内`);
  if(state.model!=='cover'&&r.rice)parts.push(`水田から${state.distance}m以内`);
  if(state.model!=='cover'&&r.river)parts.push(`河川中心線から${state.distance}m以内`);
  if(r.vegetation)parts.push('植生図の'+({1:'果樹園',2:'植林地',3:'牧草地',4:'ハイマツ群落',5:'低木群落'})[r.vegetation]);
  if(state.model!=='cover'&&r.coast)parts.push(`海岸線から${state.distance}m以内`);
  if(state.model!=='cover'&&r.water)parts.push(`水域から${state.distance}m以内`);
  if(state.model!=='cover'&&r.built)parts.push(`人工構造物から${state.distance}m以内`);
  if(state.model==='elevation'&&r.elevation.length<4)parts.push(r.elevation.map(h=>spatial.data.elevationBands[h]).join('・'));
  if(state.model!=='elevation'&&r.elevation.length<4)parts.push('標高条件は未実装');
  return parts.join(' かつ ');
}
function searchableSpecies(s){return s.environmentCount>0&&(!spatial||habitatFilter===null||(spatial.data.rules[s.id]||[]).some(r=>habitatFilter.includes(r.id)));}
function renderHabitats(){
  if(!spatial)return;
  const term=$('habitat-search').value.trim().normalize('NFKC').toLocaleLowerCase();
  const rules=allHabitats.filter(r=>(r.label+' '+ruleDescription(r)).normalize('NFKC').toLocaleLowerCase().includes(term));
  $('habitat-options').innerHTML=rules.map(r=>`<label class="habitat-option"><input type="checkbox" value="${esc(r.id)}" ${habitatFilter?.includes(r.id)?'checked':''}><span><strong>${esc(r.label)}</strong><small>${esc(ruleDescription(r))}</small>${r.supported&&r.limitations.some(v=>!v.startsWith('標高条件'))?'<small class="proxy-label">近似の限界：'+esc(r.limitations.filter(v=>!v.startsWith('標高条件')).join('。'))+'</small>':''}</span></label>`).join('')||'<p class="note">該当する環境がありません。</p>';
  const labels=allHabitats.filter(r=>habitatFilter?.includes(r.id)).map(r=>r.label);
  $('habitat-choice').textContent=habitatFilter===null?'すべての生息環境':labels.length?labels.join(' ／ '):'環境未選択';
  $('habitat-selection-note').textContent='環境名で種を絞り込めます。保留・未評価の環境は地図・面積に含みません。';
  $('habitat-current').textContent=selected.name+'の環境を選択';
  $('selected-habitats').textContent='選択中の生息環境：'+(selectedRules(selected,spatial.data.rules[selected.id]||[],state).map(r=>r.label+(r.publicationHold?.length?'（計算保留）':r.supported===false?'（未評価）':'')).join(' ／ ')||'未選択');
}
function renderRuleAudit(){
  if(!spatial||view!=='methods')return;
  $('rule-audit').hidden=false;
  const q=$('rule-audit-search').value.trim().normalize('NFKC').toLowerCase();
  const matched=allHabitats.filter(r=>(r.id+' '+r.label+' '+r.pending.join(' ')+' '+r.limitations.join(' ')).normalize('NFKC').toLowerCase().includes(q));
  const supported=allHabitats.filter(r=>r.supported),proxy=supported.filter(r=>r.proxy),held=allHabitats.filter(r=>r.publicationHold?.length).length;
  $('rule-audit-count').textContent=`全${allHabitats.length}環境：条件を計算 ${supported.length-proxy.length}、近似条件で計算 ${proxy.length}、配布条件の確認待ち ${held}、未評価 ${allHabitats.length-supported.length-held}。現在 ${matched.length}件を表示。`;
  $('rule-audit-rows').innerHTML=matched.map(r=>`<tr><th scope="row">${esc(r.label)}<small>${esc(r.id)}</small></th><td>${r.supported?esc(ruleDescription(r)):'面積・地図へ加算しない'}</td><td>${r.publicationHold?.length?'配布条件の確認待ち':r.supported?(r.proxy?'近似条件':'条件を計算'):'未評価'}</td><td>${esc((r.supported?r.limitations:r.pending).join('。')||'指定した土地被覆と距離条件を使用')}</td></tr>`).join('');
}
function applyHabitatFilter(ids){
  habitatFilter=ids;state.habitats=habitatSelection(spatial.data.rules,ids);
  const term=$('search').value.normalize('NFKC').trim().toLocaleLowerCase();
  if(!searchableSpecies(selected)){const next=catalog.species.find(s=>searchableSpecies(s)&&searchIndex.get(s.id).includes(term))||catalog.species.find(searchableSpecies);if(next)selected=next;}
  shown=50;$('species-list').scrollTop=0;renderSearch();renderSelected();renderCompare();renderGenus();renderPicker();renderExportScope();renderMap(true);saveURL();
}
function renderRecordAreas(prefs,s){
  const rows=prefs.map(p=>s.recordAreas?.[p]).filter(Boolean),islands=[...new Set(rows.flatMap(r=>r.islands))];
  $('record-area-summary').textContent=`本土の記録 ${rows.filter(r=>r.mainland).length}県 ／ 離島 ${islands.length}島`+(rows.some(r=>r.unspecified)?` ／ 地域詳細不明 ${rows.filter(r=>r.unspecified).length}県`:'');
  const scope=recordScope(spatial?.data.geography,s,prefecturesFor(catalog,state.region,state.pref,state.scope,s),state.scope);
  $('record-area-detail').textContent=(islands.length?'離島：'+islands.join('、')+'。':'')+'本土は北海道・本州・四国・九州。'+(state.scope==='environment'?'記録の有無によらず選択県の全域を比較します。':geographicNote(spatial?.data.geography,scope)+'。');
  if(scope.unresolved.length)$('record-area-summary').closest('details').open=true;
}
function renderSelected(){
  const s=effective(selected),a=summarize(catalog,s,state),allprefs=prefecturesFor(catalog,state.region,state.pref,'environment',s);
  $('selected-name').textContent=s.name;$('selected-scientific').innerHTML=`<em>${esc(s.scientific)}</em>${s.author?` <span class="taxon-author">${esc(s.author)}</span>`:''}`;$('selected-family').innerHTML=`${esc(s.familyJa)} / <span class="taxon-family">${esc(s.family)}</span>`;
  $('taxonomy-note').innerHTML=s.scientific!==s.catalogScientific?`本サイトでは <em>${esc(s.scientific)}</em> として扱います。JSCの表記：<em>${esc(s.catalogScientific)}</em>。`:'';
  $('taxonomy-note').hidden=s.scientific===s.catalogScientific;
  $('area').innerHTML=a.area==null?resultValue(a):`${resultValue(a)}<span>${unit()}</span>`;
  $('recorded-count').innerHTML=`${allprefs.filter(id=>s.records[id]).length}<span>県</span>`;
  renderRecordAreas(allprefs,s);renderHabitats();renderRuleAudit();
  $('rule-count').innerHTML=`${s.mappedEnvironmentCount}<span>/ ${s.environmentCount} 環境</span>`;
  $('rule-status').textContent=s.environmentCount?'登録環境のうち、現在の条件で計算した数':'生息環境の情報は未収録';
  const available=effective(selected,{...state,excludedClasses:[]}).classes;
  $('rule-tags').innerHTML=available.map(c=>`<button type="button" class="landcover-toggle" data-cover="${c}" aria-pressed="${s.classes.includes(c)}"><span class="cover-mark" aria-hidden="true">${s.classes.includes(c)?'✓':'−'}</span>${esc(catalog.classes[c])}</button>`).join('')||`<span class="tag gray">${s.publicationHoldCount?'選択中の環境は計算を保留しています':'対応する土地被覆を判定できません'}</span>`;
  $('landcover-status').textContent=available.length?`${s.classes.length} / ${available.length}種類を使用`:'対象の土地被覆がありません';
  $('reset-landcover').disabled=!state.excludedClasses.length;renderLandcoverNotice();
  $('pending-note').textContent=s.pending.length?`保留・未評価：${s.pending.join('、')}。`:'';
  $('coverage-note').textContent=`${scopeLabel()}。集計対象 ${int.format(a.meshes)}メッシュ、土地被覆の未分類 ${fmt(a.missing)} ${unit()}。県境をまたぐ区画は所属県ごとに集計しています。`;
  if(a.excludedHabitats?.length)$('coverage-note').textContent+=' 計算対象外の環境：'+a.excludedHabitats.join('、')+'。';
  if(a.geography?.unresolved.length)$('coverage-note').textContent+=' 範囲未対応で除外：'+a.geography.unresolved.join('、')+'。';
  if(spatial){if(state.model==='elevation')$('coverage-note').textContent+=` 標高欠損 ${fmt(a.elevationMissing)} ${unit()}。`;}$('distance').disabled=state.model==='cover';updateCompareButton();
}
function updateCompareButton(){const included=comparison.includes(selected.id);$('add-compare').textContent=included?'比較から外す':'比較に追加';$('add-compare').setAttribute('aria-pressed',String(included));$('compare-count').textContent=comparison.length;}
function landcoverNote(){return state.excludedClasses.length?'土地被覆から除外：'+state.excludedClasses.map(c=>catalog.classes[c]).join('・'):'';}
function renderLandcoverNotice(){
  $('landcover-adjustment').hidden=!state.excludedClasses.length||['guide','methods','updates'].includes(view);
  $('landcover-adjustment-text').textContent=landcoverNote()+'。比較・出力にも適用中。';
}
function applyLandcoverFilter(excluded,focusClass){
  state.excludedClasses=excludedClasses(excluded);geoController?.abort();map?.closePopup();renderSelected();renderCompare();renderExportScope();renderMap();saveURL();
  if(focusClass)$('rule-tags').querySelector(`[data-cover="${focusClass}"]`)?.focus({preventScroll:true});
}
function changeSpecies(id){const s=byId(id);if(!s||!searchableSpecies(s))return;selected=s;renderSearch();renderSelected();renderMap(true);renderGenus();saveURL();}
function toggleComparison(id){
  if(comparison.includes(id))comparison=comparison.filter(x=>x!==id);
  else if(comparison.length>=comparisonLimit){toast(`比較できるのは${comparisonLimit}種までです。先に種を外してください。`);return;}
  else comparison.push(id);
  updateCompareButton();renderCompare();saveURL();
}
function renderCompare(){
  if(view!=='compare')return;
  const series=comparison.map(byId).filter(Boolean).map(s=>effective(s)).map(s=>({s,a:summarize(catalog,s,state)})).sort((a,b)=>(b.a.area??-1)-(a.a.area??-1));
  const max=Math.max(0,...series.map(x=>x.a.area||0));
  $('comparison-chips').innerHTML=series.map(({s})=>`<span class="chip">${esc(s.name)}<button data-remove="${s.id}" aria-label="${esc(s.name)}を比較から外す">×</button></span>`).join('');
  $('comparison-scope').textContent=scopeLabel()+'。'+(state.scope==='recorded'?'対象の本土・島・県は種ごとに異なります。環境条件自体を比べるには「全地域の環境だけで比較」を選んでください。':'すべての種を同じ地域で比較します。既知の分布外も含む環境条件の比較です。');
  $('comparison-chart').innerHTML=series.map(({s,a},i)=>`<div class="bar-row"><div class="bar-name"><strong>${esc(s.name)}</strong><small>${esc(s.scientific)}</small></div><div class="bar-track" role="img" aria-label="${esc(s.name)} ${resultValue(a)}${a.area==null?'':' '+unit()}">${a.area>0?`<div class="bar-fill" style="width:${a.area/max*100}%;background:${['#147d85','#246d9c','#356088','#586da1','#667c9b','#4b898c','#286173','#536b72'][i%8]}"></div>`:''}</div><div class="bar-value">${resultValue(a)}${a.area==null?'':` <small>${unit()}</small>`}</div></div>`).join('')||'<p class="empty">種を追加すると、同じ条件で候補面積を比較できます。</p>';
  $('comparison-table').innerHTML=series.map(({s,a})=>`<tr><td>${esc(s.name)}<br><em>${esc(s.scientific)}</em></td><td>${resultValue(a)} ${a.area==null?'':unit()}</td><td>${a.prefs.length}</td><td>${spatial?'<p class="note">選択環境：'+esc(selectedRules(s,spatial.data.rules[s.id]||[],state).map(r=>r.label||r.id).join(' / ')||'未選択')+'</p>':''}${s.classes.length?s.classes.map(c=>`<div class="environment-row"><span>${esc(catalog.classes[c])}</span><span>${a.status==='no_scope'?'対象県なし':fmt(a.areas[c])+' '+unit()}</span></div>`).join(''):resultValue(a)}</td><td>${esc(s.pending.join('、')||'—')}</td></tr>`).join('');
  $('export-csv').disabled=!series.length;
}
function downloadFile(name,rows){const url=URL.createObjectURL(new Blob([csv(rows)],{type:'text/csv;charset=utf-8;'}));const link=document.createElement('a');link.href=url;link.download=name+'.csv';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
const csvHeader=['選択した生息環境','環境ID','和名','学名','JSC学名','環境','候補面積','面積単位','対象地域','分布条件','対象県数','評価状態','未評価条件','分類取得日','JSC版','土地被覆版','モデル','面積の定義','出典・利用条件','地域区分の注記','計算条件の限界','使用した土地被覆','除外した土地被覆'];
function exportRow(s,a,environment,area,region){return [spatial?selectedRules(s,spatial.data.rules[s.id]||[],state).map(r=>r.label||r.id).join(' / '):'すべて',spatial?selectedRules(s,spatial.data.rules[s.id]||[],state).map(r=>r.id).join(' / '):'',s.name,s.scientific,s.catalogScientific,environment,area==null?resultValue(a):(area*(state.unit==='ha'?100:1)).toFixed(3),unit(),region,state.scope==='recorded'?(spatial?.data.geography?'記録のある本土・島に限定':'記録県に限定'):'環境のみ',a.prefs.length,a.status,s.pending.join(' / '),catalog.date,catalog.jsc.version,catalog.landcover,spatial?SPATIAL_MODEL:MODEL,'収録範囲の該当画素。'+conditionLabel()+'。土地被覆の欠損等を除く。',PUBLIC_SOURCES+' / '+PUBLIC_LICENSES+' / '+HELD_LAYERS,a.geography?geographicNote(spatial?.data.geography,a.geography):'県全域',spatial?selectedRules(s,spatial.data.rules[s.id]||[],state).map(r=>r.label+'：'+(r.supported===false?'未評価・'+r.pending.join('、'):r.limitations.join('、'))).join(' / '):'',s.classes.map(c=>catalog.classes[c]).join(' / '),state.excludedClasses.map(c=>catalog.classes[c]).join(' / ')];}
function downloadCompare(){const rows=[csvHeader];for(const id of comparison){const s=effective(byId(id)),a=summarize(catalog,s,state);rows.push(exportRow(s,a,'合計',a.area,scopeLabel()));}downloadFile('spider-habitat-comparison-'+catalog.date,rows);}
function downloadEnvironment(ids){const rows=[csvHeader];for(const id of ids){const s=effective(byId(id)),a=summarize(catalog,s,state);rows.push(exportRow(s,a,'合計',a.area,scopeLabel()));for(const c of s.classes)rows.push(exportRow(s,a,catalog.classes[c],a.area==null?null:a.areas[c],scopeLabel()));}downloadFile('spider-habitat-environments-'+catalog.date,rows);}
function downloadPrefectures(){const rows=[csvHeader],ids=prefecturesFor(catalog,state.region,state.pref,'environment',selected);for(const p of ids){const a=summarize(catalog,selected,{...state,pref:String(p)});rows.push(exportRow(effective(selected),a,'合計',a.area,catalog.prefectures[p-1]));for(const c of effective(selected).classes)rows.push(exportRow(effective(selected),a,catalog.classes[c],a.area==null?null:a.areas[c],catalog.prefectures[p-1]));}downloadFile('spider-habitat-prefectures-'+catalog.date,rows);}
function renderExportScope(){$('export-scope').textContent=selected.name+' / '+scopeLabel()+' / '+unit();$('export-comparison').disabled=!comparison.length;$('export-geojson').disabled=!spatial||Boolean(geoController);}
function renderPicker(){const term=$('compare-search').value.normalize('NFKC').toLowerCase().trim(),genus=compareGenus,found=catalog.species.filter(s=>searchableSpecies(s)&&(!genus||s.genus===genus)&&searchIndex.get(s.id).includes(term));$('compare-options').innerHTML=found.slice(0,50).map(s=>`<button type="button" data-candidate="${s.id}"><span>${esc(s.name)}</span> <em>${esc(s.scientific)}</em></button>`).join('')+(found.length>50?'<p class="note">検索すると候補を絞れます。</p>':'');if(!found.length)$('compare-options').textContent='該当する種がありません。';}
function chooseCandidate(id){const s=byId(id);compareCandidate=s?.id;$('compare-add-button').disabled=!s;$('compare-choice').innerHTML=s?`${esc(s.name)} <em>${esc(s.scientific)}</em>`:'種を選択';$('compare-picker').open=false;}
function renderGenus(){
  const genera=[...new Set(catalog.species.filter(searchableSpecies).map(s=>s.genus))].sort();
  if(!genera.includes(compareGenus))compareGenus='';
  if(compareCandidate&&(!searchableSpecies(byId(compareCandidate))||(compareGenus&&byId(compareCandidate).genus!==compareGenus)))chooseCandidate(null);
  $('compare-genus-options').innerHTML='<button type="button" data-genus="">すべての属</button>'+genera.map(g=>`<button type="button" data-genus="${esc(g)}"><em>${esc(g)}</em></button>`).join('');
  $('compare-genus-choice').innerHTML=compareGenus?`<em>${esc(compareGenus)}</em>`:'すべての属';
}
function chooseGenus(genus){compareGenus=genus;renderGenus();chooseCandidate(null);renderPicker();$('compare-genus').open=false;}
async function ensureMap(){if(map)return map;if(!mapPromise)mapPromise=(async()=>{if(!window.L)await new Promise((resolve,reject)=>{const script=document.createElement('script');script.src='./vendor/leaflet/leaflet.js';script.onload=resolve;script.onerror=()=>{script.remove();reject(new Error('地図ライブラリを取得できません'));};document.head.append(script);});map=createHabitatMap(catalog,fmt,unit);return map;})().catch(e=>{mapPromise=null;throw e;});return mapPromise;}
function fitMap(){map?.fit();}
async function renderMap(fit=false){if(view!=='explore')return;try{const m=await ensureMap();if(view!=='explore'){m.suspend();return;}m.resize();await m.render({species:effective(selected),prefs:prefecturesFor(catalog,state.region,state.pref,state.scope,selected),fit,spatial,settings:{...state}});}catch(error){$('map-status').textContent='地図を読み込めませんでした。ページを再読み込みしてください。';console.error(error);}}
async function downloadGeoJSON(){
  if(!spatial||geoController)return;if(!map){toast('地図で保存する範囲を表示してから選んでください。');return;}
  const settings=structuredClone(state),species={...selected},prefs=prefecturesFor(catalog,state.region,state.pref,state.scope,selected),bounds=map.bounds();
  if(!prefs.length){toast('対象県がありません。');return;}
  geoController=new AbortController();$('export-geojson').disabled=true;$('cancel-geojson').hidden=false;$('geojson-status').textContent='候補区画を準備しています…';
  try{const result=await spatial.exportGeoJSON({prefs,bounds,species,settings,catalog,signal:geoController.signal,onProgress:(n,total)=>{$('geojson-status').textContent=`候補区画を処理中 ${n} / ${total}`;}});const content=JSON.stringify(result);if(content.length>64000000)throw new Error('出力が大きいため、地図を拡大してください。');const url=URL.createObjectURL(new Blob([content],{type:'application/geo+json'}));const a=document.createElement('a');a.href=url;a.download='spider-candidates-'+species.id+'-'+catalog.date+'.geojson';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);$('geojson-status').textContent=`${int.format(result.features.length)}区画を保存しました。`;}
  catch(error){$('geojson-status').textContent=error.name==='AbortError'?'出力を中止しました。':error.message;}
  finally{geoController=null;$('export-geojson').disabled=false;$('cancel-geojson').hidden=true;}
}
async function init(){
  try{
    catalog=typeof DecompressionStream==='function'?await readCompressed('./data/search.json.gz',{bytes:300000,decodedBytes:3000000}):await (await fetch('./data/search.json')).json();
    if(catalog.schema!==1||catalog.model!==MODEL||catalog.species.length>2500)throw new Error('分類データとモデルの版が一致しません');
    for(const s of catalog.species){if(!/^\d{1,5}$/.test(s.id)||!Array.isArray(s.classes)||s.classes.some(c=>!Number.isInteger(c)||c<1||c>15))throw new Error('分類データが不正です');searchIndex.set(s.id,[s.name,s.scientific,s.catalogScientific,s.family,s.familyJa,s.genus,...s.aliases].join(' ').normalize('NFKC').toLocaleLowerCase());}
    const capacity=comparisonCapacity(catalog.species);comparisonLimit=capacity.count;
    for(const node of document.querySelectorAll('[data-comparison-limit]'))node.textContent=String(comparisonLimit);
    $('comparison-limit').title=`収録データで最大の属 ${capacity.genus}（${capacity.count}種）を基準にしています`;
    const params=new URLSearchParams(location.search);state.excludedClasses=excludedClasses(params.get('excludeCover')||'');
    spatial=await loadSpatial();
    state.model=spatial?'distance':'cover';state.distance=[100,250,500].includes(Number(params.get('distance')))?Number(params.get('distance')):250;$('distance').value=state.distance;state.region=Object.keys(REGION_NAMES).includes(params.get('region'))?params.get('region'):'all';state.pref=/^(?:[1-9]|[1-3][0-9]|4[0-7])$/.test(params.get('pref')||'')?params.get('pref'):'';state.scope=params.get('scope')==='environment'?'environment':'recorded';
    selected=catalog.species.find(s=>s.id===params.get('species')&&s.environmentCount>0)||catalog.species.find(s=>s.name==='ワスレナグモ'&&s.environmentCount>0)||catalog.species.find(s=>effectiveSpeciesForSearch(s).classes.length);
    comparison=params.has('compare')?[...new Set(params.get('compare').split(',').filter(id=>byId(id)&&byId(id).environmentCount>0))].slice(0,comparisonLimit):[];
    if(spatial){
      for(const rules of Object.values(spatial.data.rules))for(const r of rules)r.label=r.label.replace(/[~〜]/g,'～');
      allHabitats=[...new Map(Object.values(spatial.data.rules).flat().map(r=>[r.id,r])).values()].filter(r=>r.id).sort((a,b)=>a.label.localeCompare(b.label,'ja'));
      const legacy=(params.get('habitats')||'').split(',').find(item=>item.split(':')[0]===selected.id)?.split(':')[1];
      const raw=params.has('habitat')?params.get('habitat'):legacy;
      habitatFilter=raw===undefined?null:raw.split('.').filter(id=>allHabitats.some(r=>r.id===id));
      state.habitats=habitatSelection(spatial.data.rules,habitatFilter);
      if(!searchableSpecies(selected))selected=catalog.species.find(searchableSpecies)||selected;
    }
    state.unit=params.get('unit')==='ha'?'ha':'km2';$('unit').value=state.unit;
    $('region').value=state.region;$('scope').value=state.scope;renderPrefs();$('boot').hidden=true;$('workspace').hidden=false;
    $('catalog-count').textContent=`生息環境登録 ${int.format(catalog.counts.habitat)} / ${int.format(catalog.counts.taxonomy)}種`;
    chooseCandidate(null);renderGenus();
    renderSearch();renderSelected();renderCompare();setView(views.includes(params.get('view'))?params.get('view'):'explore');
    document.addEventListener('click',event=>{const el=event.target.closest('button');if(!el)return;if(el.dataset.view)setView(el.dataset.view);if(el.dataset.species)changeSpecies(el.dataset.species);if(el.dataset.remove)toggleComparison(el.dataset.remove);if(el.dataset.candidate)chooseCandidate(el.dataset.candidate);});
    const resetSearch=()=>{shown=50;$('species-list').scrollTop=0;$('species-list').scrollLeft=0;renderSearch();};
    $('search').addEventListener('input',resetSearch);
    $('rule-tags').onclick=e=>{const button=e.target.closest('[data-cover]');if(!button)return;const c=Number(button.dataset.cover),next=new Set(state.excludedClasses);next.has(c)?next.delete(c):next.add(c);applyLandcoverFilter([...next],c);};
    $('reset-landcover').onclick=()=>applyLandcoverFilter([]);$('reset-common-landcover').onclick=()=>{applyLandcoverFilter([]);document.querySelector('.nav-button.active').focus();};
    $('species-list').addEventListener('scroll',()=>{const el=$('species-list'),horizontal=el.scrollWidth>el.clientWidth+10,near=horizontal?el.scrollLeft+el.clientWidth>el.scrollWidth-200:el.scrollTop+el.clientHeight>el.scrollHeight-200;if(near&&el.dataset.more==='true'){shown+=50;renderSearch();}},{passive:true});
    $('habitat-search').oninput=renderHabitats;
    $('rule-audit-search').oninput=renderRuleAudit;
    $('habitat-options').onchange=event=>{const input=event.target;if(input.type!=='checkbox')return;const next=new Set(habitatFilter||[]);input.checked?next.add(input.value):next.delete(input.value);applyHabitatFilter([...next]);};
    $('habitat-all').onclick=()=>applyHabitatFilter(null);
    $('habitat-current').onclick=()=>applyHabitatFilter((spatial.data.rules[selected.id]||[]).map(r=>r.id));
    for(const id of ['region','pref','scope','unit','distance'])$(id).addEventListener('change',()=>{state[id]=id==='distance'?Number($(id).value):$(id).value;if(id==='region'){state.pref='';renderPrefs();}map?.closePopup();renderGenus();renderPicker();renderSearch();renderSelected();renderCompare();renderExportScope();if(id!=='unit')renderMap(['region','pref','scope'].includes(id));saveURL();});
    $('add-compare').onclick=()=>{const exists=comparison.includes(selected.id);toggleComparison(selected.id);if(!exists&&comparison.includes(selected.id))toast('面積比較に追加しました');};
    $('compare-add-button').onclick=()=>{const id=compareCandidate;if(!id)return;if(comparison.includes(id))toast('この種は比較に入っています');else toggleComparison(id);};
    $('compare-genus-options').onclick=e=>{const button=e.target.closest('[data-genus]');if(button)chooseGenus(button.dataset.genus);};
    $('compare-current-genus').onclick=()=>{chooseGenus(selected.genus);$('compare-picker').open=true;};
    $('compare-add-genus').onclick=()=>{const genus=compareGenus;if(!genus){toast('比較する属を選んでください。');return;}const ids=catalog.species.filter(s=>s.genus===genus&&searchableSpecies(s)&&!comparison.includes(s.id)).map(s=>s.id);if(comparison.length+ids.length>comparisonLimit){toast(`${comparisonLimit}種を超えるため、比較中の種を外してから追加してください。`);$('compare-picker').open=true;return;}comparison.push(...ids);updateCompareButton();renderCompare();saveURL();};
    document.addEventListener('click',e=>{if(!$('compare-picker').contains(e.target)&&e.target!==$('compare-current-genus'))$('compare-picker').open=false;});
    for(const id of ['compare-picker','compare-genus','habitat-picker']){const picker=$(id);picker.addEventListener('keydown',e=>{if(e.key==='Escape'){picker.open=false;picker.querySelector('summary').focus();}});document.addEventListener('click',e=>{if(!picker.contains(e.target))picker.open=false;});}
    $('export-csv').onclick=downloadCompare;$('fit-map').onclick=fitMap;$('basemap').onchange=()=>map?.setBasemap($('basemap').value);
    $('export-geojson').onclick=downloadGeoJSON;$('cancel-geojson').onclick=()=>geoController?.abort();
    $('compare-search').oninput=renderPicker;$('export-selected').onclick=()=>downloadEnvironment([selected.id]);$('export-comparison').onclick=()=>downloadEnvironment(comparison);$('export-prefectures').onclick=downloadPrefectures;
  }catch(error){$('boot').hidden=false;$('boot').innerHTML='<p>初期データを読み込めませんでした。接続を確認して再読み込みしてください。</p><button id="retry-init" class="primary-button">再読み込み</button>';$('retry-init').onclick=()=>location.reload();console.error(error);}
}

async function initSlides(){
  if(slidesStarted)return;
  slidesStarted=true;
  try{const response=await fetch('./slides/manifest.json');if(!response.ok)return;const deck=await response.json();if(deck.pages!==20)return;
    let page=1;const show=()=>{$('presentation-slide').src=`./slides/page-${String(page).padStart(2,'0')}.png`;$('presentation-slide').alt=`発表資料 ${page}ページ目`;$('slide-page').textContent=`${page} / ${deck.pages}`;$('slide-rights-note').textContent=page===4?'引用図：右側の図は国立環境研究所（2020）図1。一般的なSDMが出現記録と環境情報を結ぶのに対し、本研究は図鑑の環境条件と広域記録から候補地を作る点が異なります。':([6,9,10,11,12].includes(page)?'標高を使った研究結果の図は、Web配信条件の確認待ちのため掲載を保留しています。':'');$('slide-prev').disabled=page===1;$('slide-next').disabled=page===deck.pages;};
    $('slide-prev').onclick=()=>{if(page>1){page--;show();}};$('slide-next').onclick=()=>{if(page<deck.pages){page++;show();}};$('presentation').hidden=false;show();
  }catch(error){console.error('発表資料を読み込めませんでした',error);}
}
init();
