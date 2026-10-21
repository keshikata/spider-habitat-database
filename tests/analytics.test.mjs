import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';
const source=fs.readFileSync(new URL('../site/analytics.js',import.meta.url),'utf8');
function run({origin='https://spider-habitat-atlas.pages.dev',ready='complete',dnt,gpc,legacyDnt,existing=false}={}){
  const appended=[],listeners=[];
  const navigator={doNotTrack:dnt,globalPrivacyControl:gpc};
  const document={readyState:ready,querySelector:()=>existing,createElement:()=>({dataset:{}}),head:{append:s=>appended.push(s)}};
  const window={doNotTrack:legacyDnt,addEventListener:(event,fn,options)=>listeners.push({event,fn,options})};
  vm.runInNewContext(source,{location:{origin},navigator,document,window});return{appended,listeners,navigator};
}
test('analytics never loads on local, HTTP, unrelated or deployment-preview origins',()=>{
  for(const origin of ['http://127.0.0.1:5208','http://localhost:5187','http://spider-habitat-atlas.pages.dev','https://abc.spider-habitat-atlas.pages.dev','https://spider-habitat-atlas.pages.dev.evil.example','https://elsewhere.example']){const r=run({origin});assert.equal(r.appended.length,0,origin);assert.equal(r.listeners.length,0);}
});
test('browser privacy preferences prevent the analytics request',()=>{
  for(const options of [{dnt:'1'},{gpc:true},{legacyDnt:'1'}]){const r=run(options);assert.equal(r.appended.length,0);assert.equal(r.listeners.length,0);}
});
test('public analytics uses the declared vendor and does not count filter changes as page views',()=>{
  const {appended}=run();assert.equal(appended.length,1);const s=appended[0];
  assert.equal(s.src,'https://static.cloudflareinsights.com/beacon.min.js');assert.equal(s.type,'module');assert.equal(s.referrerPolicy,'no-referrer');
  const config=JSON.parse(s.dataset.cfBeacon);assert.equal(config.spa,false);assert.match(config.token,/^[a-f0-9]{32}$/);
});
test('analytics waits for page load and honours a privacy change while waiting',()=>{
  const r=run({ready:'loading'});assert.equal(r.appended.length,0);assert.equal(r.listeners.length,1);assert.equal(r.listeners[0].event,'load');assert.equal(r.listeners[0].options.once,true);
  r.navigator.doNotTrack='1';r.listeners[0].fn();assert.equal(r.appended.length,0);
  const enabled=run({ready:'interactive'});enabled.listeners[0].fn();assert.equal(enabled.appended.length,1);
});
test('an existing beacon is never installed twice',()=>assert.equal(run({existing:true}).appended.length,0));
