import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {APPLICATION_ASSETS,checkPublicPaths,verifyAssetDigest} from './public-assets.mjs';
import {validateDelivery} from '../site/delivery.js';
import {checkSharing} from './check-sharing.mjs';
import {PUBLICATION_POLICY,publicationRule} from '../site/publication-policy.js';

const root=path.resolve(process.argv[2]||'output/public-site');
const sharing=checkSharing(root);
const read=name=>JSON.parse(fs.readFileSync(path.join(root,name)));
const delivery=validateDelivery(read('data/spatial/delivery-manifest.json')),manifest=read('data/spatial/manifest.json');
const infos=[delivery.summary,delivery.geography,...Object.values(delivery.prefectures),...Object.values(delivery.regions),manifest.overview,...manifest.tiles];
const summary=JSON.parse(gunzipSync(fs.readFileSync(path.join(root,'data/spatial',delivery.summary.file)),{maxOutputLength:delivery.summary.decodedBytes}));
assert.equal(summary.publicationPolicy,PUBLICATION_POLICY);assert.equal(summary.dem,false);assert.equal(summary.localOnly,false);
assert.ok(Object.values(summary.rules).flat().every(r=>!r.supported||publicationRule(r).supported!==false),'A held condition must not be dropped from an evaluated habitat');
const allowed=new Set([...APPLICATION_ASSETS,'data/search.json','data/search.json.gz','data/taxonomy-crosswalk.json','data/spatial/manifest.json','data/spatial/delivery-manifest.json',...infos.map(i=>'data/spatial/'+i.file),'slides/manifest.json',...Array.from({length:20},(_,i)=>`slides/page-${String(i+1).padStart(2,'0')}.png`)]);
const files=checkPublicPaths(root,allowed),hash=bytes=>createHash('sha256').update(bytes).digest('hex');
assert.equal(hash(fs.readFileSync(path.join(root,'data/spatial/manifest.json'))),delivery.sourceManifestSHA256);
const infoByFile=new Map(infos.map(info=>['data/spatial/'+info.file,info]));
const slides=read('slides/manifest.json');
assert.equal(slides.edition,'web-rights-reviewed-2026-10-08');assert.equal(slides.pages,20);
let bytes=0,maxFileBytes=0;const fingerprint=createHash('sha256');
for(const name of files){
  const buffer=fs.readFileSync(path.join(root,name));bytes+=buffer.length;maxFileBytes=Math.max(maxFileBytes,buffer.length);
  assert.ok(buffer.length<=25*1024*1024,name+' exceeds hosting limit');
  const digest=hash(buffer),info=infoByFile.get(name)||slides.files?.[name.replace(/^slides\//,'')];
  if(info||/^slides\/page-\d{2}\.png$/.test(name))verifyAssetDigest(buffer,info,name);
  fingerprint.update(name+'\0'+digest+'\n');
  if(/\.(?:gz|json|html|js|css|svg|txt)$/.test(name)){
    const decoded=name.endsWith('.gz')?gunzipSync(buffer,{maxOutputLength:info?.decodedBytes||3000000}):buffer;
    if(info?.decodedBytes)assert.equal(decoded.length,info.decodedBytes,name+' decoded size');
    const text=decoded.toString('utf8');
    assert.ok(!/[A-Z]:[\\/]{1,2}Users[\\/]|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|日[髙高]\s*涼太/.test(text),name+' contains a private path, key or excluded name');
  }
}
assert.ok(files.length<=20000);
console.log(JSON.stringify({files:files.length,bytes,maxFileBytes,artifactSHA256:fingerprint.digest('hex'),allowlist:'passed',digests:'passed',privateText:'passed',sharing}));
