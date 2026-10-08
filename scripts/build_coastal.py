"""Add coastline, forest-edge and paddy distances to native-pixel strata.

Original files remain read-only. Every tile is recalculated with a >500m halo
on the same pixel grid. All old strata must match after removing the three new
distance dimensions. Outputs stay local until reviewed.
"""
import argparse, collections, concurrent.futures, gzip, hashlib, json, time, zipfile
from pathlib import Path
import geopandas as gpd
import numpy as np
from shapely import STRtree, box
from build_spatial import task, write, metres, STEP
from build_data import ROOT, mesh_xy, pixel_area_km2
from spatial_rules import spatial_rule

VERSION='spatial-exploration-1.2.0'
STRATA=65536

def pack(out,name,value):
    raw=json.dumps(value,ensure_ascii=False,separators=(',',':')).encode()
    packed=gzip.compress(raw,compresslevel=6,mtime=0);digest=hashlib.sha256(packed).hexdigest()
    filename=name+'-'+digest[:12]+'.json.gz';(out/filename).write_bytes(packed)
    return {'file':filename,'bytes':len(packed),'decodedBytes':len(raw),'sha256':digest,'cells':len(value['cells'])}

def run(job):
    args,old_info,old_root=job
    old_raw=(Path(old_root)/old_info['file']).read_bytes()
    assert hashlib.sha256(old_raw).hexdigest()==old_info['sha256']
    old=json.loads(gzip.decompress(old_raw))['cells']
    if args[8]:
        result=task(args)
        rows=json.loads(gzip.decompress((Path(args[5])/result['info']['file']).read_bytes()))['cells']
        assert len(rows)==len(old)
        for row,previous in zip(rows,old):
            assert row[:3]==previous[:3]
            collapsed=collections.Counter()
            for key,count in zip(row[3][::2],row[3][1::2]):collapsed[key%1024]+=count
            assert dict(collapsed)==dict(zip(previous[3][::2],previous[3][1::2]))
        return result
    rows=[[x,y,p,[v+3072 if i%2==0 else v for i,v in enumerate(flat)]] for x,y,p,flat in old]
    cached=json.loads((Path(old_root)/'cache'/(old_info['id']+'.json')).read_text())
    assert cached['info']['sha256']==old_info['sha256']
    result={**cached,'stamp':args[6],'info':{**old_info,**pack(Path(args[5]),old_info['id'],{'schema':3,'step':1,'cells':rows})},
            'summary':{p:[0.]*3072+v for p,v in cached['summary'].items()},
            'coarse':[[x,y,p,[v+3072 if i%2==0 else v for i,v in enumerate(flat)]] for x,y,p,flat in cached['coarse']]}
    return result

def build(args):
    assert args.out.resolve()!=args.source.resolve(),'Use a separate output directory'
    args.out.mkdir(parents=True,exist_ok=True)
    manifest=json.loads((args.source/'manifest.json').read_text());summary=json.loads((args.source/'summary.json').read_text())
    source_info=json.loads((args.coast/'sources.json').read_text(encoding='utf-8'))
    lines=[]
    for info in source_info['files']:
        filename=args.coast/info['file'];assert hashlib.sha256(filename.read_bytes()).hexdigest()==info['sha256']
        with zipfile.ZipFile(filename) as z:shp=next(n for n in z.namelist() if n.endswith('.shp'))
        frame=gpd.read_file(f'zip://{filename.as_posix()}!{shp}')
        # C23-2006 specifies JGD2000 geographic coordinates; some ZIPs omit .prj.
        if frame.crs is None:frame=frame.set_crs(4612)
        frame=frame.to_crs(4326)
        lines.extend(g for g in frame.geometry if g is not None and not g.is_empty)
    tree=STRtree(lines)
    codehash=hashlib.sha256(Path(__file__).read_bytes()+(ROOT/'scripts/build_spatial.py').read_bytes()).hexdigest()
    stamp=hashlib.sha256(json.dumps([codehash,source_info,summary['sources']]).encode()).hexdigest()
    groups={}
    for region in {t['id'].split('-')[0] for t in manifest['tiles']}:
        groups[region]=collections.defaultdict(list)
        for code,p,counts in json.loads((ROOT/'site/data'/f'{region}.json').read_text())['cells']:
            x,y=mesh_xy(code);groups[region][(x//STEP,y//STEP)].append((x,y,p,counts))
    # The original stamp includes input sizes/mtimes. Require the same frozen rasters.
    for item in summary['sources']:
        st=(args.rasters/item['region']/item['file']).stat()
        assert (st.st_size,st.st_mtime_ns)==(item['bytes'],item['mtimeNs'])
    jobs=[];coastal=0
    for tile in manifest['tiles']:
        region,tx,ty=tile['id'].split('-');tx=int(tx);ty=int(ty)
        w,s,e,n=100+tx*STEP/80,ty*STEP/120,100+(tx+1)*STEP/80,(ty+1)*STEP/120
        dy,dx=metres((s+n)/2);pad=600/min(dy,dx)/12000
        selected=[lines[int(i)].wkb for i in tree.query(box(w-pad,s-pad,e+pad,n+pad),predicate='intersects')]
        coastal+=bool(selected)
        job=(region,tx,ty,groups[region][(tx,ty)],str(args.rasters),str(args.out),stamp,selected,True)
        jobs.append((job,tile,str(args.source)))
    print(json.dumps({'tiles':len(jobs),'coastalTiles':coastal,'lines':len(lines),'workers':args.workers}),flush=True)
    geo=json.loads(gzip.decompress((args.source/'geography.json.gz').read_bytes()))
    for r in geo['regions'].values():r['areas']=np.zeros(STRATA);r['meshes']=0
    geo_overview=collections.defaultdict(collections.Counter)
    totals={str(p):np.zeros(STRATA) for p in range(1,48)};tiles=[];coarse=[];meshes=collections.Counter();start=time.time()
    with concurrent.futures.ProcessPoolExecutor(max_workers=args.workers) as pool:
        for i,result in enumerate(pool.map(run,jobs,chunksize=1),1):
            tiles.append(result['info']);coarse+=result['coarse'];meshes.update(result['meshes'])
            for p,v in result['summary'].items():
                for k,a in v.items():totals[p][int(k)]+=a
            rows=json.loads(gzip.decompress((args.out/result['info']['file']).read_bytes()))['cells']
            runs=geo['tiles'][result['info']['id']];current=0
            for j,(x,y,p,flat) in enumerate(rows):
                while current+1<len(runs) and runs[current+1][0]<=j:current+=1
                rid=runs[current][1]
                if not rid:continue
                r=geo['regions'][str(rid)];assert r['pref']==p;r['meshes']+=1;area=pixel_area_km2((y+.5)/480)
                dest=geo_overview[(x//64*64,y//64*64,p,rid)]
                for k,count in zip(flat[::2],flat[1::2]):r['areas'][k]+=count*area;dest[k]+=count
            if i%50==0 or i==len(jobs):print(json.dumps({'done':i,'total':len(jobs),'seconds':round(time.time()-start)}),flush=True)
    overview=pack(args.out,'overview',{'schema':4,'step':64,'cells':coarse})
    write(args.out/'manifest.json',{'schema':4,'model':VERSION,'tiles':tiles,'overview':overview})
    rules={s:[{**r,**spatial_rule(r['label'])} for r in rs] for s,rs in summary['rules'].items()}
    write(args.out/'summary.json',{**summary,'schema':4,'areaEncoding':'sparse','model':VERSION,'coast':source_info,'rules':rules,
          'summary':{p:{'areas':{str(int(k)):float(v[k]) for k in np.flatnonzero(v)},'meshes':meshes[p]} for p,v in totals.items()},
          'method':summary['method']+'; C23-2006 coastline, forest edge and paddy proximity on native grid; independent distance bins'})
    for r in geo['regions'].values():r['areas']={str(int(k)):float(r['areas'][k]) for k in np.flatnonzero(r['areas'])}
    geo['overview']=[[x,y,p,[v for k,c in sorted(counts.items()) for v in (k,c)],rid] for (x,y,p,rid),counts in geo_overview.items()]
    geo['areaEncoding']='sparse'
    geo['sourceManifestSHA256']=hashlib.sha256((args.out/'manifest.json').read_bytes()).hexdigest()
    raw=json.dumps(geo,ensure_ascii=False,separators=(',',':')).encode();packed=gzip.compress(raw,compresslevel=6,mtime=0)
    (args.out/'geography.json.gz').write_bytes(packed)
    write(args.out/'geography-manifest.json',{'schema':1,'bytes':len(packed),'decodedBytes':len(raw),'sha256':hashlib.sha256(packed).hexdigest(),'sourceManifestSHA256':geo['sourceManifestSHA256']})
    print(json.dumps({'complete':True,'seconds':round(time.time()-start),'overview':overview,'geographyBytes':len(packed),'geographyDecoded':len(raw)}),flush=True)

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--source',type=Path,default=ROOT/'local/spatial');p.add_argument('--out',type=Path,default=ROOT/'local/spatial-compound');p.add_argument('--coast',type=Path,default=ROOT/'local/coast-source');p.add_argument('--rasters',type=Path,required=True);p.add_argument('--workers',type=int,default=4);build(p.parse_args())
