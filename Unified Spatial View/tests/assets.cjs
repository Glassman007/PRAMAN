const {chromium}=require('playwright');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');const crypto=require('node:crypto');
(async()=>{
 const root=path.resolve(__dirname,'..'),inventory=JSON.parse(fs.readFileSync(path.join(root,'data/asset-inventory.json'))),registry=JSON.parse(fs.readFileSync(path.join(root,'data/asset-registry.json')));
 assert.equal(inventory.length,42);assert.equal(registry.length,42);assert.equal(new Set(registry.map(r=>r.id)).size,42);
 for(const r of inventory){const bytes=fs.readFileSync(path.join(root,r.path));assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),r.sha256);assert(registry.some(a=>a.id===r.id&&a.path===r.path));}
 assert(!fs.existsSync(path.join(root,'assets/appartments')));
 assert.deepEqual(registry.reduce((a,r)=>(a[r.category]=(a[r.category]||0)+1,a),{}),{apartments:7,buildings:10,commercial:3,government:3,parks:3,props:12,trees:4});
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_EXECUTABLE||undefined,args:['--no-sandbox',...(process.env.PRAMAN_SOFTWARE_GPU?['--no-zygote','--in-process-gpu','--ignore-gpu-blocklist','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']:[])]});
 try{
 const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('requestfailed',r=>errors.push(r.url()));
 await page.goto(process.env.PRAMAN_TEST_URL+'?mode=calibration');await page.waitForFunction(()=>window.PRAMAN_SPATIAL_VIEW?.getState().rendererReady);
 const results=await page.evaluate(async()=>{
  const {ASSET_LIST}=await import('./map/asset-registry.js'),{inspectAsset}=await import('./map/asset-audit.js'),{Box3,Vector3,Matrix4}=await import('three');const loader=window.PRAMAN_MAP.assets,rows=[];
  for(const spec of ASSET_LIST){
   const gltf=await loader.template(spec.id),native=inspectAsset(gltf),clone=await loader.clone(spec.id),box=new Box3().setFromObject(clone,true),size=box.getSize(new Vector3());
   let instanceResult=false;
   if(spec.instancingAllowed){const batch=await loader.instances(spec.id,[{matrix:new Matrix4()}]);instanceResult=batch.children.length>0;batch.traverse(o=>{if(o.isInstancedMesh)o.dispose();});}
   else {try{await loader.instances(spec.id,[{matrix:new Matrix4()}]);}catch{instanceResult=true;}}
   rows.push({id:spec.id,loaded:true,finite:[...box.min,...box.max].every(Number.isFinite),width:size.x,depth:size.z,height:size.y,lowestY:box.min.y,scale:spec.uniformScale,meshCount:native.meshCount,triangleCount:native.triangleCount,materialCount:native.materialCount,textureCount:native.textureCount,instancingAllowed:native.instancingAllowed,instanceResult});
  }
  return rows;
 });
 for(const r of results){const spec=registry.find(a=>a.id===r.id);assert(r.finite&&r.scale>0&&Number.isFinite(r.scale));assert(Math.abs(r.lowestY)<1e-5,r.id+' ground');for(const key of ['width','depth','height'])assert(Math.abs(r[key]-spec.calibratedDimensions[key])<1e-4,r.id+' '+key);for(const key of ['meshCount','triangleCount','materialCount','textureCount','instancingAllowed'])assert.equal(r[key],spec[key],r.id+' '+key);assert(r.instanceResult);}
 for(const r of registry){await page.selectOption('#assetSelect',r.id);await page.waitForFunction(id=>window.PRAMAN_MAP.viewer.currentIds.length===1&&window.PRAMAN_MAP.viewer.currentIds[0]===id&&window.PRAMAN_SPATIAL_VIEW.getState().rendererReady,r.id);}
 await page.locator('[data-calibration="residential"]').click();await page.waitForFunction(()=>window.PRAMAN_MAP.viewer.currentIds.length===4);await page.waitForTimeout(150);await page.screenshot({path:path.join(root,'docs/calibration-residential.png')});
 await page.locator('[data-calibration="civic"]').click();await page.waitForFunction(()=>window.PRAMAN_MAP.viewer.currentIds.includes('commercial-com-1'));await page.waitForTimeout(150);await page.screenshot({path:path.join(root,'docs/calibration-civic.png')});
 assert.deepEqual(errors,[]);fs.writeFileSync(path.join(root,'docs/asset-validation.json'),JSON.stringify({passed:true,assetCount:results.length,modelHashesUnchanged:true,browserErrors:errors,results},null,2)+'\n');
 console.log('PASS: all 42 paths, hashes, GLTF loads, diagnostics, finite calibrated bounds, metre dimensions, ground contact, instancing gates and viewer switches.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
