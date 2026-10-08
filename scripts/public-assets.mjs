import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';

export function verifyAssetDigest(buffer,info,name){
  if(!info||!Number.isSafeInteger(info.bytes)||info.bytes<1||!/^[a-f0-9]{64}$/.test(info.sha256||''))throw new Error('Missing or invalid asset metadata: '+name);
  if(buffer.length!==info.bytes||createHash('sha256').update(buffer).digest('hex')!==info.sha256)throw new Error('Asset digest mismatch: '+name);
}

export const APPLICATION_ASSETS=[
  'index.html','style.css','app.js','model.js','map.js','spatial.js','spatial-model.js',
  'record-geography.js','habitat-selection.js','comparison.js','delivery.js','publication-policy.js','favicon.svg','ogp-2026-10-09.png','robots.txt','_headers',
  ...['leaflet.js','leaflet.css','LICENSE.txt',...['layers','layers-2x','marker-icon','marker-icon-2x','marker-shadow'].map(n=>'images/'+n+'.png')].map(n=>'vendor/leaflet/'+n),
];

export function checkPublicPaths(root,allowed){
  const files=[];
  function visit(dir){
    for(const entry of fs.readdirSync(dir,{withFileTypes:true})){
      const filename=path.join(dir,entry.name),relative=path.relative(root,filename).replaceAll('\\','/');
      if(entry.isSymbolicLink())throw new Error('Symbolic link in public output: '+relative);
      if(entry.isDirectory())visit(filename);
      else if(!entry.isFile()||!allowed.has(relative))throw new Error('Unexpected public file: '+relative);
      else files.push(relative);
    }
  }
  visit(root);
  for(const name of allowed)if(!files.includes(name))throw new Error('Missing public file: '+name);
  return files.sort();
}
