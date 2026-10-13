import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import test from 'node:test';
import assert from 'node:assert/strict';
import {verifyElevationReadiness,ELEVATION_READINESS_INPUTS} from '../scripts/elevation-readiness.mjs';

test('readiness binds the tested files and required checks; changed or escaping inputs are rejected',()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'elevation-readiness-test-'));
  try{
    const bytes=Buffer.from('tested input'),sha=bytes=>createHash('sha256').update(bytes).digest('hex');
    for(const name of ELEVATION_READINESS_INPUTS){fs.mkdirSync(path.dirname(path.join(root,name)),{recursive:true});fs.writeFileSync(path.join(root,name),bytes);}
    const record={schema:1,status:'ready_for_approval',site:'https://spider-habitat-atlas.pages.dev/',preparedManifestSHA256:sha(bytes),checks:{browser:'passed',regression:'passed',nativeReconciliation:'passed',publicArtifact:'passed'},files:ELEVATION_READINESS_INPUTS.map(name=>({path:name,bytes:bytes.length,sha256:sha(bytes)}))};
    const write=value=>fs.writeFileSync(path.join(root,'readiness.json'),JSON.stringify(value));
    write(record);assert.equal(verifyElevationReadiness({root,recordPath:'readiness.json'}).files,ELEVATION_READINESS_INPUTS.length);
    const input=path.join(root,ELEVATION_READINESS_INPUTS[0]);fs.writeFileSync(input,'changed');assert.throws(()=>verifyElevationReadiness({root,recordPath:'readiness.json'}));fs.writeFileSync(input,bytes);
    for(const invalid of [{...record,checks:{...record.checks,browser:'pending'}},{...record,files:[{...record.files[0],path:'../input.json'}]},{...record,files:[record.files[0],record.files[0]]},{...record,files:record.files.slice(1)}]){write(invalid);assert.throws(()=>verifyElevationReadiness({root,recordPath:'readiness.json'}));}
  }finally{fs.rmSync(root,{recursive:true,force:true});}
});
