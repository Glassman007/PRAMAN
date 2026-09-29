const {chromium}=require('playwright'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
(async()=>{
 const root=path.resolve(__dirname,'..'),data=JSON.parse(fs.readFileSync(path.join(root,'data/normalized-map.json'))),report=JSON.parse(fs.readFileSync(path.join(root,'docs/dataset-validation.json')));
 assert.equal(data.parcels.length,report.canonicalRecords);assert.equal(data.historicalParcels.length,report.historical);assert.equal(report.activeMissingOrInvalid,0);assert.equal(report.topology.pairRelationChanges,0);assert(report.maxRoundTripErrorDegrees<1e-10);
 assert.equal(new Set([...data.parcels,...data.historicalParcels].map(p=>p.id)).size,report.totalStoredParcels);
 assert(data.buildingFootprints.length>0);assert(data.buildingFootprints.every(b=>b.role.startsWith('Source-observed')));
 const forbidden=new Set(['true_parcel_id','true_source_mappings','true_ownership','true_geometry_version','expected_reconciliation_outcome','benchmark_case_ids','candidate_canonical_parcel_id','alternate_candidate_parcel_ids']);
 function scan(o){if(!o||typeof o!=='object')return;for(const [k,v] of Object.entries(o)){assert(!forbidden.has(k),k);scan(v);}}scan(data);
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_EXECUTABLE||undefined,args:['--no-sandbox',...(process.env.PRAMAN_SOFTWARE_GPU?['--no-zygote','--in-process-gpu','--ignore-gpu-blocklist','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']:[])]});
 try{
 const page=await browser.newPage({viewport:{width:1600,height:1000}}),errors=[],glbs=[];page.on('pageerror',e=>errors.push(e.message));page.on('requestfailed',r=>errors.push(r.url()));page.on('request',r=>{if(r.url().endsWith('.glb'))glbs.push(r.url());});
 await page.goto(process.env.PRAMAN_TEST_URL+'?mode=fabric');await page.waitForFunction(()=>window.PRAMAN_MAP?.fabric&&window.PRAMAN_SPATIAL_VIEW.getState().rendererReady);
 const result=await page.evaluate(async()=>{
  const m=window.PRAMAN_MAP,T=await import('three');
  const {createParcel}=await import('./map/parcel-renderer.js');
  for(const reverse of [false,true]){
   const outer=[[0,0],[10,0],[10,10],[0,10],[0,0]],hole=[[2,2],[2,4],[4,4],[4,2],[2,2]];
   const p=createParcel({id:'hole-fixture',outer:reverse?outer.reverse():outer,holes:[reverse?hole.reverse():hole]});
   const geometry=p.object.geometry,pos=geometry.attributes.position,idx=geometry.index;let area=0;
   for(let i=0;i<idx.count;i+=3){const a=new T.Vector3().fromBufferAttribute(pos,idx.getX(i)),b=new T.Vector3().fromBufferAttribute(pos,idx.getX(i+1)),c=new T.Vector3().fromBufferAttribute(pos,idx.getX(i+2));area+=new T.Triangle(a,b,c).getArea();}
   p.dispose();if(Math.abs(area-96)>1e-6)throw new Error('Hole/winding triangulation failed');
  }
  const entries=[...m.fabric.parcelObjects];let mismatches=0;
  for(const [id,objects] of entries){const p=m.data.parcels.find(p=>p.id===id),ring=p.geometry.coordinates[0],positions=objects[0].geometry.attributes.position;for(let i=0;i<positions.count;i++){const x=positions.getX(i),z=positions.getZ(i);if(!ring.some(([sx,sz])=>Math.abs(sx-x)<0.0002&&Math.abs(sz-z)<0.0002))mismatches++;}}
  const [id,objects]=entries[0],box=new T.Box3().setFromObject(objects[0]),point=box.getCenter(new T.Vector3()).project(m.camera),rect=m.interaction.canvas.getBoundingClientRect();
  const picked=m.interaction.pick(rect.left+(point.x+1)*rect.width/2,rect.top+(1-point.y)*rect.height/2,'parcel');
  window.PRAMAN_SPATIAL_VIEW.selectParcel(id,true);const selected=window.PRAMAN_SPATIAL_VIEW.getState().selectedParcel;
  window.PRAMAN_SPATIAL_VIEW.toggleLayer('canonical',false);const hidden=!m.groups.parcels.visible;window.PRAMAN_SPATIAL_VIEW.toggleLayer('canonical',true);
  return {count:entries.length,cells:m.fabric.cellGroups.size,mismatches,picked:picked?.id,id,selected,hidden,nonParcelChildren:Object.entries(m.groups).filter(([k])=>k!=='parcels').reduce((n,[k,g])=>n+g.children.length,0),loads:m.assets.loads};
 });
 assert.equal(result.count,report.active);assert.equal(result.cells,Object.keys(report.cells).length);assert.equal(result.mismatches,0);assert.equal(result.picked,result.id);assert.equal(result.selected,result.id);assert(result.hidden);assert.equal(result.nonParcelChildren,0);assert.equal(result.loads,0);assert.deepEqual(glbs,[]);
 await page.keyboard.press('Escape');await page.screenshot({path:path.join(root,'docs/stage4-parcel-fabric.png'),fullPage:true});assert.deepEqual(errors,[]);console.log('PASS: actual parcel coordinates, cell membership, picking, layer visibility, no buildings/GLB loads, evaluation exclusion, zero browser errors.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
