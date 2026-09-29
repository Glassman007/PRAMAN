import {createFlatMap,createFlatTemporalRenderer,createFlatEvidenceRenderer} from './flat-svg.js';
import {createCitySearch} from './city-search.js';
import {createTemporalView} from './temporal-view.js';
import {createEvidenceView} from './evidence-view.js';
import {createUIShell} from './ui-shell.js';

const host=document.querySelector('.map-frame');
const status=(state,message)=>window.dispatchEvent(new CustomEvent('praman-renderer-status',{detail:{state,message}}));
let disposed=false,flat,search,temporal,evidence;
const resetButton=document.getElementById('fitButton');

try{
 status('loading','Loading authoritative parcel geometry…');
 const datasetResponse=await fetch('./data/normalized-map.json');
 if(!datasetResponse.ok)throw new Error('Dataset HTTP '+datasetResponse.status);
 const input=await datasetResponse.json(),data=window.PRAMAN_DATA_ADAPTER.normalize(input);
 flat=createFlatMap({data,host});
 const invalidate=()=>{flat.city.update();evidence?.update();};
 const reset=()=>flat.fit();
 resetButton.disabled=false;resetButton.title='Fit entire parcel fabric';resetButton.textContent='Reset view';resetButton.addEventListener('click',reset);
 window.PRAMAN_MAP={renderer:'svg-2d',assetFree:true,data,fabric:flat.fabric,city:flat.city,reset,invalidate,diagnostics:()=>({renderer:'svg-2d',assetFree:true,...flat.city.diagnostics()}),dispose(){if(disposed)return;disposed=true;resetButton.removeEventListener('click',reset);evidence?.dispose();temporal?.dispose();search?.dispose();flat?.dispose();resetButton.disabled=true;}};
 window.PRAMAN_SPATIAL_VIEW.loadDataset(data);
 window.PRAMAN_SPATIAL_VIEW.toggleLayer('canonical',true);
 search=createCitySearch({data,city:flat.city,invalidate,reset,zoomIn:()=>flat.zoom(.8),zoomOut:()=>flat.zoom(1.25)});window.PRAMAN_MAP.search=search;
 temporal=await createTemporalView({data,city:flat.city,fabric:flat.fabric,host,invalidate,renderer:createFlatTemporalRenderer(flat),fitGeometry:flat.fitGeometries,contextEnabled:false});window.PRAMAN_MAP.temporal=temporal;
 evidence=await createEvidenceView({data,temporal,city:flat.city,fabric:flat.fabric,host,invalidate,renderer:createFlatEvidenceRenderer(flat),flatMode:true});window.PRAMAN_MAP.evidence=evidence;
 window.PRAMAN_SPATIAL_VIEW.configureEvidenceLayers(evidence.model.families);
 const params=new URLSearchParams(location.search);if(params.get('parcelId'))temporal.focus(params.get('parcelId'));if(params.get('eventId'))temporal.selectEvent(params.get('eventId'));evidence.restore(params);
 window.PRAMAN_MAP.ui=createUIShell();
 status('ready',`${flat.layerRecords.get('canonical')?.features.length||0} current authoritative parcels · ${data.cells.length} cells · 2D geometry workspace`);
 window.addEventListener('pagehide',window.PRAMAN_MAP.dispose,{once:true});
}catch(error){console.error('2D spatial workspace initialization failed:',error);status('error','Spatial workspace could not load: '+error.message);}
