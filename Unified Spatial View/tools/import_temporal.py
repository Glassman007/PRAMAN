"""Preserve omitted source fields without changing the validated spatial bundle."""
import csv, hashlib, json, pathlib, sys
root=pathlib.Path(__file__).resolve().parents[1]
source=pathlib.Path(sys.argv[1])
f=source/'7 Authoritative_state/GEOMETRY_VERSIONS.csv'
rows=list(csv.DictReader(f.open(encoding='utf-8-sig')))
base=json.loads((root/'data/normalized-map.json').read_text())
assert {r['geometry_id'] for r in rows}=={g['id'] for g in base['geometryVersions']}
expected=next(m['sha256'] for m in base['metadata']['sourceManifest'] if m['table']=='GEOMETRY_VERSIONS')
assert hashlib.sha256(f.read_bytes()).hexdigest()==expected, 'Source differs from validated import'
result={'provenance':{'table':'GEOMETRY_VERSIONS','sha256':expected},'geometryDetails':[{ 'id':r['geometry_id'],'supersedesGeometryId':r['supersedes_geometry_id'] or None,'source':r['source_type'],'reason':r['change_reason']} for r in rows]}
(root/'data/temporal-details.json').write_text(json.dumps(result,indent=2)+'\n')
print('Preserved supersedes/source/reason for',len(rows),'geometry records; no geometry or authority changes.')
