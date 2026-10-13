"""Resume after completed native tiles, verifying every tile against the source.

This does not recompute or alter the native tile counts. The combined geography
is a local intermediate; pack-spatial-delivery splits it before publication.
"""
import argparse, collections, gzip, hashlib, json, time
from pathlib import Path
from build_data import ROOT, pixel_area_km2
from build_elevation_ready import collapse, project_old, unpack, pack
from build_spatial import write

def finish(source, out):
    old_manifest=json.loads((source/'manifest.json').read_text(encoding='utf-8'))
    manifest=json.loads((out/'manifest.json').read_text(encoding='utf-8'))
    summary=json.loads((out/'summary.json').read_text(encoding='utf-8'))
    geography=json.loads(gzip.decompress((source/'geography.json.gz').read_bytes()))
    source_sha=hashlib.sha256((source/'manifest.json').read_bytes()).hexdigest()
    if geography['sourceManifestSHA256']!=source_sha or manifest['schema']!=6 or not summary['localOnly']:raise ValueError('Invalid resume inputs')
    if len(old_manifest['tiles'])!=len(manifest['tiles']):raise ValueError('Incomplete native build')
    regions={rid:collections.Counter() for rid in geography['regions']}
    overview=collections.defaultdict(collections.Counter)
    pixels=0;rows=0;stamp=None;start=time.time()
    for i,(before_info,after_info) in enumerate(zip(old_manifest['tiles'],manifest['tiles'])):
        if before_info['id']!=after_info['id']:raise ValueError('Tile order changed')
        cache=json.loads((out/'cache'/(after_info['id']+'.json')).read_text(encoding='utf-8'))
        if cache['info']!=after_info:raise ValueError('Completed tile differs from its cache')
        if stamp is None:stamp=cache['stamp']
        if stamp!=cache['stamp']:raise ValueError('Mixed native build versions')
        before=unpack(source,before_info)['cells'];after=unpack(out,after_info)['cells']
        if len(before)!=len(after):raise ValueError('Row count changed')
        runs=geography['tiles'][after_info['id']];current=0
        for j,(a,b) in enumerate(zip(before,after)):
            if a[:3]!=b[:3] or project_old(a[3])!=collapse(b[3]):raise ValueError('Native reconciliation failed')
            x,y,p,flat=b;pixels+=sum(flat[1::2]);rows+=1
            while current+1<len(runs) and runs[current+1][0]<=j:current+=1
            rid=str(runs[current][1])
            if rid=='0':continue
            if geography['regions'][rid]['pref']!=p:raise ValueError('Region assignment changed')
            area=pixel_area_km2((y+.5)/480)
            for k,count in zip(flat[::2],flat[1::2]):
                regions[rid][k]+=count*area;overview[(x//64*64,y//64*64,p,rid)][k]+=count
        if (i+1)%250==0:print(json.dumps({'verified':i+1,'total':len(manifest['tiles'])}),flush=True)
    if rows!=summary['cells']:raise ValueError('Summary row count differs')
    for rid,region in geography['regions'].items():region['areas']=dict(sorted(regions[rid].items()))
    geography['sourceManifestSHA256']=hashlib.sha256((out/'manifest.json').read_bytes()).hexdigest()
    geography['overview']=[[x,y,p,[item for k,count in sorted(counts.items()) for item in (k,count)],int(rid)] for (x,y,p,rid),counts in sorted(overview.items())]
    info=pack(out,'geography',geography,local_container=True)
    (out/info['file']).replace(out/'geography.json.gz')
    write(out/'geography-manifest.json',{'schema':1,**{k:v for k,v in info.items() if k!='file'},'sourceManifestSHA256':geography['sourceManifestSHA256']})
    record={'date':'2026-10-13','tiles':len(manifest['tiles']),'rows':rows,'pixels':pixels,'allNative200And800Bins':'exact','sourceManifestSHA256':source_sha,'outputManifestSHA256':geography['sourceManifestSHA256'],'rasterStamp':stamp,'localOnly':True}
    write(out/'native-reconciliation.json',record)
    print(json.dumps({'complete':True,'seconds':round(time.time()-start),'geography':info,**record}),flush=True)

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--source',type=Path,default=ROOT/'local/spatial-reference');p.add_argument('--out',type=Path,default=ROOT/'local/elevation-ready-2026-10-13');a=p.parse_args();finish(a.source,a.out)
