const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),read=p=>fs.readFileSync(path.join(root,p),'utf8');
const svg=read('map/flat-svg.js'),app=read('app.js'),evidence=read('map/evidence-view.js'),temporal=read('map/temporal-view.js'),main=read('map/flat-main.js');
assert.match(svg,/buildFlatLayerModel\(data\)/,'flat map must render from the dataset-derived layer model');
assert.match(svg,/layerRecords=new Map/);assert.match(svg,/activeOrder\.includes\(id\).*record\.groups/s,'layer visibility must be controlled independently by each layer id');
assert.doesNotMatch(svg,/canonicalVisible.*source|source.*canonicalVisible/s,'source visibility must not depend on canonical visibility');
assert.match(svg,/const allBounds=unionBounds\(model\.allGeometries\)/,'initial fit must come from loaded spatial geometry');
assert.match(svg,/setSourceScope/);assert.match(svg,/No spatial records available for/,'zero-geometry layers need an accurate empty state');assert.match(svg,/flat-buildings/);assert.match(svg,/flat-source-layers/);assert.match(svg,/flat-canonical-boundaries/,'authoritative boundary must have its own top-line layer');assert.match(svg,/setEvidenceContextVisible/,'historical/event mode must be able to suspend current source/building context without changing toggles');
assert.match(app,/id:'buildings', name:'Building Footprints'/);assert.match(app,/configureEvidenceLayers:[\s\S]*buildings[\s\S]*families/);assert.match(app,/for\(const id of requested\)[\s\S]*state\.activeOrder\.push\(id\)/,'URL-requested dynamic source layers must be restored after evidence families are registered');
assert.match(evidence,/scope=flatMode\?'cells':'selected'/,'2D source layers should default to visible-cell scope');
assert.match(evidence,/if\(!flatMode\)\{for\(const \[pid\]/,'flat 2D mode must not redraw all source-family geometry through the comparison renderer');
assert.match(temporal,/renderer\.root\.visible=true/,'temporal geometry must remain independent of canonical visibility');
assert.match(temporal,/canonical&&currentShown\(\)/,'only current canonical ids may depend on canonical visibility');
for(const preserved of ['createCitySearch','createTemporalView','createEvidenceView'])assert(main.includes(preserved),`missing preserved workflow ${preserved}`);
console.log('2D layer wiring checks passed');

assert.doesNotMatch(read('map/flat-layer-model.js'),/Math\.random|random square|placeholder block|fake geometry/i,'2D layer model must not generate arbitrary geometry');assert.doesNotMatch(main,/city\/manifest\.json/,'production 2D entry must not depend on the old city manifest');

assert.match(svg,/svg\.append\(canonicalFillGroup,sourceLayerRoot,buildingGroup,temporalGroup,comparisonGroup,canonicalBoundaryGroup,sourceGroup,edgeGroup,issueGroup,selectionGroup\)/,'semantic painter order must keep source/building comparison visible while authoritative boundary, issues, and selection remain legible');
