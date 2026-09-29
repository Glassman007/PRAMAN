import {createCurrentCity} from './current-city.js';
import {createCityFabric} from './city-fabric.js';
import {createCitySearch} from './city-search.js';
import {createPilot} from './pilot-neighbourhood.js';
import {createParcelFabric} from './parcel-fabric.js';
import {REVISION} from 'three';
import {createScene} from './scene.js';
import {createCamera} from './camera.js';
import {createControls} from './controls.js';
import {AssetLoader} from './asset-loader.js';

import {Interaction} from './interaction.js';
import {SpatialIndex} from './spatial-index.js';
import {CellManager} from './city-builder.js';
import {WORLD_UNITS} from '../data/map-data.js';

const host=document.querySelector('.map-frame');
const status=(state,message)=>window.dispatchEvent(new CustomEvent('praman-renderer-status',{detail:{state,message}}));
const mode=new URLSearchParams(location.search).get('mode')||'city';
const calibration=mode==='calibration';
let foundation;
try {
 foundation=createScene(host);
 const {scene,renderer,groups}=foundation;
 const camera=createCamera(),assets=new AssetLoader(),index=new SpatialIndex(),cells=new CellManager();
 let frame=0,disposed=false,renderCount=0,viewer,fabric,pilot,city,search,temporal,evidence;
 function invalidate(){if(disposed||frame)return;frame=requestAnimationFrame(()=>{frame=0;if(city)city.update();else index.applyVisibility(camera,1500);temporal?.update();evidence?.update();renderer.render(scene,camera);viewer?.updateLabels();renderCount++;});}
 const controlKit=createControls(camera,renderer.domElement,invalidate);
 const interaction=new Interaction(camera,renderer.domElement,selection=>{
  document.getElementById('testSelection').textContent=selection?`${selection.kind}: ${selection.id}`:'No object selected';
  window.dispatchEvent(new CustomEvent('praman-map-selection',{detail:selection}));
  if(evidence?.handleSelection(selection))return;
  if(selection&&!selection.testOnly)window.PRAMAN_SPATIAL_VIEW?.selectParcel(selection.kind==='parcel'?selection.id:selection.parcelId,!city);
  if(selection?.geometryId&&temporal)temporal.selectEvent(selection.geometryId);
 });
 const observer=new ResizeObserver(()=>{
  const width=Math.max(1,host.clientWidth),height=Math.max(1,host.clientHeight);
  renderer.setSize(width,height);camera.aspect=width/height;camera.updateProjectionMatrix();invalidate();
 });observer.observe(host);
 const reset=()=>{city?.setFilter(null);if(fabric)fabric.fit();else controlKit.reset();invalidate();};
 const resetButton=document.getElementById('fitButton');resetButton.disabled=false;resetButton.title=calibration?'Reset current calibration view':'Fit entire parcel fabric';resetButton.textContent='Reset view';resetButton.addEventListener('click',reset);
 const onLost=e=>{e.preventDefault();status('error','Graphics context lost. Reload to restore the test scene.');};
 renderer.domElement.addEventListener('webglcontextlost',onLost);
 const onRestored=()=>{status('ready',calibration?'Asset calibration · 1 unit = 1 metre':'Parcel fabric · local metres');invalidate();};
 renderer.domElement.addEventListener('webglcontextrestored',onRestored);
 function dispose(){
  if(disposed)return;disposed=true;cancelAnimationFrame(frame);observer.disconnect();resetButton.removeEventListener('click',reset);
  renderer.domElement.removeEventListener('webglcontextlost',onLost);renderer.domElement.removeEventListener('webglcontextrestored',onRestored);
  evidence?.dispose();temporal?.dispose();search?.dispose();city?.dispose();pilot?.dispose();fabric?.dispose();viewer?.dispose();controlKit.dispose();interaction.dispose();cells.dispose();index.clear();
  scene.clear();assets.dispose();foundation.dispose();window.removeEventListener('pagehide',dispose);resetButton.disabled=true;
 }
 window.addEventListener('pagehide',dispose);
 // Developer integration surface, independent of the panel/data API.
 window.PRAMAN_MAP={scene,camera,groups,assets,interaction,index,cells,controls:controlKit.controls,reset,invalidate,dispose,units:WORLD_UNITS,
  diagnostics:()=>({threeRevision:REVISION,templateLoads:assets.loads,renderCount,drawCalls:renderer.info.render.calls,triangles:renderer.info.render.triangles,memory:{...renderer.info.memory},groups:Object.keys(groups),testOnly:calibration,city:city?.diagnostics()})};
 if(calibration){
 const {CalibrationViewer,COMPARISONS}=await import('./calibration-viewer.js');
 viewer=new CalibrationViewer({scene,groups,assets,camera,controls:controlKit.controls,interaction,index,host,invalidate,status});
 window.PRAMAN_MAP.viewer=viewer;
 viewer.show(COMPARISONS.residential).catch(error=>console.error(error));
 }else{
  document.querySelector('.calibration-controls').hidden=true;
  document.querySelector('.calibration-measurements').hidden=true;
  status('loading','Loading validated parcel fabric…');
  fetch('./data/normalized-map.json').then(r=>{if(!r.ok)throw new Error('Dataset HTTP '+r.status);return r.json();}).then(async input=>{
   const data=window.PRAMAN_DATA_ADAPTER.normalize(input);
   let renderData=data,plan;
   if(mode==='pilot'){const response=await fetch('./data/pilot-plan.json');if(!response.ok)throw new Error('Pilot plan unavailable');plan=await response.json();const ids=new Set(plan.parcelIds);renderData={...data,parcels:data.parcels.filter(p=>ids.has(p.id)),cells:data.cells.filter(c=>c.parcelIds.some(id=>ids.has(id)))};}
   let manifest;
   if(mode==='city'){const response=await fetch('./data/city/manifest.json');if(!response.ok)throw new Error('Locality manifest unavailable');manifest=await response.json();fabric=createCityFabric({data,manifest,groups,interaction,camera,controls:controlKit.controls,invalidate});}
   else fabric=createParcelFabric({data:renderData,groups,interaction,camera,controls:controlKit.controls,invalidate});
   window.PRAMAN_MAP.fabric=fabric;window.PRAMAN_MAP.data=data;
   window.PRAMAN_SPATIAL_VIEW.loadDataset(data);window.PRAMAN_SPATIAL_VIEW.toggleLayer('canonical',true);
   if(mode==='city'){city=await createCurrentCity({data,manifest,fabric,groups,assets,interaction,camera,controls:controlKit.controls,index,cells,invalidate,host});window.PRAMAN_MAP.city=city;search=createCitySearch({data,city,controls:controlKit.controls,camera,invalidate,reset});window.PRAMAN_MAP.search=search;
    const {createTemporalView}=await import('./temporal-view.js');temporal=await createTemporalView({data,city,fabric,groups,interaction,camera,controls:controlKit.controls,host,invalidate});window.PRAMAN_MAP.temporal=temporal;
    const {createEvidenceView}=await import('./evidence-view.js');evidence=await createEvidenceView({data,temporal,city,fabric,groups,interaction,host,invalidate});window.PRAMAN_MAP.evidence=evidence;window.PRAMAN_SPATIAL_VIEW.configureEvidenceLayers(evidence.model.families);
    const params=new URLSearchParams(location.search);if(params.get('parcelId'))temporal.focus(params.get('parcelId'));if(params.get('eventId'))temporal.selectEvent(params.get('eventId'));evidence.restore(params);
    const {createUIShell}=await import('./ui-shell.js');window.PRAMAN_MAP.ui=createUIShell();
   }
   if(plan){pilot=await createPilot({plan,data,fabric,groups,assets,interaction,camera,controls:controlKit.controls,invalidate,host});window.PRAMAN_MAP.pilot=pilot;}
   status('ready',city?`${manifest.summary.activeParcels} active parcels · ${manifest.cells.length} cells · metres`:plan?`Pilot · ${plan.parcelIds.length} parcels · ${plan.placements.length} illustrative objects · metres`:`${data.parcels.filter(p=>p.is_active).length} active parcels · ${data.cells.length} cells · EPSG:32643 · metres`);
  }).catch(error=>{console.error(error);status('error','Parcel data could not load: '+error.message);});
 }
} catch(error){foundation?.dispose();console.error('Renderer initialization failed:',error);status('error','3D rendering could not start. WebGL2 support is required.');}
