import {Box3,Vector3,Mesh,PlaneGeometry,MeshBasicMaterial,DoubleSide,BufferGeometry,Float32BufferAttribute,LineBasicMaterial,LineSegments} from 'three';
export async function createPilot({plan,data,fabric,groups,assets,interaction,camera,controls,invalidate,host}){
 const disposers=[],objects=new Map(),batches=new Map();
 const colors={PUBLIC_PARK:0xa1c699,GREEN_BELT:0x85b78e,PLAYGROUND:0xb6c69e,PARKING_AREA:0xb7bec7,ROAD_ACCESS_CORRIDOR:0x667581,VACANT_PLOT:0xd9d2bb,UNDER_CONSTRUCTION_PLOT:0xd8bd96};
 for(const [id,meshes] of fabric.parcelObjects)for(const m of meshes)m.material.color.setHex(colors[plan.propertyTypes[id]]??0xc7c6b9);
 for(const id of plan.roadParcelIds){for(const m of fabric.parcelObjects.get(id)||[])m.userData.surfaceRole='Actual cadastral access parcel; no inferred connecting network';}
 const roadGroup=groups.roads; // Road context is a duplicate surface of actual access geometry, never a new parcel.
 const {createParcel}=await import('./parcel-renderer.js');
 for(const id of plan.roadParcelIds){const p=data.parcels.find(p=>p.id===id);const r=createParcel({id,outer:p.geometry.coordinates[0],holes:p.geometry.coordinates.slice(1)});r.object.position.y=.025;r.object.material.color.setHex(0x667581);roadGroup.add(r.object);disposers.push(()=>r.dispose());}
 await Promise.all([...new Set(plan.placements.map(p=>p.assetId).filter(Boolean))].map(id=>assets.template(id)));
 for(const p of plan.placements){
  let object;
  if(p.assetId)object=await assets.clone(p.assetId);
  else {const geometry=new PlaneGeometry(4,4),material=new MeshBasicMaterial({color:0x708398,wireframe:true,side:DoubleSide});object=new Mesh(geometry,material);object.rotation.x=-Math.PI/2;disposers.push(()=>{geometry.dispose();material.dispose();});}
  object.position.set(...p.position);if(p.assetId)object.rotation.y=p.rotationY;else {object.position.y=.08;object.rotation.z=p.rotationY;}
  object.userData.selection={kind:p.kind==='building'?'building':p.kind,id:p.id,parcelId:p.parcelId,assetId:p.assetId,illustrative:true};
  const group=p.kind==='building'?groups.buildings:p.kind==='tree'?groups.trees:p.kind==='park'?groups.parks:groups.props;
  objects.set(p.id,object);
  if(p.assetId&&(p.kind==='tree'||p.kind==='prop')){
   object.updateMatrix();if(!batches.has(p.assetId))batches.set(p.assetId,{group,items:[]});batches.get(p.assetId).items.push({matrix:object.matrix.clone(),selection:object.userData.selection});
  }else {group.add(object);disposers.push(interaction.register(object));}
 }
 for(const [assetId,batch] of batches){const instance=await assets.instances(assetId,batch.items);batch.group.add(instance);disposers.push(interaction.register(instance));disposers.push(()=>instance.traverse(o=>{if(o.isInstancedMesh)o.dispose();}));}
 for(const [id,type] of Object.entries(plan.propertyTypes))if(['PUBLIC_PARK','GREEN_BELT'].includes(type)){
  const p=data.parcels.find(p=>p.id===id),surface=createParcel({id,outer:p.geometry.coordinates[0],holes:p.geometry.coordinates.slice(1)});surface.object.position.y=.025;surface.object.material.color.setHex(colors[type]);groups.parks.add(surface.object);disposers.push(()=>surface.dispose());
 }
 const vertices=[];for(const mark of plan.parkingMarkings||[])for(let i=1;i<mark.points.length;i++){for(const point of [mark.points[i-1],mark.points[i]])vertices.push(point[0],.06,point[1]);}
 if(vertices.length){const geometry=new BufferGeometry();geometry.setAttribute('position',new Float32BufferAttribute(vertices,3));const material=new LineBasicMaterial({color:0xffffff});groups.props.add(new LineSegments(geometry,material));disposers.push(()=>{geometry.dispose();material.dispose();});}
 const badge=document.createElement('div');badge.className='pilot-note';badge.textContent=`Pilot · ${plan.parcelIds.length} contiguous parcels · Illustrative assets, actual boundaries. Alt-click selects land. Outlined squares are building-record markers, not footprints.`;host.append(badge);
 const selection=document.createElement('div');selection.className='pilot-selection';selection.textContent='Click a building or parcel';host.append(selection);
 const selected=e=>{const s=e.detail;selection.textContent=s?`${s.kind}: ${s.id}${s.illustrative?' · illustrative placement':''}`:'No object selected';};window.addEventListener('praman-map-selection',selected);
 const onState=e=>{for(const group of [groups.buildings,groups.trees,groups.parks,groups.props,groups.roads])group.visible=e.detail.activeOrder.includes('canonical');invalidate();};window.addEventListener('praman-spatial-state',onState);disposers.push(()=>window.removeEventListener('praman-spatial-state',onState));
 const oldFit=fabric.fit;fabric.fit=()=>{const b=new Box3().setFromObject(groups.parcels),c=b.getCenter(new Vector3()),size=b.getSize(new Vector3()),d=Math.max(size.x/camera.aspect,size.z)*1.5;camera.position.set(c.x+d*.48,d*.9,c.z+d*.8);controls.target.copy(c);controls.update();controls.saveState();invalidate();};fabric.fit();
 return {plan,objects,dispose(){fabric.fit=oldFit;disposers.forEach(fn=>fn());for(const g of [groups.buildings,groups.trees,groups.parks,groups.props,groups.roads])g.clear();badge.remove();selection.remove();window.removeEventListener('praman-map-selection',selected);}};
}
