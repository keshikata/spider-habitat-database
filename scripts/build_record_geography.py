"""Classify preview quarter meshes by land component; preserve prefecture totals.

N03 prefecture polygons and JSC island representative points are read-only inputs.
The mask is a 250m approximation, not a replacement for the source coastline.
Unresolved island names never fall back to painting the whole prefecture.
"""
import argparse, collections, gzip, hashlib, json, math
from pathlib import Path
import geopandas as gpd
import numpy as np
from shapely import STRtree, points, box, prepare, intersects
from shapely.geometry import Point
from build_data import ROOT, pixel_area_km2

def build(args):
    manifest=json.loads((args.out/'manifest.json').read_text(encoding='utf-8'))
    strata=1572864 if manifest['schema']==5 else 65536 if manifest['schema']==4 else 4096 if manifest['schema']==3 else 1024
    catalog=json.loads((ROOT/'site/data/catalog.json').read_text(encoding='utf-8'))
    frame=gpd.read_file(args.boundaries).to_crs(4326)
    polygons=[];prefs=[];by_pref=collections.defaultdict(list)
    for _,row in frame.iterrows():
        pref=int(row.N03_007[:2]);geom=row.geometry
        for part in getattr(geom,'geoms',[geom]):
            if part.is_empty:continue
            by_pref[pref].append(len(polygons));polygons.append(part);prefs.append(pref)
    tree=STRtree(polygons)
    polygons_array=np.array(polygons,dtype=object);prepare(polygons_array)
    previous=json.loads(gzip.decompress(args.previous.read_bytes())) if args.previous else None
    if previous:island_rows=[]
    else:
        source=json.loads(args.islands.read_text(encoding='utf-8'))
        island_rows=[{k:source['dictionaries'][k][v] if isinstance(v,int) else v for k,v in zip(source['columns'],r)} for r in source['rows']]
    used=set(i for s in catalog['species'] for a in s.get('recordAreas',{}).values() for i in a['islands'])
    region_for_polygon={};regions={};island_ids={};mainland={};unresolved=[]
    def register(index,name):
        rid=str(index+1)
        if rid not in regions:regions[rid]={'pref':prefs[index],'names':[],'bounds':list(polygons[index].bounds),'areas':collections.Counter(),'meshes':0}
        if name not in regions[rid]['names']:regions[rid]['names'].append(name)
        region_for_polygon[index]=int(rid)
        return rid
    for pref,indices in by_pref.items():
        if pref!=47:mainland[str(pref)]=register(max(indices,key=lambda i:polygons[i].area),'本土')
    if previous:
        assert mainland==previous['mainland'],'The source land-component ordering changed'
        for rid,r in previous['regions'].items():
            index=int(rid)-1
            assert prefs[index]==r['pref'] and np.allclose(polygons[index].bounds,r['bounds'],atol=1e-9,rtol=0)
            for name in r['names']:register(index,name)
        island_ids=previous['islands']
    for row in island_rows:
        name=row['Island_jp']
        if name not in used:continue
        try:point=Point(float(row['Longitude']),float(row['Latitude']))
        except (ValueError,TypeError):unresolved.append(name);continue
        hits=list(tree.query(point,predicate='intersects'))
        # A point on a generalized coastline may sit just outside the N03 polygon.
        # Do not assign a nearby island by proximity alone.
        if len(hits)!=1 or str(int(hits[0])+1) in mainland.values():unresolved.append(name);continue
        island_ids[name]=register(int(hits[0]),name)
    unresolved=sorted(used-set(island_ids))
    manifest=json.loads((args.out/'manifest.json').read_text(encoding='utf-8'))
    all_runs={};coarse=collections.defaultdict(collections.Counter);coastal=0;ambiguous=0
    print(json.dumps({'stage':'assigning','polygons':len(polygons),'islands':len(island_ids),'unresolved':unresolved},ensure_ascii=False),flush=True)
    for i,tile in enumerate(manifest['tiles']):
        rows=json.loads(gzip.decompress((args.out/tile['file']).read_bytes()))['cells']
        coords=np.array([[100+(r[0]+.5)/320,(r[1]+.5)/480] for r in rows])
        centre_points=points(coords);hits=tree.query(centre_points)
        hit_mask=intersects(polygons_array[hits[1]],centre_points[hits[0]])
        hits=hits[:,hit_mask]
        assigned=np.zeros(len(rows),dtype=np.int32)
        for cell,poly in zip(*hits):
            if prefs[poly]==rows[cell][2]:assigned[cell]=region_for_polygon.get(int(poly),0)
        # Coast cells whose centres are offshore are attributed only when the
        # quarter mesh intersects exactly one named/mainland land component.
        no_centre=np.flatnonzero(assigned==0)
        for j in no_centre:
            x,y,p,_=rows[j];square=box(100+x/320,y/480,100+(x+1)/320,(y+1)/480)
            choices={int(k) for k in tree.query(square,predicate='intersects') if prefs[k]==p}
            if len(choices)==1:
                assigned[j]=region_for_polygon.get(choices.pop(),0)
                if assigned[j]:coastal+=1
            elif len(choices)>1:ambiguous+=1
        runs=[]
        for j,(row,rid) in enumerate(zip(rows,assigned)):
            if not runs or runs[-1][1]!=int(rid):runs.append([j,int(rid)])
            if not rid:continue
            x,y,p,flat=row;region=regions[str(rid)];region['meshes']+=1;pixel_area=pixel_area_km2((y+.5)/480)
            for k,n in zip(flat[::2],flat[1::2]):region['areas'][k]+=n*pixel_area;coarse[(x//64*64,y//64*64,p,int(rid))][k]+=n
        all_runs[tile['id']]=runs
        if (i+1)%100==0 or i+1==len(manifest['tiles']):print(json.dumps({'tiles':i+1,'total':len(manifest['tiles'])}),flush=True)
    for r in regions.values():r['areas']=({str(int(k)):float(a) for k,a in r['areas'].items() if a} if manifest['schema']>=4 else [r['areas'][k] for k in range(strata)])
    overview=[[x,y,p,[n for k,v in sorted(counts.items()) for n in (k,v)],rid] for (x,y,p,rid),counts in coarse.items()]
    value={'schema':1,'source':'国土数値情報 行政区域2025（CC BY 4.0） / Japan Spider Catalog 島嶼代表点',
           'method':'250m mesh land-component assignment; offshore centres use a single intersecting component; ambiguous boundary meshes excluded',
           'islands':island_ids,'mainland':mainland,'regions':regions,'tiles':all_runs,'unresolved':unresolved,'overview':overview,
           'coastalMeshes':coastal,'ambiguousMeshes':ambiguous,'sourceManifestSHA256':hashlib.sha256((args.out/'manifest.json').read_bytes()).hexdigest()}
    encoded=json.dumps(value,ensure_ascii=False,separators=(',',':')).encode()
    packed=gzip.compress(encoded,compresslevel=6,mtime=0)
    (args.out/'geography.json.gz').write_bytes(packed)
    info={'schema':1,'bytes':len(packed),'decodedBytes':len(encoded),'sha256':hashlib.sha256(packed).hexdigest(),'sourceManifestSHA256':value['sourceManifestSHA256']}
    (args.out/'geography-manifest.json').write_text(json.dumps(info)+'\n',encoding='utf-8')
    print(json.dumps({'complete':True,'decodedBytes':len(encoded),'bytes':(args.out/'geography.json.gz').stat().st_size,'regions':len(regions),'coastal':coastal,'ambiguous':ambiguous}),flush=True)

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--boundaries',required=True);source=p.add_mutually_exclusive_group(required=True);source.add_argument('--islands',type=Path);source.add_argument('--previous',type=Path);p.add_argument('--out',type=Path,default=ROOT/'local/spatial');build(p.parse_args())
