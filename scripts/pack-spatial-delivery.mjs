import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {gzipSync,gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {validateDelivery} from '../site/delivery.js';

// Repackage existing counts without changing any areas or geography assignments.
export function packSpatialDelivery(root){
  const read=name=>JSON.parse(fs.readFileSync(path.join(root,name)));
  const manifestBytes=fs.readFileSync(path.join(root,'manifest.json'));
  const manifest=JSON.parse(manifestBytes),geographyBytes=fs.readFileSync(path.join(root,'geography.json.gz')),geography=JSON.parse(gunzipSync(geographyBytes));
  const geographyInfo=read('geography-manifest.json');
  if(createHash('sha256').update(geographyBytes).digest('hex')!==geographyInfo.sha256)throw new Error('Geography digest mismatch');
  const sourceManifestSHA256=createHash('sha256').update(manifestBytes).digest('hex');
  if(geography.sourceManifestSHA256!==sourceManifestSHA256)throw new Error('Geography and map versions differ');
  const pack=(prefix,value)=>{
    const raw=Buffer.from(JSON.stringify(value)),packed=gzipSync(raw,{level:6}),sha256=createHash('sha256').update(packed).digest('hex');
    if(packed.length>25*1024*1024||raw.length>64000000)throw new Error(`${prefix} exceeds the delivery file limit`);
    const file=`${prefix}-${sha256.slice(0,12)}.json.gz`;
    fs.writeFileSync(path.join(root,file),packed);
    return {file,sha256,bytes:packed.length,decodedBytes:raw.length};
  };
  const summary=pack('summary',read('summary.json'));
  const {overview:regionRows,...index}=geography;
  const geographyIndex=pack('geography-index',index);
  if(!/^overview-[a-f0-9]{12}\.json\.gz$/.test(manifest.overview.file))throw new Error('Invalid overview path');
  const overviewBytes=fs.readFileSync(path.join(root,manifest.overview.file));
  if(createHash('sha256').update(overviewBytes).digest('hex')!==manifest.overview.sha256)throw new Error('Overview digest mismatch');
  const overview=JSON.parse(gunzipSync(overviewBytes));
  const prefectures={},regions={};
  for(let p=1;p<=47;p++){
    const cells=overview.cells.filter(r=>r[2]===p);
    prefectures[p]={...pack('map-pref-'+p,{schema:5,step:64,cells}),cells:cells.length};
    const rows=regionRows.filter(r=>r[2]===p);
    regions[p]={...pack('map-region-'+p,{schema:5,step:64,cells:rows}),cells:rows.length};
  }
  const result=validateDelivery({schema:1,sourceManifestSHA256,summary,geography:geographyIndex,prefectures,regions});
  // Publish the manifest last; every referenced file already exists and is immutable.
  const staging=path.join(root,'delivery-manifest.json.tmp');
  fs.writeFileSync(staging,JSON.stringify(result)+'\n');
  fs.renameSync(staging,path.join(root,'delivery-manifest.json'));
  return result;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const root=path.resolve(process.argv[2]||fileURLToPath(new URL('../local/spatial-reference/',import.meta.url)));
  const result=packSpatialDelivery(root);
  console.log(JSON.stringify({summaryBytes:result.summary.bytes,geographyIndexBytes:result.geography.bytes,maximumFileBytes:Math.max(result.summary.bytes,result.geography.bytes,...Object.values(result.prefectures).map(x=>x.bytes),...Object.values(result.regions).map(x=>x.bytes))}));
}
