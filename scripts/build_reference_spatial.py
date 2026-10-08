"""Build native-pixel river/vegetation predicates, including prefecture borders."""
import argparse, collections, concurrent.futures, hashlib, json, time, zipfile
from pathlib import Path
import geopandas as gpd
import rasterio
from shapely import STRtree, box
from build_data import ROOT, mesh_xy
from build_spatial import task, write, metres, STEP
from build_coastal import pack
from spatial_rules import spatial_rule

VERSION='spatial-exploration-1.3.0'
STRATA=1572864
def build(args):
    args.out.mkdir(parents=True,exist_ok=True)
    old=json.loads((args.source/'summary.json').read_text(encoding='utf8'))
    catalog=json.loads((ROOT/'site/data/catalog.json').read_text(encoding='utf8'))
    coast_info=json.loads((args.coast/'sources.json').read_text(encoding='utf8'))
    references=json.loads((args.references/'sources.json').read_text(encoding='utf8'))
    border=json.loads(args.borders.read_text(encoding='utf8'))
    lines=[]
    for info in coast_info['files']:
        path=args.coast/info['file'];assert hashlib.sha256(path.read_bytes()).hexdigest()==info['sha256']
        with zipfile.ZipFile(path) as z:shp=next(n for n in z.namelist() if n.endswith('.shp'))
        frame=gpd.read_file(f'zip://{path.as_posix()}!{shp}')
        if frame.crs is None:frame=frame.set_crs(4612)
        lines.extend(g for g in frame.to_crs(4326).geometry if g is not None and not g.is_empty)
    tree=STRtree(lines)
    code=b''.join((ROOT/'scripts'/n).read_bytes() for n in ['build_reference_spatial.py','build_spatial.py'])
    stamp=hashlib.sha256(code+json.dumps([references,coast_info,old['sources'],border]).encode()).hexdigest()
    for item in old['sources']:
        st=(args.rasters/item['region']/item['file']).stat()
        assert (st.st_size,st.st_mtime_ns)==(item['bytes'],item['mtimeNs'])
    jobs=[]
    for region,prefs in catalog['regions'].items():
        groups=collections.defaultdict(list)
        for code,p,counts in json.loads((ROOT/'site/data'/f'{region}.json').read_text())['cells']:
            x,y=mesh_xy(code);groups[(x//STEP,y//STEP)].append((x,y,p,counts))
        with rasterio.open(args.rasters/region/'admin_code.tif') as ds:bounds=box(*ds.bounds)
        for code in border['cells']:
            x,y=mesh_xy(code)
            if bounds.intersects(box(100+x/80,y/120,100+(x+1)/80,(y+1)/120)):groups.setdefault((x//STEP,y//STEP),[])
        for (tx,ty),rows in sorted(groups.items()):
            w,s,e,n=100+tx*STEP/80,ty*STEP/120,100+(tx+1)*STEP/80,(ty+1)*STEP/120
            dy,dx=metres((s+n)/2);pad=600/min(dy,dx)/12000
            coast=[lines[int(i)].wkb for i in tree.query(box(w-pad,s-pad,e+pad,n+pad),predicate='intersects')]
            jobs.append((region,tx,ty,rows,str(args.rasters),str(args.out),stamp,coast,True,{'root':str(args.references),'prefs':prefs}))
    totals=collections.defaultdict(collections.Counter);meshes=collections.Counter();tiles=[];coarse=[];bounds={};start=time.time()
    print(json.dumps({'tiles':len(jobs),'workers':args.workers,'strata':STRATA}),flush=True)
    with concurrent.futures.ProcessPoolExecutor(max_workers=args.workers) as pool:
        for i,result in enumerate(pool.map(task,jobs,chunksize=1),1):
            if result['info']['cells']:
                tiles.append(result['info']);coarse+=result['coarse'];meshes.update(result['meshes'])
                for p,values in result['summary'].items():totals[p].update(values)
                for p,b in result['bounds'].items():
                    oldb=bounds.setdefault(p,b[:]);oldb[:]=[min(oldb[0],b[0]),min(oldb[1],b[1]),max(oldb[2],b[2]),max(oldb[3],b[3])]
            if i%50==0 or i==len(jobs):print(json.dumps({'done':i,'total':len(jobs),'seconds':round(time.time()-start)}),flush=True)
    overview=pack(args.out,'overview',{'schema':5,'step':64,'cells':coarse})
    write(args.out/'manifest.json',{'schema':5,'model':VERSION,'tiles':tiles,'overview':overview})
    rules={sid:[{**r,**spatial_rule(r['label'])} for r in rules] for sid,rules in old['rules'].items()}
    write(args.out/'summary.json',{**old,'schema':5,'model':VERSION,'references':references,'rules':rules,'bounds':bounds,'cells':sum(meshes.values()),
          'summary':{p:{'areas':dict(a),'meshes':meshes[p]} for p,a in totals.items()},
          'borderPolicy':'native pixels assigned once by administrative prefecture; shared quarter meshes retained',
          'method':'native pixel EDT with >500m halo; river sections 1–4; mapped vegetation predicates; per-prefecture quarter-mesh aggregation'})
    print(json.dumps({'complete':True,'seconds':round(time.time()-start),'cells':sum(meshes.values()),'overview':overview}),flush=True)
if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--source',type=Path,default=ROOT/'local/spatial-compound');p.add_argument('--out',type=Path,default=ROOT/'local/spatial-reference');p.add_argument('--coast',type=Path,default=ROOT/'local/coast-source');p.add_argument('--references',type=Path,default=ROOT/'local/reference-layers');p.add_argument('--rasters',type=Path,required=True);p.add_argument('--borders',type=Path,required=True);p.add_argument('--workers',type=int,default=4);build(p.parse_args())
