// Run with Node and Playwright installed: node tests/smoke.cjs
const {chromium} = require('playwright');
const assert = require('node:assert/strict');
const {pathToFileURL} = require('node:url');
const path = require('node:path');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_EXECUTABLE || undefined,args:['--no-sandbox',...(process.env.PRAMAN_SOFTWARE_GPU ? ['--no-zygote','--in-process-gpu','--ignore-gpu-blocklist','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] : [])]});
 const page=await browser.newPage({viewport:{width:1440,height:900}});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('requestfailed',r=>errors.push(r.url()));
 const url=process.env.PRAMAN_TEST_URL || 'http://127.0.0.1:8000/layer2/';
 await page.goto(url+'?mode=calibration&layers=canonical,survey,invalid&impact=1');
 assert.equal(await page.title(),'Unified Spatial View — Spatial Evidence');
 await page.waitForFunction(()=>window.PRAMAN_MAP && window.PRAMAN_SPATIAL_VIEW.getState().rendererReady);
 assert.equal(await page.locator('canvas').count(),1);
 assert(!(await page.locator('#mapEmptyPrompt').isVisible()));
 assert(await page.locator('[data-layer="satellite"]').isDisabled());
 assert(await page.locator('[data-layer="flood"]').isDisabled());
 await page.locator('#clearLayersButton').click();
 assert.equal(await page.locator('#railLayerCount').textContent(),'0');
 await page.locator('[data-layer="canonical"]').check();
 assert(!(await page.locator('#mapEmptyPrompt').isVisible()));
 await page.screenshot({path:path.resolve(__dirname,'../../stage2-test-scene.png'),fullPage:true});
 const checks=await page.evaluate(()=>{
  const api=window.PRAMAN_SPATIAL_VIEW;
  const parcels=Array.from({length:1000},(_,i)=>({id:`test-active-${i}`,is_active:true}));
  parcels.push({id:'test-retired',is_active:false});
  api.loadDataset({parcels,sources:[{parcel_id:parcels[0].id,source_id:'survey',id:'obs-a'},{parcel_id:parcels[0].id,source_id:'survey',id:'obs-b'}],conflicts:[{parcel_id:parcels[0].id,id:'issue-a',type:'First issue',layer_ids:['canonical']},{parcel_id:parcels[0].id,id:'issue-b',type:'Second issue',layer_ids:['canonical']}],history:[{parcel_id:parcels[0].id,date:'2025-01-01',event_type:'Later'},{parcel_id:parcels[0].id,date:'2024-01-01',event_type:'Earlier'}],documents:[{parcel_id:parcels[0].id,reference:'REF-TEST',source_name:'Test source'}]});
  const geometryMissing=api.getGeometry(parcels[0].id)===null;
  const noVisible=api.getVisibleParcelIds().length===0;
  const unknown=api.selectParcel('missing')===false;
  api.selectParcel(parcels[0].id,true);
  let rejected=0;
  for(const input of [{parcels:[parcels[0],parcels[0]]},{parcels:[{id:'missing-state'}]},{sources:[{parcel_id:'orphan'}]}]){
   try {api.loadDataset(input);}catch{rejected++;}
  }
  return {geometryMissing,noVisible,unknown,rejected,count:api.getData().parcels.length,selected:api.getState().selectedParcel};
 });
 assert.deepEqual(checks,{geometryMissing:true,noVisible:true,unknown:true,rejected:3,count:1001,selected:'test-active-0'});
 await page.locator('[data-tab="sources"]').click();assert.match(await page.locator('#panelContent').textContent(),/obs-a/);assert.match(await page.locator('#panelContent').textContent(),/obs-b/);
 await page.locator('[data-tab="conflicts"]').click();assert.match(await page.locator('#panelContent').textContent(),/First issue/);assert.match(await page.locator('#panelContent').textContent(),/Second issue/);
 await page.locator('[data-tab="history"]').click();assert.deepEqual(await page.locator('.timeline-title').allTextContents(),['Earlier','Later']);
 await page.locator('[data-tab="documents"]').click();assert.match(await page.locator('#panelContent').textContent(),/REF-TEST/);
 await page.keyboard.press('Escape');assert.equal(await page.locator('#parcelPanel').getAttribute('aria-hidden'),'true');
 await page.evaluate(()=>window.PRAMAN_SPATIAL_VIEW.loadDataset({}));
 assert.equal(await page.locator('#railSelectedParcel').textContent(),'None');
 await page.evaluate(()=>{
  const api=window.PRAMAN_SPATIAL_VIEW;
  api.loadDataset({parcels:[{id:'assessment-test',is_active:true}],floodImpact:[{parcel_id:'assessment-test',flood_affected:true,building_affected:true,asset_category:'Residential',compensation_readiness:'REVIEW'}]});
  api.openFloodImpactPanel();
 });
 assert.equal(await page.locator('#floodImpactPanel').getAttribute('aria-hidden'),'false');
 assert.match(await page.locator('#floodImpactContent').textContent(),/Parcels with affected buildings/);
 await page.locator('#closeFloodImpact').click();
 assert.equal(await page.locator('#floodImpactPanel').getAttribute('aria-hidden'),'true');
 assert.deepEqual(errors,[]);
 await browser.close();console.log('PASS: test scene shell, layer state, URL controls, 1,000 active + historical records, selection, all tabs, duplicate/dangling/lifecycle rejection, no fabricated geometry, atomic loads, zero browser errors.');
})().catch(e=>{console.error(e);process.exit(1);});
