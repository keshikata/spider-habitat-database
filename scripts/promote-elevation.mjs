import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {gunzipSync} from 'node:zlib';
import {publicationProfile,elevationApproval,ELEVATION_PUBLICATION_POLICY,PUBLIC_SOURCES,PUBLIC_LICENSES} from '../site/publication-policy.js';
import {refreshDeliveryMetadata} from './pack-spatial-delivery.mjs';
import {deliveryAssets,validateDelivery} from '../site/delivery.js';

// A human-verified approval record is the only release input. Pending records fail.
export function promoteElevation({source,destination,slidesSource,slidesDestination,approvalPath}){
  const record=JSON.parse(fs.readFileSync(approvalPath)),approval=elevationApproval(record);
  if(typeof record.receiptPath!=='string'||!fs.existsSync(record.receiptPath)||createHash('sha256').update(fs.readFileSync(record.receiptPath)).digest('hex')!==approval.receiptSHA256)throw new Error('The saved official approval differs from the verified receipt');
  const read=name=>JSON.parse(fs.readFileSync(path.join(source,name)));
  const summary=read('summary.json'),profile=publicationProfile(summary,{allowLocalPreview:true});
  if(!profile.preview)throw new Error('Only the prepared local elevation edition can be promoted');
  const manifest=read('manifest.json'),delivery=validateDelivery(read('delivery-manifest.json'));
  const manifestSHA=createHash('sha256').update(fs.readFileSync(path.join(source,'manifest.json'))).digest('hex');
  if(record.preparedManifestSHA256!==manifestSHA)throw new Error('Approval must be checked against the prepared input edition');
  for(const directory of [destination,slidesDestination])if(fs.existsSync(directory)&&fs.readdirSync(directory).length)throw new Error('Use new empty promotion directories');
  const infos=[...deliveryAssets(delivery,info=>{const b=fs.readFileSync(path.join(source,info.file));if(b.length!==info.bytes||createHash('sha256').update(b).digest('hex')!==info.sha256)throw new Error('Prepared query index differs');return JSON.parse(gunzipSync(b,{maxOutputLength:info.decodedBytes}));}),manifest.overview,...manifest.tiles];
  const names=new Set(['manifest.json','delivery-manifest.json','geography.json.gz','geography-manifest.json',...infos.map(info=>info.file)]);
  for(const info of infos){
    if(path.basename(info.file)!==info.file)throw new Error('Invalid prepared filename');
    const bytes=fs.readFileSync(path.join(source,info.file));
    if(bytes.length!==info.bytes||createHash('sha256').update(bytes).digest('hex')!==info.sha256)throw new Error('Prepared asset differs');
  }
  const slides=JSON.parse(fs.readFileSync(path.join(slidesSource,'manifest.json')));
  if(slides.edition!=='web-elevation-ready-2026-10-13'||slides.pages!==20)throw new Error('Prepared figure edition differs');
  for(let n=1;n<=20;n++){
    const name=`page-${String(n).padStart(2,'0')}.png`,bytes=fs.readFileSync(path.join(slidesSource,name)),info=slides.files?.[name];
    if(!info||info.bytes!==bytes.length||info.sha256!==createHash('sha256').update(bytes).digest('hex'))throw new Error('Prepared figure differs');
  }
  // Validate the complete data and figure edition before producing any output.
  for(const directory of [destination,slidesDestination])fs.mkdirSync(directory,{recursive:true});
  for(const name of names)fs.copyFileSync(path.join(source,name),path.join(destination,name));
  const updated={...summary,localOnly:false,publicationPolicy:ELEVATION_PUBLICATION_POLICY,elevationApproval:approval,source:PUBLIC_SOURCES+'; '+approval.attribution+'（国土地理院 基盤地図情報 数値標高モデル10mを加工）',license:PUBLIC_LICENSES+'; 標高：国土地理院使用承認 '+approval.number};
  publicationProfile(updated);fs.writeFileSync(path.join(destination,'summary.json'),JSON.stringify(updated)+'\n');
  refreshDeliveryMetadata(destination);
  for(let n=1;n<=20;n++){
    const name=`page-${String(n).padStart(2,'0')}.png`,bytes=fs.readFileSync(path.join(slidesSource,name)),info=slides.files[name];
    fs.writeFileSync(path.join(slidesDestination,name),bytes);
  }
  fs.writeFileSync(path.join(slidesDestination,'manifest.json'),JSON.stringify({...slides,elevationApproval:approval})+'\n');
  return {number:approval.number,policy:updated.publicationPolicy,preparedManifestSHA256:manifestSHA};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const [source,destination,slidesSource,slidesDestination,approvalPath]=process.argv.slice(2);
  if(!approvalPath)throw new Error('Usage: promote-elevation.mjs prepared-data new-data prepared-slides new-slides verified-approval.json');
  console.log(promoteElevation({source,destination,slidesSource,slidesDestination,approvalPath}));
}
