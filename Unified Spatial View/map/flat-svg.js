import {ringsOf,segmentsOf} from './geometry-utils.js';
import {buildFlatLayerModel} from './flat-layer-model.js';

const NS='http://www.w3.org/2000/svg';
const svgEl=(tag,attrs={})=>{const n=document.createElementNS(NS,tag);for(const [k,v] of Object.entries(attrs))if(v!==undefined&&v!==null)n.setAttribute(k,String(v));return n;};
const boundsOfGeometry=g=>{const pts=ringsOf(g).flat();if(!pts.length)return null;const xs=pts.map(p=>p[0]),ys=pts.map(p=>-p[1]);return {minX:Math.min(...xs),maxX:Math.max(...xs),minY:Math.min(...ys),maxY:Math.max(...ys)};};
const unionBounds=items=>{const bs=items.map(boundsOfGeometry).filter(Boolean);if(!bs.length)return null;return {minX:Math.min(...bs.map(b=>b.minX)),maxX:Math.max(...bs.map(b=>b.maxX)),minY:Math.min(...bs.map(b=>b.minY)),maxY:Math.max(...bs.map(b=>b.maxY))};};
const padBounds=(b,p=.04)=>{const w=Math.max(1,b.maxX-b.minX),h=Math.max(1,b.maxY-b.minY),pad=Math.max(w,h)*p;return {x:b.minX-pad,y:b.minY-pad,w:w+pad*2,h:h+pad*2};};
const pathOf=g=>{let d='';for(const ring of ringsOf(g)){if(!ring.length)continue;d+=`M ${ring[0][0]} ${-ring[0][1]} `;for(let i=1;i<ring.length;i++)d+=`L ${ring[i][0]} ${-ring[i][1]} `;d+='Z ';}return d.trim();};
const linePath=lines=>lines.map(line=>line.length?`M ${line[0][0]} ${-line[0][1]} `+line.slice(1).map(p=>`L ${p[0]} ${-p[1]}`).join(' '):'').join(' ');
const edgePath=edges=>edges.map(([a,b])=>`M ${a[0]} ${-a[1]} L ${b[0]} ${-b[1]}`).join(' ');
const intersects=(a,b)=>a.minX<=b.maxX&&a.maxX>=b.minX&&a.minY<=b.maxY&&a.maxY>=b.minY;

const LAND_FILL={PUBLIC_PARK:'#d9ead3',GREEN_BELT:'#d5ead9',PLAYGROUND:'#e6edcf',PARKING_AREA:'#dfe4e8',ROAD_ACCESS_CORRIDOR:'#c8d0d7',VACANT_PLOT:'#eee9dc',UNDER_CONSTRUCTION_PLOT:'#ead8ba'};
export function createFlatMap({data,host}){
 const svg=svgEl('svg',{class:'flat-spatial-map','aria-label':'2D parcel map','role':'application','tabindex':'0'});host.prepend(svg);
 // Painter order is semantic: authoritative fill → source geometry → building footprints → temporal/comparison → authoritative boundary → issues → selection.
 const canonicalFillGroup=svgEl('g',{class:'flat-layer flat-canonical flat-canonical-fill'}),sourceLayerRoot=svgEl('g',{class:'flat-layer flat-source-layers'}),buildingGroup=svgEl('g',{class:'flat-layer flat-buildings'}),temporalGroup=svgEl('g',{class:'flat-layer flat-temporal'}),comparisonGroup=svgEl('g',{class:'flat-layer flat-comparisons'}),canonicalBoundaryGroup=svgEl('g',{class:'flat-layer flat-canonical-boundaries','pointer-events':'none'}),sourceGroup=svgEl('g',{class:'flat-layer flat-sources'}),edgeGroup=svgEl('g',{class:'flat-layer flat-edges'}),issueGroup=svgEl('g',{class:'flat-layer flat-issues'}),selectionGroup=svgEl('g',{class:'flat-layer flat-selection','pointer-events':'none'});
 svg.append(canonicalFillGroup,sourceLayerRoot,buildingGroup,temporalGroup,comparisonGroup,canonicalBoundaryGroup,sourceGroup,edgeGroup,issueGroup,selectionGroup);
 const model=buildFlatLayerModel(data),{parcelById}=model,layerRecords=new Map(),cellGeometries=new Map(data.cells.map(c=>[c.id,[]]));
 const groupsByLayer=new Map([['canonical',canonicalFillGroup],['buildings',buildingGroup]]);
 for(const meta of model.sourceMeta.values()){const group=svgEl('g',{class:`flat-source-family flat-source-${meta.id}`,'data-layer-id':meta.id});sourceLayerRoot.append(group);groupsByLayer.set(meta.id,group);}
 const parcelObjects=new Map();
 for(const [layerId,layer] of model.layers){
  const group=groupsByLayer.get(layerId);if(!group)continue;
  const record={id:layerId,name:layer.name,kind:layer.kind,group,groups:layerId==='canonical'?[canonicalFillGroup,canonicalBoundaryGroup]:[group],features:[]};layerRecords.set(layerId,record);
  for(const feature of layer.features){
   let selection,attrs;
   if(layerId==='canonical'){
    selection={kind:'parcel',id:feature.id,parcelId:feature.parcelId,geometryId:feature.geometryId,category:'CURRENT / AUTHORITATIVE'};
    attrs={fill:LAND_FILL[feature.landUse]||'#d9dee4','fill-opacity':'.34',stroke:'none','fill-rule':'evenodd'};
   }else if(layerId==='buildings'){
    selection={kind:'building',id:feature.id,parcelId:feature.parcelId,observationId:feature.observationId,geometryId:feature.geometryId,category:'SOURCE-OBSERVED BUILDING FOOTPRINT — NOT CANONICAL AUTHORITY'};
    attrs={fill:'#52697d','fill-opacity':'.18',stroke:'#40576a','stroke-width':'1.05','vector-effect':'non-scaling-stroke','fill-rule':'evenodd'};
   }else{
    selection={kind:'source',id:feature.id,observationIds:feature.observationIds,parcelId:feature.parcelId,geometryId:feature.geometryId,category:'SOURCE OBSERVATION — VISUAL DIFFERENCE IS NOT A CONFLICT'};
    attrs={fill:layer.color,'fill-opacity':'.075',stroke:layer.color,'stroke-width':'1.35','stroke-dasharray':'5 3','vector-effect':'non-scaling-stroke','fill-rule':'evenodd'};
   }
   const d=pathOf(feature.geometry);if(!d)continue;
   const path=svgEl('path',{d,'data-kind':selection.kind,'data-id':selection.id,'data-cell':feature.cellId,'data-parcel':feature.parcelId,...attrs});path._selection=selection;group.append(path);
   let boundaryPath=null;
   if(layerId==='canonical'){
    boundaryPath=svgEl('path',{d,fill:'none',stroke:'#394657','stroke-width':'1.15','vector-effect':'non-scaling-stroke','fill-rule':'evenodd','pointer-events':'none','data-authoritative-boundary':feature.id});
    canonicalBoundaryGroup.append(boundaryPath);
   }
   const rendered={...feature,path,boundaryPath};record.features.push(rendered);
   if(feature.cellId&&cellGeometries.has(feature.cellId))cellGeometries.get(feature.cellId).push(feature.geometry);
   if(layerId==='canonical')parcelObjects.set(feature.id,{cellId:feature.cellId,geometry:feature.geometry,geometryId:feature.geometryId,path,boundaryPath});
  }
 }
 const allBounds=unionBounds(model.allGeometries);if(!allBounds)throw new Error('No spatial geometry available for the 2D map');
 const cellState=new Map(data.cells.map(c=>[c.id,{visible:true,bounds:unionBounds(cellGeometries.get(c.id))}]).filter(([,s])=>s.bounds));
 const fullView=padBounds(allBounds,.035);let view={...fullView},filter=null,issueIds=null,selectionFillVisible=true,selected=null,drag=null,moved=false,sourceScope='cells',activeOrder=[],evidenceContextVisible=true;
 const layerEmpty=document.createElement('div');layerEmpty.id='layerEmptyState';layerEmpty.className='inspection-empty';layerEmpty.hidden=true;layerEmpty.setAttribute('role','status');host.append(layerEmpty);
 function setViewBox(next){view={...next};svg.setAttribute('viewBox',`${view.x} ${view.y} ${view.w} ${view.h}`);updateVisibleCells();}
 function fitBounds(b,p=.24){if(!b)return;const padded=padBounds(b,p),aspect=Math.max(.2,host.clientWidth/Math.max(1,host.clientHeight));let w=padded.w,h=padded.h;if(w/h>aspect)h=w/aspect;else w=h*aspect;setViewBox({x:(padded.minX??padded.x)-(w-(padded.w||w))/2,y:(padded.minY??padded.y)-(h-(padded.h||h))/2,w,h});}
 function fit(){const b=filter?cellState.get(filter)?.bounds:allBounds;if(!b)return;const r=padBounds(b,.04),aspect=Math.max(.2,host.clientWidth/Math.max(1,host.clientHeight));let w=r.w,h=r.h;if(w/h>aspect)h=w/aspect;else w=h*aspect;setViewBox({x:r.x-(w-r.w)/2,y:r.y-(h-r.h)/2,w,h});}
 function zoom(factor,cx=view.x+view.w/2,cy=view.y+view.h/2){const f=Math.min(2,Math.max(.2,factor)),nw=view.w*f,nh=view.h*f;setViewBox({x:cx-(cx-view.x)*f,y:cy-(cy-view.y)*f,w:nw,h:nh});}
 function screenPoint(e){const r=svg.getBoundingClientRect();return {x:view.x+(e.clientX-r.left)/r.width*view.w,y:view.y+(e.clientY-r.top)/r.height*view.h};}
 function updateVisibleCells(){const vb={minX:view.x,maxX:view.x+view.w,minY:view.y,maxY:view.y+view.h};for(const [id,state] of cellState)state.visible=(!filter||id===filter)&&intersects(vb,state.bounds);}
 function featureVisible(feature,layerId){if(filter&&feature.cellId!==filter)return false;if(layerRecords.get(layerId)?.features===undefined)return false;if(model.layers.get(layerId)?.kind==='source'&&sourceScope==='selected'&&feature.parcelId!==selected)return false;return true;}
 function applyFeatureFilters(){for(const [layerId,record] of layerRecords)for(const feature of record.features)feature.path.style.display=featureVisible(feature,layerId)?'':'none';updateVisibleCells();}
 function layerSemanticallyVisible(record){return evidenceContextVisible||!['source','building'].includes(record.kind);}
 function updateLayerVisibility(){
  for(const [id,record] of layerRecords){const visible=activeOrder.includes(id)&&layerSemanticallyVisible(record);for(const g of record.groups)g.style.display=visible?'':'none';}
  const empty=activeOrder.filter(id=>layerRecords.has(id)&&layerRecords.get(id).features.length===0);layerEmpty.hidden=!empty.length;layerEmpty.textContent=empty.length?`No spatial records available for ${empty.length===1?'this layer':'these layers'}: ${empty.map(id=>layerRecords.get(id).name||id).join(', ')}.`:'';
 }
 function selectionGeometry(id){return model.authoritativeGeometryByParcel.get(id)||parcelById.get(id)?.geometry||null;}
 function updateSelection(){selectionGroup.replaceChildren();if(!selected||!selectionFillVisible)return;const geometry=selectionGeometry(selected);if(!geometry)return;selectionGroup.append(svgEl('path',{d:pathOf(geometry),fill:'#2b6cb0','fill-opacity':'.18',stroke:'#1f5e93','stroke-width':'2.2','vector-effect':'non-scaling-stroke','fill-rule':'evenodd','pointer-events':'none'}));}
 function setIssueIds(ids){issueIds=ids;for(const [id,o] of parcelObjects){const opacity=!ids?'':ids.has(id)?'1':'.16';o.path.style.opacity=opacity;if(o.boundaryPath)o.boundaryPath.style.opacity=opacity;}}
 function setCanonicalVisible(v){const set=new Set(activeOrder);if(v)set.add('canonical');else set.delete('canonical');activeOrder=[...set];updateLayerVisibility();}
 function setSourceScope(scope){sourceScope=scope==='selected'?'selected':'cells';applyFeatureFilters();}
 function setEvidenceContextVisible(v){evidenceContextVisible=!!v;updateLayerVisibility();}
 function focus(id){const p=parcelById.get(id),geometry=selectionGeometry(id);if(!p||!geometry)return false;if(filter&&filter!==p.cellId)setFilter(null);selected=id;applyFeatureFilters();fitBounds(boundsOfGeometry(geometry),.65);window.PRAMAN_SPATIAL_VIEW?.selectParcel(id,false);updateSelection();return true;}
 function setFilter(id){filter=id||null;if(filter&&!cellState.has(filter))throw new Error('Unknown cell');const current=window.PRAMAN_SPATIAL_VIEW?.getState?.().selectedParcel;if(filter&&current&&parcelById.get(current)?.cellId!==filter)window.PRAMAN_SPATIAL_VIEW.clearSelection();applyFeatureFilters();fit();window.dispatchEvent(new CustomEvent('praman-cell-filter',{detail:filter}));}
 function fitGeometries(geometries){const b=unionBounds(geometries);if(b)fitBounds(b,.35);}
 function getVisibleCellIds(){updateVisibleCells();return [...cellState].filter(([,s])=>s.visible).map(([id])=>id);}
 function layerDiagnostics(){return Object.fromEntries([...layerRecords].map(([id,r])=>{const visible=r.groups.every(g=>g.style.display!=='none'),requested=activeOrder.includes(id);return [id,{features:r.features.length,requested,visible,suspended:requested&&!visible&&!layerSemanticallyVisible(r),visibleFeatures:visible?r.features.filter(f=>f.path.style.display!=='none').length:0}];}));}
 function onState(e){selected=e.detail.selectedParcel;activeOrder=[...e.detail.activeOrder];applyFeatureFilters();updateLayerVisibility();updateSelection();}
 window.addEventListener('praman-spatial-state',onState);
 svg.addEventListener('pointerdown',e=>{if(e.button!==0)return;drag={x:e.clientX,y:e.clientY,startX:view.x,startY:view.y};moved=false;svg.setPointerCapture?.(e.pointerId);});
 svg.addEventListener('pointermove',e=>{if(!drag)return;const r=svg.getBoundingClientRect(),dx=(e.clientX-drag.x)/r.width*view.w,dy=(e.clientY-drag.y)/r.height*view.h;if(Math.hypot(e.clientX-drag.x,e.clientY-drag.y)>3)moved=true;setViewBox({x:drag.startX-dx,y:drag.startY-dy,w:view.w,h:view.h});});
 svg.addEventListener('pointerup',e=>{const wasMoved=moved;drag=null;if(wasMoved)return;const target=e.target.closest?.('[data-kind]'),selection=target?target._selection:null;if(!selection)return;if(window.PRAMAN_MAP?.evidence?.handleSelection(selection))return;if(selection.kind==='parcel')window.PRAMAN_SPATIAL_VIEW?.selectParcel(selection.id,false);else if(selection.parcelId)window.PRAMAN_SPATIAL_VIEW?.selectParcel(selection.parcelId,false);});
 svg.addEventListener('wheel',e=>{e.preventDefault();const p=screenPoint(e);zoom(e.deltaY>0?1.18:.84,p.x,p.y);},{passive:false});
 svg.addEventListener('keydown',e=>{if(e.key==='+'||e.key==='='){e.preventDefault();zoom(.8);}if(e.key==='-'){e.preventDefault();zoom(1.25);}if(e.key==='0'){e.preventDefault();fit();}});
 const observer=new ResizeObserver(()=>{if(svg.getAttribute('viewBox')===null)fit();});observer.observe(host);
 applyFeatureFilters();updateLayerVisibility();fit();
 const fabric={parcelObjects,cellGroups:cellState,setIssueIds,setSelectionFillVisible(v){selectionFillVisible=!!v;updateSelection();},setCanonicalVisible,showSelection(id){selected=id;applyFeatureFilters();updateSelection();},fit,bounds:allBounds,dispose(){window.removeEventListener('praman-spatial-state',onState);observer.disconnect();layerEmpty.remove();svg.remove();}};
 const city={manifest:{cells:data.cells},stats:{planned:{activeParcels:layerRecords.get('canonical')?.features.length||0,cells:data.cells.length},assetFree:true},update(){updateVisibleCells();},focus,setFilter,setSourceScope,setEvidenceContextVisible,getVisibleCellIds,clearHistoricalFocus(){},setDetailEnabled(){},whenSettled:async()=>{},diagnostics:()=>({renderer:'svg-2d',assetFree:true,visibleCellIds:getVisibleCellIds(),filter,sourceScope,evidenceContextVisible,authoritativeParcelsStored:parcelObjects.size,layers:layerDiagnostics()}),dispose(){}};
 return {svg,model,groups:{canonicalGroup:canonicalFillGroup,canonicalFillGroup,canonicalBoundaryGroup,buildingGroup,sourceLayerRoot,temporalGroup,comparisonGroup,sourceGroup,edgeGroup,issueGroup,selectionGroup},fabric,city,fit,zoom,fitGeometries,pathOf,linePath,edgePath,parcelById,layerRecords,dispose(){fabric.dispose();}};
}

const visibility=group=>{const o={};Object.defineProperty(o,'visible',{get(){return group.style.display!=='none';},set(v){group.style.display=v?'':'none';}});return o;};
const temporalStyles={historical:{fill:'#80649d',opacity:.13,dash:'6 4'},snapshot:{fill:'#54769d',opacity:.32,dash:'6 4'},proposed:{fill:'#d88b18',opacity:.22,dash:'6 4'},review:{fill:'#bb6419',opacity:.18,dash:'2 5'},rejected:{fill:'#bf4058',opacity:.12,dash:'6 4'},before:{fill:'#80649d',opacity:.30,dash:'6 4'},after:{fill:'#248a89',opacity:.34,dash:''}};
export function createFlatTemporalRenderer(flat){const group=flat.groups.temporalGroup,root=visibility(group);let records=[],emphasizedEdges=0,selectedRecord=null;
 function clear(){group.replaceChildren();records=[];emphasizedEdges=0;selectedRecord=null;}
 function draw(rows,extraEdges=[],selectedId=null){clear();records=rows;selectedRecord=rows.find(r=>r.id===selectedId)||null;for(const row of rows){if(!row.geometry)continue;const st=temporalStyles[row.style]||temporalStyles.historical,path=svgEl('path',{d:pathOf(row.geometry),fill:st.fill,'fill-opacity':st.opacity,stroke:st.fill,'stroke-width':'1.6','stroke-dasharray':st.dash,'vector-effect':'non-scaling-stroke','fill-rule':'evenodd','data-kind':'parcel','data-id':row.id});path._selection={kind:'parcel',id:row.id,parcelId:row.id,geometryId:row.geometryId,temporalCategory:row.category};group.append(path);}if(extraEdges.length){group.append(svgEl('path',{d:edgePath(extraEdges),fill:'none',stroke:'#e05917','stroke-width':'2.3','vector-effect':'non-scaling-stroke','pointer-events':'none'}));emphasizedEdges=extraEdges.length;}if(selectedRecord){group.append(svgEl('path',{d:pathOf(selectedRecord.geometry),fill:'none',stroke:'#352043','stroke-width':'2.5','stroke-dasharray':'4 3','vector-effect':'non-scaling-stroke','pointer-events':'none'}));}}
 function animate(progress,{fade=false,reveal=false}={}){group.style.opacity=fade?String(Math.max(.15,progress)):'1';if(reveal)for(const p of group.querySelectorAll('path'))p.style.strokeDashoffset=String((1-progress)*20);}
 return {root,draw,clear,animate,get records(){return records;},get selectedGeometryId(){return selectedRecord?.geometryId||null;},get emphasizedEdges(){return emphasizedEdges;},dispose(){clear();group.style.display='';group.style.opacity='';}};
}

export function createFlatEvidenceRenderer(flat){const source=flat.groups.sourceGroup,comp=flat.groups.comparisonGroup,edges=flat.groups.edgeGroup,issuesGroup=flat.groups.issueGroup,root={};Object.defineProperty(root,'visible',{get(){return source.style.display!=='none';},set(v){for(const g of [source,comp,edges])g.style.display=v?'':'none';}});const issues=visibility(issuesGroup);let visibleSources=[],differenceRows=[],selectedEdge=null;
 function clear(){source.replaceChildren();comp.replaceChildren();edges.replaceChildren();visibleSources=[];differenceRows=[];selectedEdge=null;}
 function addLine(group,d,color,{dash='6 4',width=1.7,selection=null}={}){if(!d)return;const p=svgEl('path',{d,fill:'none',stroke:color,'stroke-width':width,'stroke-dasharray':dash,'vector-effect':'non-scaling-stroke','data-kind':selection?.kind,'data-id':selection?.id});if(selection)p._selection=selection;group.append(p);}
 function fill(group,g,color,selection,opacity=.32){if(!g)return;const p=svgEl('path',{d:pathOf(g),fill:color,'fill-opacity':opacity,stroke:'none','fill-rule':'evenodd','data-kind':selection?.kind,'data-id':selection?.id});if(selection)p._selection=selection;group.append(p);}
 function draw({sources=[],comparisons=[],sharedEdges=[],selectedEdge:chosenEdge=null}){clear();visibleSources=sources.map(s=>s.id);for(const s of sources){if(!s.geometry)continue;const selection={kind:'source',id:s.id,parcelId:s.parcelId,geometryId:s.geometryId,category:'SOURCE OBSERVATION'};addLine(source,edgePath(segmentsOf(s.geometry)),s.color||'#3866ab',{selection});}for(const c of comparisons){differenceRows.push(c.observationId);const selection={kind:'source',id:c.observationId,parcelId:c.parcelId,category:'DERIVED GEOMETRIC COMPARISON — NOT A CONFLICT OR AUTHORITY DECISION'};fill(comp,c.canonicalOnly,'#db8b2d',selection,.32);fill(comp,c.sourceOnly,'#468cc0',selection,.32);addLine(comp,edgePath(c.canonicalUnmatchedEdges),'#c27a1c',{dash:'',width:2,selection});addLine(comp,edgePath(c.sourceUnmatchedEdges),'#397abd',{selection});if(c.centroidVector)addLine(comp,edgePath([c.centroidVector]),'#302b52',{dash:'',width:1.8,selection});}for(const e of sharedEdges){const selection={kind:'edge',id:e.id,parcelId:e.parcelIds[0],parcelIds:e.parcelIds,category:'SHARED CANONICAL EDGE'};addLine(edges,linePath(e.lines),'#354153',{dash:'',width:2,selection});}if(chosenEdge){selectedEdge=chosenEdge.id;const selection={kind:'edge',id:chosenEdge.id,parcelId:chosenEdge.parcelIds[0],parcelIds:chosenEdge.parcelIds};addLine(edges,linePath(chosenEdge.lines),'#f03bb4',{dash:'',width:3,selection});}}
 function drawIssues(rows){issuesGroup.replaceChildren();for(const r of rows){const c=svgEl('circle',{cx:r.point[0],cy:-r.point[1],r:'3.2',fill:'#b44469',stroke:'#fff','stroke-width':'1','vector-effect':'non-scaling-stroke','data-kind':'conflict','data-id':r.ids[0]});c._selection={kind:'conflict',id:r.ids[0],conflictIds:r.ids,parcelId:r.parcelId,representation:'Parcel record marker; not a conflict footprint'};issuesGroup.append(c);}}
 return {root,issues,draw,drawIssues,getState:()=>({sourceObservationIds:visibleSources,comparisonObservationIds:differenceRows,selectedEdge}),dispose(){clear();drawIssues([]);source.style.display='';issuesGroup.style.display='';}};
}
