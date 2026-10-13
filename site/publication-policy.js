// The scientific rule definitions are retained for search; held layers never
// contribute to the public map, area totals, or downloaded results.
export const PUBLICATION_POLICY='public-without-dem-coast-river-2026-10-09';
export const ELEVATION_PUBLICATION_POLICY='public-with-elevation-without-coast-river-2026-10-13';
export const ELEVATION_PREVIEW_POLICY='local-elevation-ready-2026-10-13';
export const ELEVATION_METHOD={id:'adjustable-altitude-proxy-2026-10-13',stepM:100,upperOpenM:3000,missingBucket:31,defaultThresholds:{lowlandMax:200,mountainMin:800},bands:[...Array.from({length:30},(_,i)=>i===0?'100m未満':`${i*100}m以上${(i+1)*100}m未満`),'3000m以上','標高欠損'],limitation:'平地・低山地・山地の記述を、利用者が選んだ標高帯で近似します。地形の分類や地域ごとの植生帯を判定した結果ではありません。'};
export const ELEVATION_OUTPUTS=['web_map','spatial_json','csv','geojson','presentation_figures'];
export const PUBLIC_SOURCES='JAXA HRLULC 2024JPN_v25.04 を加工（補助情報：農林水産省 筆ポリゴン2022年度、© OpenStreetMap contributors）; 国土数値情報 行政区域2025（国土交通省、CC BY 4.0）を加工; 環境省生物多様性センター 現存植生図2024（CC BY 4.0）を加工; Japan Spider Catalog (2026), ver. 2.0.7, https://japan-spider-catalog.pages.dev/ (accessed 2026-10-08) の分類・分布記録を本サイトで加工; 小野展嗣・緒方清人 (2018) 日本産クモ類生態図鑑 自然史と多様性、東海大学出版部; 分類対応：World Spider Catalog (2026), Natural History Museum Bern';
export const PUBLIC_LICENSES='JAXA https://earth.jaxa.jp/ja/data/policy/ ; 行政区域・植生 CC BY 4.0 https://creativecommons.org/licenses/by/4.0/ ; JSC 出典・加工表示 https://japan-spider-catalog.pages.dev/ ; WSC分類対応 CC BY-NC-SA 4.0 https://creativecommons.org/licenses/by-nc-sa/4.0/';
export const HELD_LAYERS='標高・海岸線距離・河川距離のデータは配布対象外';
export function elevationApproval(approval){
  if(!approval||approval.status!=='approved'||approval.authority!=='国土地理院'||approval.article!==30||typeof approval.number!=='string'||!approval.number.trim()||approval.number.length>100||/[<>\r\n]/.test(approval.number)||!/^\d{4}-\d{2}-\d{2}$/.test(approval.issuedOn||'')||approval.site!=='https://spider-habitat-atlas.pages.dev/'||!/^[a-f0-9]{64}$/.test(approval.receiptSHA256||'')||!Array.isArray(approval.outputs)||!ELEVATION_OUTPUTS.every(v=>approval.outputs.includes(v))||typeof approval.attribution!=='string'||!approval.attribution.includes(approval.number)||approval.attribution.length>1000)throw new Error('標高の公開承認と対象範囲を確認してください');
  return {status:'approved',authority:approval.authority,article:30,number:approval.number,issuedOn:approval.issuedOn,site:approval.site,receiptSHA256:approval.receiptSHA256,outputs:ELEVATION_OUTPUTS.slice(),attribution:approval.attribution};
}
export function publicationProfile(data,{allowLocalPreview=false}={}){
  if(data.dem===false&&data.localOnly===false&&data.publicationPolicy===PUBLICATION_POLICY)return {elevation:false,preview:false,policy:PUBLICATION_POLICY};
  const preview=allowLocalPreview&&data.dem===true&&data.localOnly===true&&data.publicationPolicy===ELEVATION_PREVIEW_POLICY;
  if(!preview&&!(data.dem===true&&data.localOnly===false&&data.publicationPolicy===ELEVATION_PUBLICATION_POLICY))throw new Error('配信用データの公開条件が不正です');
  if(data.schema!==6||data.strata!==1572864*32||data.elevationStepM!==100||JSON.stringify(data.elevationMethod)!==JSON.stringify(ELEVATION_METHOD)||JSON.stringify(data.elevationBands)!==JSON.stringify(ELEVATION_METHOD.bands)||data.elevationFilter!=='required')throw new Error('標高の判定方法が一致しません');
  const approval=preview?null:elevationApproval(data.elevationApproval);
  return {elevation:true,preview,policy:data.publicationPolicy,approval};
}
export function heldLayers(profile){return profile?.elevation?'海岸線距離・河川距離のデータは配布対象外':HELD_LAYERS;}
export function requiresElevation(rule){
  return Array.isArray(rule.elevation)&&![0,1,2,3].every(band=>rule.elevation.includes(band));
}
export function publicationRule(rule,profile={elevation:false}){
  const elevation=requiresElevation(rule)&&!profile.elevation;
  const distances=[...(rule.coast?['海岸線への距離']:[]),...(rule.river?['河川への距離']:[])];
  const held=[...(elevation?['標高条件']:[]),...distances];
  if(!held.length){
    if(profile.elevation&&requiresElevation(rule))return {...rule,elevationRequired:true,proxy:true,publicationHold:[],limitations:[...new Set([...(rule.limitations||[]).filter(v=>!v.startsWith('標高条件は未実装')),ELEVATION_METHOD.limitation])]};
    return {...rule,publicationHold:[]};
  }
  const reasons=[...(elevation?['標高条件を判定できないため計算を保留（標高データの利用条件も確認待ち）']:[]),...(distances.length?[distances.join('・')+'は配布条件の確認待ち']:[])];
  return {...rule,supported:false,classes:[],baseClasses:[],publicationHold:held,
    pending:[...new Set([...reasons,...(rule.pending||[])])],limitations:[...new Set([...reasons,...(rule.limitations||[]).filter(v=>!elevation||!v.startsWith('標高条件は未実装'))])]};
}
// Marginalize withheld dimensions. Their original values cannot be recovered
// from the public counts; the remaining dimensions retain their exact counts.
export function publicStratum(key,profile={elevation:false}){return key & ~(3072|196608|(profile.elevation?0:48));}
export function projectEntries(entries,profile){
  const sums=new Map();for(const [key,value] of entries){const k=publicStratum(Number(key),profile);sums.set(k,(sums.get(k)||0)+value);}
  return [...sums].sort((a,b)=>a[0]-b[0]);
}
export function projectFlat(flat,profile){
  const pairs=[];for(let i=0;i<flat.length;i+=2)pairs.push([flat[i],flat[i+1]]);
  return projectEntries(pairs,profile).flat();
}
