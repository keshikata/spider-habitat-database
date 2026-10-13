"""Local-only 100m altitude bins, exactly reconciled with the frozen spatial data.

All rasters are opened read-only. No coastline/river data enters this build.
The existing mainland/island row assignments are reused only after row parity.
"""
import argparse, collections, concurrent.futures, gzip, hashlib, json, time
from pathlib import Path
from build_data import ROOT, mesh_xy, pixel_area_km2
from build_spatial import task, write, STEP

BASE=1572864
MODEL='spatial-exploration-1.4.0'

def unpack(root,info):
    packed=(root/info['file']).read_bytes()
    if hashlib.sha256(packed).hexdigest()!=info['sha256']:raise ValueError('Frozen input hash mismatch')
    return json.loads(gzip.decompress(packed))

def pack(root,prefix,value,local_container=False):
    raw=json.dumps(value,ensure_ascii=False,separators=(',',':')).encode()
    encoded=gzip.compress(raw,compresslevel=6,mtime=0);digest=hashlib.sha256(encoded).hexdigest()
    # The combined geography file is a local build input. The public packer
    # splits its overview by prefecture and enforces the delivery limits there.
    if not local_container and (len(encoded)>25*1024*1024 or len(raw)>128000000):raise ValueError('Delivery budget exceeded')
    name=prefix+'-'+digest[:12]+'.json.gz';(root/name).write_bytes(encoded)
    return {'file':name,'bytes':len(encoded),'decodedBytes':len(raw),'sha256':digest}

def collapse(flat):
    result=collections.Counter()
    for key,count in zip(flat[::2],flat[1::2]):
        band,base=divmod(key,BASE)
        height=3 if band==31 else 0 if band<2 else 1 if band<8 else 2
        result[base+height*16]+=count
    return sorted(result.items())

def project_old(flat):
    counts=collections.Counter()
    for key,count in zip(flat[::2],flat[1::2]):counts[key & ~(3072|196608)]+=count
    return sorted(counts.items())

def build(args):
    args.out.mkdir(parents=True,exist_ok=True)
    original=json.loads((args.source/'summary.json').read_text(encoding='utf-8'))
    manifest=json.loads((args.source/'manifest.json').read_text(encoding='utf-8'))
    geography=json.loads(gzip.decompress((args.source/'geography.json.gz').read_bytes()))
    if geography['sourceManifestSHA256']!=hashlib.sha256((args.source/'manifest.json').read_bytes()).hexdigest():raise ValueError('Geography version mismatch')
    catalog=json.loads((ROOT/'site/data/catalog.json').read_text(encoding='utf-8'))
    for item in original['sources']:
        st=(args.rasters/item['region']/item['file']).stat()
        if (st.st_size,st.st_mtime_ns)!=(item['bytes'],item['mtimeNs']):raise ValueError('Frozen raster changed')
    code=(ROOT/'scripts/build_spatial.py').read_bytes()+Path(__file__).read_bytes()
    stamp=hashlib.sha256(code+(args.source/'manifest.json').read_bytes()+json.dumps(original['sources']).encode()).hexdigest()
    groups={}
    for region in catalog['regions']:
        cells=json.loads((ROOT/f'site/data/{region}.json').read_text(encoding='utf-8'))['cells']
        group=collections.defaultdict(list)
        for code,pref,counts in cells:
            x,y=mesh_xy(code);group[(x//STEP,y//STEP)].append((x,y,pref,counts))
        groups[region]=group
    jobs=[]
    for tile in manifest['tiles']:
        region,tx,ty=tile['id'].rsplit('-',2);tx=int(tx);ty=int(ty)
        jobs.append((region,tx,ty,groups[region][(tx,ty)],str(args.rasters),str(args.out),stamp,None,True,{'root':str(args.references),'prefs':catalog['regions'][region],'elevationStep':100,'excludeHeldDistances':True}))
    region_areas={rid:collections.Counter() for rid in geography['regions']}
    totals=collections.defaultdict(collections.Counter);meshes=collections.Counter();tiles=[];coarse=[];region_coarse=collections.defaultdict(collections.Counter)
    pixels=0;start=time.time()
    print(json.dumps({'tiles':len(jobs),'workers':args.workers,'altitudeStepM':100,'localOnly':True}),flush=True)
    with concurrent.futures.ProcessPoolExecutor(max_workers=args.workers) as pool:
        for i,result in enumerate(pool.map(task,jobs,chunksize=1)):
            old=unpack(args.source,manifest['tiles'][i]);new=unpack(args.out,result['info'])
            if len(old['cells'])!=len(new['cells']):raise ValueError('Row count changed')
            runs=geography['tiles'][result['info']['id']];current=0
            for j,(before,after) in enumerate(zip(old['cells'],new['cells'])):
                if before[:3]!=after[:3] or project_old(before[3])!=collapse(after[3]):raise ValueError('Native 200m/800m reconciliation failed: '+result['info']['id'])
                x,y,p,flat=after;pixels+=sum(flat[1::2])
                while current+1<len(runs) and runs[current+1][0]<=j:current+=1
                rid=str(runs[current][1])
                if rid=='0':continue
                if geography['regions'][rid]['pref']!=p:raise ValueError('Geographic assignment changed')
                area=pixel_area_km2((y+.5)/480)
                for k,count in zip(flat[::2],flat[1::2]):
                    region_areas[rid][k]+=count*area
                    region_coarse[(x//64*64,y//64*64,p,rid)][k]+=count
            tiles.append(result['info']);coarse+=result['coarse'];meshes.update(result['meshes'])
            for p,values in result['summary'].items():totals[p].update({int(k):v for k,v in values.items()})
            if (i+1)%25==0 or i+1==len(jobs):print(json.dumps({'done':i+1,'total':len(jobs),'seconds':round(time.time()-start),'nativeReconciliation':'passed'}),flush=True)
    overview=pack(args.out,'overview',{'schema':6,'step':64,'cells':coarse});overview['cells']=len(coarse)
    write(args.out/'manifest.json',{'schema':6,'model':MODEL,'tiles':tiles,'overview':overview})
    summary={p:{'meshes':meshes[p],'areas':dict(sorted(areas.items()))} for p,areas in totals.items()}
    write(args.out/'summary.json',{**original,'schema':6,'model':MODEL,'localOnly':True,'dem':True,'elevationStepM':100,'elevationUpperOpenM':3000,'elevationMissingBucket':31,'strata':BASE*32,'summary':summary,'cells':sum(meshes.values()),'method':'native-pixel altitude in 100m bands to 3000m; >=3000m open band; missing separate; exact 200m/800m reconciliation; coast/river axes absent'})
    for rid,region in geography['regions'].items():region['areas']=dict(sorted(region_areas[rid].items()))
    geography['sourceManifestSHA256']=hashlib.sha256((args.out/'manifest.json').read_bytes()).hexdigest()
    geography['overview']=[[x,y,p,[item for k,count in sorted(counts.items()) for item in (k,count)],int(rid)] for (x,y,p,rid),counts in sorted(region_coarse.items())]
    info=pack(args.out,'geography',geography,local_container=True)
    (args.out/info['file']).replace(args.out/'geography.json.gz')
    write(args.out/'geography-manifest.json',{'schema':1,**{k:v for k,v in info.items() if k!='file'},'sourceManifestSHA256':geography['sourceManifestSHA256']})
    write(args.out/'native-reconciliation.json',{'date':'2026-10-13','tiles':len(tiles),'rows':sum(meshes.values()),'pixels':pixels,'allNative200And800Bins':'exact','sourceManifestSHA256':hashlib.sha256((args.source/'manifest.json').read_bytes()).hexdigest(),'outputManifestSHA256':geography['sourceManifestSHA256'],'rasterStamp':stamp,'localOnly':True})
    print(json.dumps({'complete':True,'seconds':round(time.time()-start),'cells':sum(meshes.values()),'pixels':pixels}),flush=True)

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--source',type=Path,default=ROOT/'local/spatial-reference');p.add_argument('--out',type=Path,default=ROOT/'local/elevation-ready-2026-10-13');p.add_argument('--rasters',type=Path,required=True);p.add_argument('--references',type=Path,default=ROOT/'local/reference-layers');p.add_argument('--workers',type=int,default=4)
    build(p.parse_args())
