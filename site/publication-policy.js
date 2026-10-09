// The scientific rule definitions are retained for search; held layers never
// contribute to the public map, area totals, or downloaded results.
export const PUBLICATION_POLICY='public-without-dem-coast-river-2026-10-09';
export const PUBLIC_SOURCES='JAXA HRLULC 2024JPN_v25.04 を加工（補助情報：農林水産省 筆ポリゴン2022年度、© OpenStreetMap contributors）; 国土数値情報 行政区域2025（国土交通省、CC BY 4.0）を加工; 環境省生物多様性センター 現存植生図2024（CC BY 4.0）を加工; Japan Spider Catalog (2026), ver. 2.0.7, https://japan-spider-catalog.pages.dev/ (accessed 2026-10-08) の分類・分布記録を本サイトで加工; 小野展嗣・緒方清人 (2018) 日本産クモ類生態図鑑 自然史と多様性、東海大学出版部; 分類対応：World Spider Catalog (2026), Natural History Museum Bern';
export const PUBLIC_LICENSES='JAXA https://earth.jaxa.jp/ja/data/policy/ ; 行政区域・植生 CC BY 4.0 https://creativecommons.org/licenses/by/4.0/ ; JSC 出典・加工表示 https://japan-spider-catalog.pages.dev/ ; WSC分類対応 CC BY-NC-SA 4.0 https://creativecommons.org/licenses/by-nc-sa/4.0/';
export const HELD_LAYERS='標高・海岸線距離・河川距離のデータは配布対象外';
export function requiresElevation(rule){
  return Array.isArray(rule.elevation)&&![0,1,2,3].every(band=>rule.elevation.includes(band));
}
export function publicationRule(rule){
  const elevation=requiresElevation(rule);
  const distances=[...(rule.coast?['海岸線への距離']:[]),...(rule.river?['河川への距離']:[])];
  const held=[...(elevation?['標高条件']:[]),...distances];
  if(!held.length)return {...rule,publicationHold:[]};
  const reasons=[...(elevation?['標高条件を判定できないため計算を保留（標高データの利用条件も確認待ち）']:[]),...(distances.length?[distances.join('・')+'は配布条件の確認待ち']:[])];
  return {...rule,supported:false,classes:[],baseClasses:[],publicationHold:held,
    pending:[...new Set([...reasons,...(rule.pending||[])])],limitations:[...new Set([...reasons,...(rule.limitations||[]).filter(v=>!elevation||!v.startsWith('標高条件は未実装'))])]};
}
// Marginalize withheld dimensions. Their original values cannot be recovered
// from the public counts; the remaining dimensions retain their exact counts.
export function publicStratum(key){return key & ~(48|3072|196608);}
export function projectEntries(entries){
  const sums=new Map();for(const [key,value] of entries){const k=publicStratum(Number(key));sums.set(k,(sums.get(k)||0)+value);}
  return [...sums].sort((a,b)=>a[0]-b[0]);
}
export function projectFlat(flat){
  const pairs=[];for(let i=0;i<flat.length;i+=2)pairs.push([flat[i],flat[i+1]]);
  return projectEntries(pairs).flat();
}
