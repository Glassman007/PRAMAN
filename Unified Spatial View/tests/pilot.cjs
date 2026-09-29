const {chromium}=require('playwright'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_EXECUTABLE||undefined,args:['--no-sandbox',...(process.env.PRAMAN_SOFTWARE_GPU?['--no-zygote','--in-process-gpu','--ignore-gpu-blocklist','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']:[])]});
 try{
 const page=await browser.newPage({viewport:{width:1600,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('requestfailed',r=>errors.push(r.url()));
 await page.goto(process.env.PRAMAN_TEST_URL+'?mode=pilot');await page.waitForFunction(()=>window.PRAMAN_MAP?.pilot&&window.PRAMAN_SPATIAL_VIEW.getState().rendererReady);
 const result=await page.evaluate(async()=>{
  const m=window.PRAMAN_MAP,T=await import('three');let boundsErrors=0;const boxes=[];
  for(const p of m.pilot.plan.placements){const o=m.pilot.objects.get(p.id),b=new T.Box3().setFromObject(o);const points=p.footprint.coordinates[0],xs=points.map(p=>p[0]),zs=points.map(p=>p[1]);if(b.min.x<Math.min(...xs)-.02||b.max.x>Math.max(...xs)+.02||b.min.z<Math.min(...zs)-.02||b.max.z>Math.max(...zs)+.02||Math.abs(b.min.y-(p.assetId?0:.08))>.02)boundsErrors++;boxes.push({id:p.id,bounds:b.min.toArray().concat(b.max.toArray())});}
  const target=m.pilot.plan.placements.find(p=>p.assetId&&p.kind==='building'),object=m.pilot.objects.get(target.id),center=new T.Box3().setFromObject(object).getCenter(new T.Vector3()).project(m.camera),r=m.interaction.canvas.getBoundingClientRect(),x=r.left+(center.x+1)*r.width/2,y=r.top+(1-center.y)*r.height/2;
  const picked=m.interaction.pick(x,y,'building');
  const land=new T.Vector3(target.position[0],.02,target.position[2]).project(m.camera),parcel=m.interaction.pick(r.left+(land.x+1)*r.width/2,r.top+(1-land.y)*r.height/2,'parcel');
  const times=[];for(let i=0;i<20;i++){const start=performance.now();m.camera.position.x+=.1;m.controls.update();m.invalidate();await new Promise(requestAnimationFrame);times.push(performance.now()-start);}times.sort((a,b)=>a-b);
  return {count:m.fabric.parcelObjects.size,placements:m.pilot.plan.placements.length,boundsErrors,screen:[x,y],picked:picked?.id,target:target.id,parcel:parcel?.id,parcelId:target.parcelId,diagnostics:m.diagnostics(),medianFrameMs:times[10],p95FrameMs:times[18],uniqueAssets:new Set(m.pilot.plan.placements.map(p=>p.assetId).filter(Boolean)).size,boxes};
 });
 assert.equal(result.boundsErrors,0);assert.equal(result.picked,result.target);assert.equal(result.parcel,result.parcelId);assert.equal(result.uniqueAssets,result.diagnostics.templateLoads);assert(result.count<100);assert.deepEqual(errors,[]);
 await page.mouse.click(...result.screen);assert.equal(await page.locator('#railSelectedParcel').textContent(),result.parcelId);await page.keyboard.press('Escape');
 await page.screenshot({path:path.resolve(__dirname,'../docs/stage5-pilot.png'),fullPage:true});
 const first=await page.evaluate(()=>JSON.stringify(window.PRAMAN_MAP.pilot.plan.placements));await page.reload();await page.waitForFunction(()=>window.PRAMAN_MAP?.pilot);assert.equal(await page.evaluate(()=>JSON.stringify(window.PRAMAN_MAP.pilot.plan.placements)),first);
 fs.writeFileSync(path.resolve(__dirname,'../docs/pilot-browser-validation.json'),JSON.stringify({...result,boxes:undefined,errors},null,2));console.log('PASS: pilot bounds, ground contact, parcel/building picking, template reuse, deterministic reload, no browser errors.',JSON.stringify({...result,boxes:undefined}));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
