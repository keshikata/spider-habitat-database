import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {gunzipSync,gzipSync} from 'node:zlib';
import {createPreviewServer} from '../scripts/serve.mjs';
import {readCompressed} from '../site/map.js';

test('preview enforces origin, method and root boundaries, CSP, compression and revalidation',async t=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'spider-preview-test-')),root=path.join(dir,'site'),previewRoot=path.join(dir,'private');
  await fs.mkdir(root);await fs.mkdir(previewRoot);
  await fs.copyFile(new URL('../site/_headers',import.meta.url),path.join(root,'_headers'));
  await fs.writeFile(path.join(root,'index.html'),'<p>preview</p>');await fs.writeFile(path.join(dir,'outside.txt'),'private');
  await fs.writeFile(path.join(previewRoot,'summary.json'),'{}');await fs.writeFile(path.join(previewRoot,'notes.txt'),'private');
  const server=createPreviewServer({root,previewRoot,strictCSP:true});await new Promise(r=>server.listen(0,'127.0.0.1',r));
  t.after(async()=>{await new Promise(r=>server.close(r));await fs.rm(dir,{recursive:true,force:true});});
  const port=server.address().port;
  const request=(url='/',headers={},method='GET')=>new Promise((resolve,reject)=>{const req=http.request({hostname:'127.0.0.1',port,path:url,headers,method},res=>{const parts=[];res.on('data',b=>parts.push(b));res.on('end',()=>resolve({status:res.statusCode,headers:res.headers,body:Buffer.concat(parts)}));});req.on('error',reject);req.end();});
  const ok=await request('/',{'Accept-Encoding':'gzip'});assert.equal(ok.status,200);assert.equal(gunzipSync(ok.body).toString(),'<p>preview</p>');assert.equal(ok.headers['referrer-policy'],'no-referrer');assert.match(ok.headers['content-security-policy'],/style-src-elem 'self';/);assert.equal(ok.headers['access-control-allow-origin'],undefined);
  const cached=await request('/',{'Accept-Encoding':'gzip','If-None-Match':ok.headers.etag});assert.equal(cached.status,304);assert.equal(cached.body.length,0);
  assert.equal((await request('/',{},'HEAD')).body.length,0);assert.equal((await request('/',{'Accept-Encoding':'gzip;q=0'})).headers['content-encoding'],undefined);
  for(const [headers,status] of [[{Host:'attacker.example'},403],[{'Sec-Fetch-Site':'cross-site'},403],[{Origin:'https://attacker.example'},403],[{Origin:`http://127.0.0.1:${port}`},200]])assert.equal((await request('/',headers)).status,status);
  assert.equal((await request('/',{},'POST')).status,405);
  for(const url of ['/../outside.txt','/%2e%2e/outside.txt','/%2e%2e%5coutside.txt','/.git/config','/_headers','/preview-data/notes.txt','/preview-data/../../outside.txt','/preview-slides/page-21.png','/%00'])assert.equal((await request(url)).status,404,url);
  assert.equal((await request('/%zz')).status,400);assert.equal((await request('/'+'x'.repeat(8200))).status,414);assert.equal((await request('/preview-data/summary.json')).status,200);
  await fs.symlink(dir,path.join(root,'escape'),'junction');assert.equal((await request('/escape/outside.txt')).status,404);
});

test('compressed loader rejects tampering, expansion beyond limit and aborts',async t=>{
  const old=globalThis.fetch;t.after(()=>globalThis.fetch=old);
  const packed=gzipSync(Buffer.from(JSON.stringify({text:'a'.repeat(500)})));
  globalThis.fetch=async()=>new Response(packed);
  await assert.rejects(readCompressed('/data',{bytes:1000,decodedBytes:50}),/上限/);
  await assert.rejects(readCompressed('/data',{bytes:1000,decodedBytes:1000,sha256:'0'.repeat(64)}),/版が一致/);
  const controller=new AbortController();controller.abort();await assert.rejects(readCompressed('/data',{signal:controller.signal}),{name:'AbortError'});
  const later=new AbortController();globalThis.fetch=async()=>{queueMicrotask(()=>later.abort());return new Response(packed);};await assert.rejects(readCompressed('/data',{signal:later.signal}),{name:'AbortError'});
});
