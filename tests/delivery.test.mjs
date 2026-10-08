import test from 'node:test';
import assert from 'node:assert/strict';
import {validDeliveryInfo,validateDelivery,createDeliveryCache} from '../site/delivery.js';
const info=(prefix,bytes=10)=>({file:prefix+'-'+'a'.repeat(12)+'.json.gz',sha256:'a'.repeat(64),bytes,decodedBytes:bytes,cells:1});
test('delivery accepts only versioned same-origin filenames and bounded complete manifests',()=>{
  const d={schema:1,sourceManifestSHA256:'a'.repeat(64),summary:info('summary'),geography:info('geography-index'),prefectures:{},regions:{}};
  for(let p=1;p<=47;p++){d.prefectures[p]=info('map-pref-'+p);d.regions[p]=info('map-region-'+p);}
  assert.equal(validateDelivery(d),d);
  for(const file of ['https://example.com/x','../summary-aaaaaaaaaaaa.json.gz','summary-aaaaaaaaaaaa.json.gz?x','summary-aaaaaaaaaaaa.json.gz/other'])assert.equal(validDeliveryInfo({...d.summary,file},'summary'),false);
  assert.equal(validDeliveryInfo({...d.summary,decodedBytes:64000001},'summary'),false);delete d.regions[47];assert.throws(()=>validateDelivery(d));
});
test('decoded-size LRU evicts, retries failures and never caches cancelled data',async()=>{
  const calls=[],read=createDeliveryCache(async x=>{calls.push(x.file);return x.file;},20),a=info('a'),b=info('b'),c=info('c');
  await read(a);await read(b);await read(a);await read(c);await read(b);assert.deepEqual(calls,[a.file,b.file,c.file,b.file]);
  const controller=new AbortController();let n=0;
  const retry=createDeliveryCache(async()=>{n++;if(n===1){controller.abort();return 'cancelled';}return 'fresh';});
  await assert.rejects(retry(a,controller.signal),{name:'AbortError'});assert.equal(await retry(a),'fresh');assert.equal(n,2);
});
