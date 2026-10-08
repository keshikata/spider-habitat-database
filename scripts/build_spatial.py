"""Local-only 250m habitat strata, using native land-cover pixels and bounded EDT halos.

Outputs deliberately live outside site/. A public DEM-derived release needs its own
licensing decision. Source rasters are opened read-only. Resume by validated input stamp.
Requires numpy, scipy and rasterio in the operator's analysis environment.
"""
from __future__ import annotations
import argparse, collections, concurrent.futures, csv, gzip, hashlib, json, math, os, time
from pathlib import Path
import numpy as np
import rasterio
from rasterio.windows import Window
from scipy.ndimage import distance_transform_edt
from build_data import ROOT, mesh_xy, pixel_area_km2, resolve_name, norm, classify
from spatial_rules import spatial_rule

STEP = 16  # third-order cells per tile; each is divided into four on both axes
VERSION = 'spatial-exploration-1.0.0'

def write(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    temp = path.with_suffix(path.suffix + '.tmp')
    temp.write_text(json.dumps(value, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
    os.replace(temp, path)

def metres(lat):
    phi = math.radians(lat); a = 6378137.; e2 = 6.6943799901413165e-3
    q = 1 - e2 * math.sin(phi)**2
    return a*(1-e2)/q**1.5*math.pi/180/12000, a/q**.5*math.cos(phi)*math.pi/180/12000

def distance_bins(cover, target, sampling):
    # Without a target in the >500m halo, every core pixel is farther than 500m.
    if not np.any(cover == target):
        return np.full(cover.shape, 3, dtype=np.uint8)
    dist = distance_transform_edt(cover != target, sampling=sampling)
    return np.searchsorted([100., 250., 500.], dist, side='left').astype(np.uint8)

def task(job):
    region, tx, ty, mesh_rows, source_root, output, stamp = job
    tile_id = f'{region}-{tx}-{ty}'
    cache = Path(output)/'cache'/f'{tile_id}.json'
    if cache.exists():
        old = json.loads(cache.read_text(encoding='utf-8'))
        if old.get('stamp') == stamp:
            cached_file = Path(output)/old['info']['file']
            if cached_file.parent.resolve() != Path(output).resolve():
                raise ValueError('Cache path escapes output directory')
            if cached_file.is_file() and hashlib.sha256(cached_file.read_bytes()).hexdigest() == old['info']['sha256']:
                return old
    paths = Path(source_root)/region
    x0, y0 = tx*STEP, ty*STEP
    west, east, south, north = 100+x0/80, 100+(x0+STEP)/80, y0/120, (y0+STEP)/120
    sampling = metres((south+north)/2)
    halo = math.ceil(510/min(sampling)) + 2
    with rasterio.open(paths/'lulc_2024.tif') as lc, rasterio.open(paths/'dem_10m.tif') as dem:
        if lc.crs.to_epsg()!=4326 or dem.transform!=lc.transform or dem.shape!=lc.shape:
            raise ValueError('Raster alignment differs')
        dx, dy, origin_x, origin_y = lc.transform.a, -lc.transform.e, lc.transform.c, lc.transform.f
        if not math.isclose(dx,1/12000,abs_tol=1e-12) or not math.isclose(dy,1/12000,abs_tol=1e-12):
            raise ValueError('Unexpected raster pixel grid')
        c0=math.ceil((west-origin_x)/dx-.5-1e-7); c1=math.ceil((east-origin_x)/dx-.5-1e-7)
        r0=math.ceil((origin_y-north)/dy-.5-1e-7); r1=math.ceil((origin_y-south)/dy-.5-1e-7)
        win=Window(c0-halo,r0-halo,c1-c0+2*halo,r1-r0+2*halo)
        cover=lc.read(1,window=win,boundless=True,fill_value=0)
        if np.any(cover>15): raise ValueError('Unknown LULC class')
        wb=distance_bins(cover,1,sampling)[halo:-halo,halo:-halo]
        bb=distance_bins(cover,2,sampling)[halo:-halo,halo:-halo]
        core=cover[halo:-halo,halo:-halo]
        height=dem.read(1,window=Window(c0,r0,c1-c0,r1-r0),boundless=True,fill_value=-9999)
        eb=np.searchsorted([200.,800.],height,side='right').astype(np.uint8)
        eb[(~np.isfinite(height)) | (height == dem.nodata) | (height < -500) | (height > 9000)] = 3
        keys=core.astype(np.int32)*64+eb.astype(np.int32)*16+wb.astype(np.int32)*4+bb
        with rasterio.open(paths/'admin_code.tif') as admin:
            if admin.transform!=lc.transform or admin.shape!=lc.shape: raise ValueError('Admin alignment differs')
            admin_prefs=admin.read(1,window=Window(c0,r0,c1-c0,r1-r0),boundless=True,fill_value=0)//1000
    # Pixel centres are assigned to the original retained mesh, then its 250m child.
    xs=np.floor((origin_x+(np.arange(c0,c1)+.5)*dx-100)*320+1e-7).astype(np.int32)
    ys=np.floor((origin_y-(np.arange(r0,r1)+.5)*dy)*480+1e-7).astype(np.int32)
    local_x=xs-x0*4; local_y=ys-y0*4
    if local_x.min()<0 or local_x.max()>=STEP*4 or local_y.min()<0 or local_y.max()>=STEP*4:
        raise ValueError('Pixel to mesh registration failed')
    cell=(local_y[:,None]*(STEP*4)+local_x[None,:])
    pref_grid=np.zeros((STEP,STEP),dtype=np.int16)
    expected=np.zeros(16,dtype=np.int64)
    for mx,my,p,counts in mesh_rows:
        pref_grid[my-y0,mx-x0]=p; expected+=np.asarray(counts,dtype=np.int64)
    prefs=pref_grid[local_y[:,None]//4,local_x[None,:]//4]
    # Match the original administrative mask, including genuine class-0 missing pixels.
    keep=(prefs>0) & (admin_prefs==prefs)
    actual=np.bincount(core[keep],minlength=16)
    if not np.array_equal(actual,expected):
        raise ValueError(f'Original pixel parity failed {tile_id}: {actual.tolist()} != {expected.tolist()}')
    hist=np.bincount((cell[keep]*1024+keys[keep]),minlength=(STEP*4)**2*1024).reshape((-1,1024))
    cells=[]; summary={}; coarse={}; bounds={}; meshes=collections.Counter()
    for local in np.flatnonzero(hist.sum(axis=1)):
        cy,cx=divmod(int(local),STEP*4); p=int(pref_grid[cy//4,cx//4]); row=hist[local]
        codes=np.flatnonzero(row); flat=np.column_stack([codes,row[codes]]).ravel().tolist()
        gx,gy=x0*4+cx,y0*4+cy
        cells.append([gx,gy,p,flat]); meshes[str(p)]+=1
        ar=pixel_area_km2((gy+.5)/480)
        dest=summary.setdefault(str(p),np.zeros(1024)); dest[codes]+=row[codes]*ar
        co=coarse.setdefault(str(p),np.zeros(1024,dtype=np.int64)); co+=row
        b=bounds.setdefault(str(p),[gx,gy,gx+1,gy+1]); b[:]=[min(b[0],gx),min(b[1],gy),max(b[2],gx+1),max(b[3],gy+1)]
    raw=json.dumps({'schema':2,'step':1,'cells':cells},separators=(',',':')).encode()
    packed=gzip.compress(raw,compresslevel=6,mtime=0); digest=hashlib.sha256(packed).hexdigest()
    if len(packed)>2000000 or len(raw)>12000000: raise ValueError('Tile budget exceeded')
    name=tile_id+'-'+digest[:12]+'.json.gz'; (Path(output)/name).write_bytes(packed)
    info={'id':tile_id,'file':name,'bytes':len(packed),'decodedBytes':len(raw),'sha256':digest,'cells':len(cells),
          'bounds':[x0*4,y0*4,(x0+STEP)*4,(y0+STEP)*4],'prefs':sorted(map(int,summary))}
    result={'stamp':stamp,'info':info,'summary':{p:values.tolist() for p,values in summary.items()},'meshes':dict(meshes),'bounds':bounds,
            'coarse':[[x0*4,y0*4,int(p),np.column_stack([np.flatnonzero(v),v[v>0]]).ravel().tolist()] for p,v in coarse.items()]}
    write(cache,result)
    return result

def build(args):
    catalog=json.loads((ROOT/'site/data/catalog.json').read_text(encoding='utf-8'))
    rules={}
    byname={s['catalogScientific']:s for s in catalog['species']}
    cross={r['sourceName']:r for r in json.loads((ROOT/'site/data/taxonomy-crosswalk.json').read_text(encoding='utf-8'))['rows']}
    with (args.habitat/'Spiceis habitat index.csv').open(encoding='utf-8-sig',newline='') as f:
        habitat_rows=list(csv.DictReader(f))
        ids={h:f'H{i+1:03d}' for i,h in enumerate(sorted({norm(r['habitat_text']) for r in habitat_rows}))}
        for row in habitat_rows:
            name=resolve_name(row['Scientific Name'],byname,cross)
            if name:
                text=norm(row['habitat_text'])
                rule={**spatial_rule(text),'id':ids[text],'label':text,'baseClasses':classify(text)['classes']}; rs=rules.setdefault(byname[name]['id'],[])
                if rule not in rs: rs.append(rule)
    output=args.out.resolve(); output.mkdir(parents=True,exist_ok=True)
    jobs=[]; sources=[]
    for region in catalog['regions']:
        if args.region and region not in args.region: continue
        entries=[]
        for n in ['lulc_2024.tif','dem_10m.tif','admin_code.tif']:
            p=args.rasters/region/n; st=p.stat(); entries.append([region,n,st.st_size,st.st_mtime_ns])
        sources+=entries
        retained=(ROOT/'site/data'/f'{region}.json').read_bytes()
        stamp=hashlib.sha256(json.dumps([VERSION,entries,hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),hashlib.sha256(retained).hexdigest()]).encode()).hexdigest()
        groups=collections.defaultdict(list)
        d=json.loads(retained)
        for code,p,counts in d['cells']:
            x,y=mesh_xy(code); groups[(x//STEP,y//STEP)].append((x,y,p,counts))
        for (tx,ty),rows in sorted(groups.items()):jobs.append((region,tx,ty,rows,str(args.rasters),str(output),stamp))
    print(json.dumps({'tiles':len(jobs),'workers':args.workers}),flush=True)
    summaries={str(p):np.zeros(1024) for p in range(1,48)}; meshes=collections.Counter(); coarse=[]; tiles=[]; bounds={}
    start=time.time()
    with concurrent.futures.ProcessPoolExecutor(max_workers=args.workers) as pool:
        for i,r in enumerate(pool.map(task,jobs,chunksize=1),1):
            tiles.append(r['info']); coarse+=r['coarse']; meshes.update(r['meshes'])
            for p,v in r['summary'].items(): summaries[p]+=np.asarray(v)
            for p,b in r['bounds'].items():
                prev=bounds.setdefault(p,b[:]);prev[:]=[min(prev[0],b[0]),min(prev[1],b[1]),max(prev[2],b[2]),max(prev[3],b[3])]
            if i%25==0 or i==len(jobs):print(json.dumps({'done':i,'total':len(jobs),'seconds':round(time.time()-start)}),flush=True)
    overview_raw=json.dumps({'schema':2,'step':STEP*4,'cells':coarse},separators=(',',':')).encode()
    overview_packed=gzip.compress(overview_raw,compresslevel=6,mtime=0)
    digest=hashlib.sha256(overview_packed).hexdigest(); filename='overview-'+digest[:12]+'.json.gz'
    (output/filename).write_bytes(overview_packed)
    manifest={'schema':2,'model':VERSION,'tiles':tiles,'overview':{'file':filename,'bytes':len(overview_packed),'decodedBytes':len(overview_raw),'sha256':digest,'cells':len(coarse)}}
    write(output/'manifest.json',manifest)
    write(output/'summary.json',{'schema':2,'model':VERSION,'date':'2026-10-08','localOnly':True,'dem':True,'distances':[100,250,500],
          'elevationBands':['200m未満','200–800m未満','800m以上','標高欠損'],'rules':rules,'bounds':bounds,
          'summary':{p:{'areas':v.tolist(),'meshes':meshes[p]} for p,v in summaries.items()},'cells':sum(meshes.values()),
          'method':'native-pixel-centre EDT, WGS84 local metric, >500m halo, 250m aggregation; retained parent meshes only',
          'sources':[{'region':r,'file':f,'bytes':b,'mtimeNs':t} for r,f,b,t in sources]})
    print(json.dumps({'complete':True,'cells':sum(meshes.values()),'tiles':len(tiles),'seconds':round(time.time()-start)}),flush=True)

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--rasters',type=Path,required=True);p.add_argument('--habitat',type=Path,required=True)
    p.add_argument('--out',type=Path,default=ROOT/'local/spatial');p.add_argument('--region',action='append');p.add_argument('--workers',type=int,default=4)
    build(p.parse_args())
