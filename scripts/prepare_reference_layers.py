"""Copy licensed GHF reference subsets into the ignored local workspace.

GHF is read-only. Input hashes and upstream license evidence accompany derivatives.
Vegetation classes are exact legend matches, never Japanese plant-name substrings.
"""
import argparse, hashlib, json, re, urllib.request, zipfile
from pathlib import Path
import geopandas as gpd
import pandas as pd
from build_data import ROOT
from build_spatial import write

ITEMS=['ceb726273cc94ccfb4fc9eab9e6d244a','bc367787e89d42ba93b96c1535047ba0','9a6efc6acf0d4abb8d83fc25a1ae58b8','490a48eaae6d464f8feacc50ad5bf6e5','0d209199d8a2446cb88b805cc21844dc','10e54c08de264b3b84d79e1083bc4597','7ec6e383cb294d80888bf08610f4b0f2','5eaab78b57af4614be9c12b0f32e1b55']
VEGETATION_NAMES={1:'果樹園',2:'植林地',3:'牧草地',4:'ハイマツ群落',5:'低木群落'}
def vegetation_group(label):
    if label in ['果樹園','常緑果樹園']:return 1
    if '植林' in label:return 2
    if label=='牧草地':return 3
    if label in ['コケモモ－ハイマツ群集','イソツツジ－ハイマツ群集','ダケカンバ－ハイマツ群落','ハイマツ群落','ハイマツ疎生群落（山火跡地）']:return 4
    if label in ['低木群落','落葉広葉低木群落']:return 5
    return 0
def fingerprint(p):
    h=hashlib.sha256()
    with p.open('rb') as f:
        for chunk in iter(lambda:f.read(8*1024*1024),b''):h.update(chunk)
    return {'file':p.name,'bytes':p.stat().st_size,'sha256':h.hexdigest()}
def build(args):
    args.out.mkdir(parents=True,exist_ok=True)
    saved=args.out/'vegetation-license.json'
    evidence=json.loads(saved.read_text(encoding='utf8'))['items'] if saved.exists() else []
    for item in ([] if evidence else ITEMS):
        url=f'https://www.arcgis.com/sharing/rest/content/items/{item}?f=json'
        data=json.load(urllib.request.urlopen(url,timeout=60))
        license=data.get('licenseInfo','')
        if 'creativecommons.org/licenses/by/4.0' not in license:raise ValueError(f'Vegetation license not verified: {item}: {license}')
        evidence.append({'title':data['title'],'url':f'https://geoportal.env.go.jp/datasets/{item}_0/about','license':license})
    write(args.out/'vegetation-license.json',{'checked':'2026-10-08','items':evidence})
    print('Verified CC BY 4.0 on all eight upstream vegetation datasets',flush=True)
    inputs=[];inventories={}
    for p in sorted((args.ghf/'data/processed/vectors').glob('*/vegetation.gpkg')):
        out=args.out/(p.parent.name+'-vegetation.fgb')
        info=fingerprint(p);inputs.append({**info,'region':p.parent.name,'role':'GHF processed vegetation; legend_nm retained'})
        if out.exists():continue
        frame=gpd.read_file(p,columns=['legend_nm'],where="legend_nm LIKE '%植林%' OR legend_nm IN ('果樹園','常緑果樹園','牧草地','コケモモ－ハイマツ群集','イソツツジ－ハイマツ群集','ダケカンバ－ハイマツ群落','ハイマツ群落','ハイマツ疎生群落（山火跡地）','低木群落','落葉広葉低木群落')")
        frame['group']=frame.legend_nm.map(vegetation_group)
        assert (frame['group']>0).all()
        frame=frame.to_crs(4326);frame=frame[~frame.geometry.is_empty & frame.geometry.notna()]
        frame.to_file(out,driver='FlatGeobuf')
        inventories[p.parent.name]=frame.groupby(['group','legend_nm']).size().to_dict()
        print(json.dumps({'vegetation':p.parent.name,'features':len(frame)}),flush=True)
    rivers=[];invalid=0
    for p in sorted((args.ghf/'dl/reference_layers/rivers').glob('*.zip')):
        inputs.append({**fingerprint(p),'role':'W05 original river ZIP'})
        with zipfile.ZipFile(p) as z:shp=next(n for n in z.namelist() if n.endswith('_Stream.shp'))
        f=gpd.read_file(f'zip://{p.as_posix()}!{shp}',columns=['W05_003'],encoding='cp932',on_invalid='ignore')
        invalid+=int(f.geometry.isna().sum())
        if f.crs is None:f=f.set_crs(4612)
        # Lake sections (5–8) are not river proximity targets.
        f=f[f.W05_003.astype(str).isin(['1','2','3','4'])].to_crs(4326)
        rivers.append(f[['geometry']])
    frame=gpd.GeoDataFrame(pd.concat(rivers,ignore_index=True),crs=4326)
    frame=frame[~frame.geometry.is_empty & frame.geometry.notna()]
    frame.to_file(args.out/'rivers.fgb',driver='FlatGeobuf')
    write(args.out/'sources.json',{'checked':'2026-10-08','vegetation':evidence,'groups':VEGETATION_NAMES,
          'river':{'title':'国土数値情報 河川 W05 2006–2009','url':'https://nlftp.mlit.go.jp/ksj/gml/datalist/KsjTmplt-W05.html','license':'非商用・旧国土情報利用約款','licenseURL':'https://nlftp.mlit.go.jp/ksj/other/agreement_02.html','sections':[1,2,3,4],'features':len(frame),'invalidGeometriesExcluded':invalid},'inputs':inputs,
          'outputs':[fingerprint(p) for p in sorted(args.out.glob('*.fgb'))]})
    print('Reference subsets complete',flush=True)
if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--ghf',type=Path,required=True);p.add_argument('--out',type=Path,default=ROOT/'local/reference-layers');build(p.parse_args())
