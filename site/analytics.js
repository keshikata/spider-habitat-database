// Only the public site contributes to the shared counter. Local and release previews do not.
const publicOrigin='https://spider-habitat-atlas.pages.dev';
const optedOut=()=>navigator.globalPrivacyControl===true||navigator.doNotTrack==='1'||window.doNotTrack==='1';
if(location.origin===publicOrigin&&!optedOut()){
  const load=()=>{
    if(optedOut()||document.querySelector('script[data-cf-beacon]'))return;
    const script=document.createElement('script');
    script.type='module';script.src='https://static.cloudflareinsights.com/beacon.min.js';
    script.referrerPolicy='no-referrer';
    // Changing a species or filter is not a new page visit.
    script.dataset.cfBeacon=JSON.stringify({token:'6d2135473aab458da660b1474e66d3e3',spa:false});
    document.head.append(script);
  };
  if(document.readyState==='complete')load();
  else window.addEventListener('load',load,{once:true});
}
