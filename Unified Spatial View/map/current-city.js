import {Group,Box3,Vector3,Matrix4,Mesh,MeshBasicMaterial,BufferGeometry,Float32BufferAttribute,DoubleSide,LineSegments,LineBasicMaterial,PlaneGeometry,InstancedMesh} from 'three';
import {CityAssets} from './city-assets.js';
import {createParcel} from './parcel-renderer.js';
import {getAsset} from './asset-registry.js';
export async function createCurrentCity({data,manifest,fabric,groups,assets,interaction,camera,controls,index,cells,invalidate,host}){
 const batcher=new CityAssets(assets),plans=new Map(),overviews=new Map(),roots=new Map(),labels=new Map(),parcelById=new Map([...data.parcels,...data.historicalParcels].map(p=>[p.id,p]));
 let detailEnabled=true;
 let disposed=false,filter=null,layerVisible=true,selected=null,timer=0,signature='',historical=null;
 const overviewMaterial=new MeshBasicMaterial({color:0xa3aab2,side:DoubleSide}),markerMaterial=new MeshBasicMaterial({color:0x536981,wireframe:true,side:DoubleSide}),markerGeometry=new PlaneGeometry(4,4);markerGeometry.rotateX(-Math.PI/2);
 const edgesMaterial=new LineBasicMaterial({color:0xffffff});
 const detailStatus=document.createElement('div');detailStatus.className='city-detail-status';host.append(detailStatus);
 const hoverLabel=document.createElement('div');hoverLabel.className='map-id-label';hoverLabel.hidden=true;host.append(hoverLabel);let hovered=null;interaction.setHoverHandler(s=>{hovered=s;invalidate();});
 const selectedLabel=document.createElement('div');selectedLabel.className='map-id-label';selectedLabel.hidden=true;host.append(selectedLabel);
 const stats={cellLoads:0,cellUnloads:0,planRequests:0,loadErrors:[],planned:manifest.summary};
 async function planFor(cell){if(!plans.has(cell.id)){stats.planRequests++;const promise=fetch(cell.path).then(r=>{if(!r.ok)throw new Error('Cell HTTP '+r.status);return r.json();});plans.set(cell.id,promise);}return plans.get(cell.id);}
 function selection(p){return {kind:p.kind==='building'?'building':p.kind,id:p.id,parcelId:p.parcelId,assetId:p.assetId,illustrative:true};}
 function matrix(p,y=0){return new Matrix4().makeRotationY(p.rotationY).setPosition(p.position[0],y,p.position[2]);}
 function overview(plan){const root=new Group(),positions=[],identities=[];
  for(const p of plan.placements.filter(p=>p.kind==='building'&&p.assetId)){
   const r=createParcel({id:p.id,outer:p.footprint.coordinates[0]}),g=r.object.geometry.toNonIndexed();positions.push(...g.attributes.position.array);for(let i=0;i<g.attributes.position.count/3;i++)identities.push({...selection(p),representation:'overview footprint'});g.dispose();r.dispose();
  }
  const geometry=new BufferGeometry();geometry.setAttribute('position',new Float32BufferAttribute(positions,3));const mesh=new Mesh(geometry,overviewMaterial);mesh.position.y=.055;mesh.userData.selectionForFace=i=>identities[i];root.add(mesh);const unregister=interaction.register(mesh);
  return {root,dispose(){unregister();geometry.dispose();root.removeFromParent();}};
 }
 async function loadDetail(cell){const plan=await planFor(cell),containers=Object.fromEntries(['buildings','trees','parks','props'].map(k=>[k,new Group()])),unregister=[],instanceObjects=[],clones=[];let dead=false;
  const batches=new Map();for(const p of plan.placements.filter(p=>p.assetId)){const key=p.assetId+':'+Math.floor(p.position[0]/60)+':'+Math.floor(p.position[2]/60);if(!batches.has(key))batches.set(key,[]);batches.get(key).push(p);}
  try{
   for(const items of batches.values()){const id=items[0].assetId;
    if(disposed)break;const kind=items[0].kind,group=kind==='building'?containers.buildings:kind==='tree'?containers.trees:kind==='park'?containers.parks:containers.props;
    if(getAsset(id).instancingAllowed){const object=await batcher.instances(id,items.map(p=>({matrix:matrix(p),selection:selection(p)})));group.add(object);object.userData.cityDetailBatch=true;object.userData.placements=items;object.userData.detailKind=kind;object.updateMatrixWorld(true);object.userData.detailBounds=new Box3().setFromObject(object);instanceObjects.push(object);unregister.push(interaction.register(object));}
    else for(const p of items){const object=await assets.clone(id);object.position.set(...p.position);object.rotation.y=p.rotationY;object.userData.selection=selection(p);group.add(object);object.userData.cityDetailBatch=true;object.userData.placements=[p];object.userData.detailKind=kind;object.updateMatrixWorld(true);object.userData.detailBounds=new Box3().setFromObject(object);clones.push(object);unregister.push(interaction.register(object));}
   }
  }catch(error){unregister.forEach(fn=>fn());instanceObjects.forEach(o=>o.traverse(m=>{if(m.isInstancedMesh)m.dispose();}));throw error;}
  const result={plan,containers,attach(){if(disposed)return;for(const [kind,root] of Object.entries(containers))groups[kind].add(root);overviews.get(cell.id).root.visible=true;stats.cellLoads++;invalidate();},dispose(){if(dead)return;dead=true;unregister.forEach(fn=>fn());instanceObjects.forEach(o=>o.traverse(m=>{if(m.isInstancedMesh)m.dispose();}));Object.values(containers).forEach(o=>{o.clear();o.removeFromParent();});stats.cellUnloads++;const o=overviews.get(cell.id);if(o)o.root.visible=true;invalidate();}};return result;
 }
 for(const cell of manifest.cells){
  const b=cell.bounds,bounds=new Box3(new Vector3(b[0],0,b[1]),new Vector3(b[2],180,b[3]));index.register(cell.id,bounds,null);cells.register(cell.id,()=>loadDetail(cell));
  const label=document.createElement('div');label.className='cell-label';label.textContent=cell.id;host.append(label);labels.set(cell.id,{element:label,position:bounds.getCenter(new Vector3()).setY(0)});
 }
 // All visible overview cells need their plan; detailed GLBs remain distance/frustum-lazy.
 await Promise.all(manifest.cells.map(async cell=>{const plan=await planFor(cell);if(disposed)return;const o=overview(plan);groups.buildings.add(o.root);overviews.set(cell.id,o);
  const root=new Group(),markers=plan.placements.filter(p=>p.kind==='building'&&!p.assetId);if(markers.length){const mesh=new InstancedMesh(markerGeometry,markerMaterial,markers.length);markers.forEach((p,i)=>mesh.setMatrixAt(i,matrix(p,.08)));mesh.instanceMatrix.needsUpdate=true;mesh.computeBoundingBox();mesh.computeBoundingSphere();mesh.userData.selectionByInstance=markers.map(p=>({...selection(p),representation:'record marker, not measured footprint'}));root.add(mesh);root.userData.releaseMarker=interaction.register(mesh);}
  const lines=[];for(const m of plan.parkingMarkings)for(let i=1;i<m.points.length;i++)for(const point of [m.points[i-1],m.points[i]])lines.push(point[0],.06,point[1]);const geometry=new BufferGeometry();geometry.setAttribute('position',new Float32BufferAttribute(lines,3));root.add(new LineSegments(geometry,edgesMaterial));root.userData.lineGeometry=geometry;groups.props.add(root);roots.set(cell.id,root);
 }));
 function projectLabel(element,point){const v=point.clone().project(camera);element.hidden=v.z<-1||v.z>1||Math.abs(v.x)>1||Math.abs(v.y)>1;if(!element.hidden){element.style.left=`${(v.x+1)*host.clientWidth/2}px`;element.style.top=`${(1-v.y)*host.clientHeight/2}px`;}}
 function update(){if(disposed)return;const visible=new Set(index.query(camera,Infinity).filter(id=>!filter||id===filter));const distance=camera.position.distanceTo(controls.target),wanted=[];
  for(const cell of manifest.cells){const show=layerVisible&&visible.has(cell.id);fabric.cellGroups.get(cell.id).visible=show;const b=index.cells.get(cell.id).bounds,near=b.distanceToPoint(camera.position)<(cells.loaded.has(cell.id)?450:350);
   overviews.get(cell.id).root.visible=show;roots.get(cell.id).visible=show;
   if(show&&near&&detailEnabled)wanted.push(cell.id);const loaded=cells.loaded.get(cell.id);if(loaded)for(const root of Object.values(loaded.containers)){root.visible=show;root.traverse(o=>{if(o.userData.cityDetailBatch){const b=o.userData.detailBounds;o.visible=show&&index.frustum.intersectsBox(b)&&b.distanceToPoint(camera.position)<(o.userData.detailKind==='tree'?150:180);}});}
   const label=labels.get(cell.id);label.element.hidden=true;if(show&&distance>650)projectLabel(label.element,label.position);
  }
  selectedLabel.hidden=true;if(layerVisible&&selected&&distance<650){const p=parcelById.get(selected);if(p?.geometry&&(!filter||p.cellId===filter)){const points=(p.geometry.type==='Polygon'?p.geometry.coordinates:p.geometry.coordinates[0])[0];const b=new Box3().setFromPoints(points.map(([x,z])=>new Vector3(x,0,z)));selectedLabel.textContent=selected+(p.is_active?'':' · HISTORICAL');projectLabel(selectedLabel,b.getCenter(new Vector3()));}}
  hoverLabel.hidden=true;if(layerVisible&&hovered&&distance<500&&hovered.id!==selected){hoverLabel.textContent=`${hovered.kind}: ${hovered.id}`;projectLabel(hoverLabel,new Vector3(...hovered.point));}
  const sig=wanted.sort().join('|');if(sig!==signature){signature=sig;clearTimeout(timer);timer=setTimeout(()=>{cells.sync(wanted).then(()=>{if(!disposed)invalidate();}).catch(e=>{stats.loadErrors.push(e.message);detailStatus.textContent='Cell detail unavailable: '+e.message;});},100);}
  detailStatus.textContent=`${visible.size} visible cells · ${cells.loaded.size} detailed · ${wanted.length?'3D detail near camera':'Placement footprints — zoom for 3D'} · Illustrative models`;
 }
 async function whenSettled(){await new Promise(r=>setTimeout(r,140));await Promise.all([...cells.pending.values()]);}
 function onState(e){selected=e.detail.selectedParcel;if(selected&&parcelById.get(selected)?.is_active&&historical){historical.dispose();historical.object.removeFromParent();historical=null;}layerVisible=e.detail.activeOrder.includes('canonical');invalidate();}window.addEventListener('praman-spatial-state',onState);
 function focus(id){const p=parcelById.get(id);if(!p?.geometry)return false;if(filter&&filter!==p.cellId)setFilter(null);historical?.dispose();historical?.object.removeFromParent();historical=null;
  const parts=p.geometry.type==='Polygon'?[p.geometry.coordinates]:p.geometry.coordinates;const points=parts.flatMap(r=>r[0]).map(([x,z])=>new Vector3(x,0,z)),b=new Box3().setFromPoints(points),center=b.getCenter(new Vector3()),size=b.getSize(new Vector3()),dist=Math.max(80,size.length()*2.5);
  if(!p.is_active){const root=new Group(),rs=[];for(const rings of parts){const r=createParcel({id,outer:rings[0],holes:rings.slice(1)});r.object.material.color.setHex(0x936dc0);r.object.material.wireframe=true;root.add(r.object);rs.push(r);}groups.historicalGeometry.visible=true;groups.historicalGeometry.add(root);historical={object:root,dispose(){rs.forEach(r=>r.dispose());}};}
  controls.target.copy(center);camera.position.set(center.x+dist*.35,dist,center.z+dist*.65);controls.update();window.PRAMAN_SPATIAL_VIEW.selectParcel(id,false);invalidate();return true;
 }
 function setFilter(id){filter=id||null;if(filter&&selected&&parcelById.get(selected)?.cellId!==filter)window.PRAMAN_SPATIAL_VIEW.clearSelection();if(filter){const b=index.cells.get(filter)?.bounds;if(!b)throw new Error('Unknown cell');const c=b.getCenter(new Vector3()).setY(0);controls.target.copy(c);camera.position.set(c.x,430,c.z+220);controls.update();}window.dispatchEvent(new CustomEvent('praman-cell-filter',{detail:filter}));invalidate();}
 function diagnostics(){const loaded=[...cells.loaded.values()];let batches=0,visibleInstances=[];for(const c of loaded)for(const root of Object.values(c.containers))root.traverse(o=>{if(root.visible&&o.userData.cityDetailBatch&&o.visible){batches++;visibleInstances.push(...o.userData.placements);}});return {...stats,visibleDetailBatches:batches,visibleGLBInstances:visibleInstances.length,visibleBuildingGLBInstances:visibleInstances.filter(p=>p.kind==='building').length,hoverPicks:interaction.hoverPicks,storedHistorical:data.historicalParcels.length,activeParcelsStored:fabric.parcelObjects.size,activeParcelsVisible:[...fabric.parcelObjects.values()].filter(p=>fabric.cellGroups.get(p.cellId).visible&&groups.parcels.visible).length,loadedCells:[...cells.loaded.keys()],detailedBuildingInstances:loaded.reduce((n,c)=>n+c.plan.placements.filter(p=>p.kind==='building'&&p.assetId).length,0),visibleCellIds:[...fabric.cellGroups].filter(([,r])=>r.visible&&groups.parcels.visible).map(([id])=>id),filter};}
 function clearHistoricalFocus(){historical?.dispose();historical?.object.removeFromParent();historical=null;}
 update();return {getVisibleCellIds:()=>[...fabric.cellGroups].filter(([,r])=>r.visible&&groups.parcels.visible).map(([id])=>id),manifest,stats,update,focus,clearHistoricalFocus,setDetailEnabled(value){detailEnabled=value;},setFilter,whenSettled,diagnostics,dispose(){disposed=true;interaction.setHoverHandler(null);hoverLabel.remove();clearTimeout(timer);window.removeEventListener('praman-spatial-state',onState);cells.dispose();batcher.dispose();overviews.forEach(o=>o.dispose());roots.forEach(r=>{r.userData.releaseMarker?.();r.traverse(o=>{if(o.isInstancedMesh)o.dispose();});r.userData.lineGeometry.dispose();r.removeFromParent();});overviewMaterial.dispose();markerMaterial.dispose();markerGeometry.dispose();edgesMaterial.dispose();labels.forEach(l=>l.element.remove());selectedLabel.remove();detailStatus.remove();historical?.dispose();}};
}
