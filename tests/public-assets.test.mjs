import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {checkPublicPaths,verifyAssetDigest} from '../scripts/public-assets.mjs';
import {createHash} from 'node:crypto';

test('reviewed image verification rejects absent metadata and changed content',()=>{
  const buffer=Buffer.from('reviewed image'),info={bytes:buffer.length,sha256:createHash('sha256').update(buffer).digest('hex')};
  assert.throws(()=>verifyAssetDigest(buffer,undefined,'slide.png'),/Missing or invalid/);
  assert.throws(()=>verifyAssetDigest(buffer,{...info,sha256:'invalid'},'slide.png'),/Missing or invalid/);
  assert.throws(()=>verifyAssetDigest(Buffer.from('different image'),info,'slide.png'),/mismatch/);
  assert.doesNotThrow(()=>verifyAssetDigest(buffer,info,'slide.png'));
});

test('release tree rejects extra vendor files, missing assets and symbolic links',async t=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'spider-release-'));
  t.after(()=>fs.rm(root,{recursive:true,force:true}));
  const allowed=new Set(['index.html','vendor/library.js']);
  await fs.mkdir(path.join(root,'vendor'));await fs.writeFile(path.join(root,'index.html'),'page');
  assert.throws(()=>checkPublicPaths(root,allowed),/Missing public file/);
  await fs.writeFile(path.join(root,'vendor/library.js'),'script');
  assert.deepEqual(checkPublicPaths(root,allowed),['index.html','vendor/library.js']);
  await fs.writeFile(path.join(root,'vendor/private-notes.txt'),'not for release');
  assert.throws(()=>checkPublicPaths(root,allowed),/Unexpected public file/);
  await fs.unlink(path.join(root,'vendor/private-notes.txt'));
  await fs.symlink(path.join(root,'vendor'),path.join(root,'alias'),'junction');
  assert.throws(()=>checkPublicPaths(root,allowed),/Symbolic link/);
});

test('public caching has one policy per asset and only versioned spatial files are immutable',async()=>{
  const text=await fs.readFile(new URL('../site/_headers',import.meta.url),'utf8');
  const rules=[];let rule;
  for(const line of text.split(/\r?\n/)){if(line.startsWith('/')){rule={pattern:line,cache:[]};rules.push(rule);}else if(line.trim().startsWith('Cache-Control:'))rule.cache.push(line.trim().slice(14).trim());}
  function caches(url){return rules.filter(r=>new RegExp('^'+r.pattern.split('*').map(s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('.*')+'$').test(url)).flatMap(r=>r.cache);}
  assert.deepEqual(caches('/data/spatial/map-pref-1-abcdef123456.json.gz'),['public, max-age=31536000, immutable']);
  for(const url of ['/data/search.json.gz','/data/spatial/manifest.json','/data/spatial/delivery-manifest.json'])assert.deepEqual(caches(url),['public, max-age=0, must-revalidate']);
});
