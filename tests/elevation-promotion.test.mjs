import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {gzipSync} from 'node:zlib';
import {preparePublicSpatial} from '../scripts/prepare-public-spatial.mjs';
import {promoteElevation} from '../scripts/promote-elevation.mjs';
import {publicationProfile,ELEVATION_OUTPUTS} from '../site/publication-policy.js';

test('promotion verifies the receipt and frozen input before writing, then retains only the approved fields',()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'elevation-promotion-test-'));
  try{
    const source=path.join(root,'native'),prepared=path.join(root,'prepared'),slides=path.join(root,'slides'),destination=path.join(root,'approved'),slidesDestination=path.join(root,'approved-slides');
    for(const dir of [source,slides])fs.mkdirSync(dir);
    const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
    const write=(name,value)=>fs.writeFileSync(path.join(source,name),JSON.stringify(value)+'\n');
    const packed=(prefix,value)=>{const raw=Buffer.from(JSON.stringify(value)),bytes=gzipSync(raw),hash=sha(bytes),file=prefix+'-'+hash.slice(0,12)+'.json.gz';fs.writeFileSync(path.join(source,file),bytes);return {file,bytes:bytes.length,decodedBytes:raw.length,sha256:hash};};
    const overview={...packed('overview',{schema:6,step:64,cells:[]}),cells:0};
    write('manifest.json',{schema:6,model:'spatial-exploration-1.4.0',tiles:[],overview});
    const manifestSHA=sha(fs.readFileSync(path.join(source,'manifest.json')));
    write('summary.json',{schema:6,model:'spatial-exploration-1.4.0',date:'2026-10-13',elevationStepM:100,rules:{},summary:{},bounds:{},cells:0});
    const geo=packed('geography',{schema:1,sourceManifestSHA256:manifestSHA,regions:{},tiles:{},mainland:{},islands:{},overview:[]});
    fs.renameSync(path.join(source,geo.file),path.join(source,'geography.json.gz'));write('geography-manifest.json',geo);
    preparePublicSpatial(source,prepared,{elevationPreview:true});
    const files={};for(let n=1;n<=20;n++){const name=`page-${String(n).padStart(2,'0')}.png`,bytes=Buffer.from('TEST ONLY FIGURE '+n);fs.writeFileSync(path.join(slides,name),bytes);files[name]={bytes:bytes.length,sha256:sha(bytes)};}
    fs.writeFileSync(path.join(slides,'manifest.json'),JSON.stringify({edition:'web-elevation-ready-2026-10-13',pages:20,demFigures:true,files}));
    const receiptPath=path.join(root,'test-only-receipt.txt');fs.writeFileSync(receiptPath,'TEST ONLY; THIS IS NOT AN APPROVAL');
    const record={status:'approved',authority:'国土地理院',article:30,number:'TEST-ONLY-001',issuedOn:'2026-10-13',site:'https://spider-habitat-atlas.pages.dev/',receiptPath,receiptSHA256:sha(fs.readFileSync(receiptPath)),preparedManifestSHA256:sha(fs.readFileSync(path.join(prepared,'manifest.json'))),outputs:ELEVATION_OUTPUTS,attribution:'TEST-ONLY-001 テスト専用',privateApplicant:'must not enter public data'};
    const approvalPath=path.join(root,'test-only-approval.json'),args={source:prepared,destination,slidesSource:slides,slidesDestination,approvalPath};
    for(const invalid of [{...record,status:'pending'},{...record,receiptSHA256:'0'.repeat(64)},{...record,preparedManifestSHA256:'0'.repeat(64)},{...record,outputs:['web_map']}]){
      fs.writeFileSync(approvalPath,JSON.stringify(invalid));assert.throws(()=>promoteElevation(args));assert.equal(fs.existsSync(destination),false);
    }
    fs.writeFileSync(approvalPath,JSON.stringify(record));
    const figurePath=path.join(slides,'page-06.png'),originalFigure=fs.readFileSync(figurePath);
    fs.writeFileSync(figurePath,'CHANGED FIGURE');assert.throws(()=>promoteElevation(args));assert.equal(fs.existsSync(destination),false);assert.equal(fs.existsSync(slidesDestination),false);
    fs.writeFileSync(figurePath,originalFigure);
    const delivery=JSON.parse(fs.readFileSync(path.join(prepared,'delivery-manifest.json'))),dataPath=path.join(prepared,delivery.summary.file),originalData=fs.readFileSync(dataPath);
    fs.writeFileSync(dataPath,'CHANGED DATA');assert.throws(()=>promoteElevation(args));assert.equal(fs.existsSync(destination),false);
    fs.writeFileSync(dataPath,originalData);promoteElevation(args);
    const approved=JSON.parse(fs.readFileSync(path.join(destination,'summary.json')));
    assert.equal(publicationProfile(approved).elevation,true);assert.equal(approved.localOnly,false);assert.equal(approved.elevationApproval.number,record.number);
    assert.ok(approved.source.includes(record.attribution));assert.ok(approved.license.includes(record.number));
    assert.equal(Object.hasOwn(approved.elevationApproval,'privateApplicant'),false);assert.equal(Object.hasOwn(approved.elevationApproval,'receiptPath'),false);
    assert.equal(JSON.parse(fs.readFileSync(path.join(slidesDestination,'manifest.json'))).elevationApproval.receiptSHA256,record.receiptSHA256);
  }finally{fs.rmSync(root,{recursive:true,force:true});}
});
