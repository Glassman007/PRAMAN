import {Group,Box3,Vector3,BufferGeometry,Float32BufferAttribute,LineSegments,LineBasicMaterial} from 'three';
import {createParcel} from './parcel-renderer.js';
// Only normalized local-metre geometry enters this renderer. No table columns or ID arithmetic.
export function createParcelFabric({data,groups,interaction,camera,controls,invalidate}){
 const resources=[],unregister=[],cellGroups=new Map();
 const palette=[0x95bfc4,0xc5b58b,0xa5bca0,0xb2aecb,0xc8a7a0,0x8fb3d0,0xc2bf8c,0x9ac4b7,0xc4aac2,0xb0bac4];
 for(const [i,cell] of data.cells.entries()){
  const root=new Group();root.name=cell.id;root.userData.cellId=cell.id;groups.parcels.add(root);cellGroups.set(cell.id,{root,color:palette[i%palette.length],lines:[]});
 }
 const parcelObjects=new Map();
 for(const p of data.parcels.filter(p=>p.is_active&&p.geometry)){
  const cell=cellGroups.get(p.cellId);if(!cell)throw new Error('Unresolved normalized cell '+p.cellId);
  const parts=p.geometry.type==='Polygon'?[p.geometry.coordinates]:p.geometry.type==='MultiPolygon'?p.geometry.coordinates:null;
  if(!parts)throw new Error('Unsupported normalized geometry type');
  const objects=[];
  for(const rings of parts){
   const part=createParcel({id:p.id,outer:rings[0],holes:rings.slice(1)});part.object.material.color.setHex(cell.color);part.object.material.opacity=0.75;
   part.object.userData.cellId=p.cellId;cell.root.add(part.object);resources.push(part);unregister.push(interaction.register(part.object));objects.push(part.object);
   for(const ring of rings)for(let i=1;i<ring.length;i++)cell.lines.push(...[ring[i-1][0],0.04,ring[i-1][1],ring[i][0],0.04,ring[i][1]]);
  }
  parcelObjects.set(p.id,objects);
 }
 for(const cell of cellGroups.values()){
  const geometry=new BufferGeometry();geometry.setAttribute('position',new Float32BufferAttribute(cell.lines,3));const material=new LineBasicMaterial({color:0x334155});const lines=new LineSegments(geometry,material);cell.root.add(lines);resources.push({dispose(){geometry.dispose();material.dispose();}});
 }
 const bounds=new Box3().setFromObject(groups.parcels),center=bounds.getCenter(new Vector3()),size=bounds.getSize(new Vector3());
 function fit(){const verticalFov=camera.fov*Math.PI/180;const distance=Math.max(size.z,size.x/Math.max(camera.aspect,0.1))/(2*Math.tan(verticalFov/2))*1.35;controls.maxDistance=Math.max(2500,distance*2);camera.position.set(center.x,distance,center.z+distance*0.18);controls.target.copy(center);controls.update();controls.saveState();invalidate();}
 let selected=[];
 function onState(e){groups.parcels.visible=e.detail.activeOrder.includes('canonical');for(const o of selected)o.material.color.copy(o.userData.baseColor);selected=parcelObjects.get(e.detail.selectedParcel)||[];for(const o of selected){o.userData.baseColor??=o.material.color.clone();o.material.color.setHex(0xe4a638);}invalidate();}
 window.addEventListener('praman-spatial-state',onState);fit();
 return {fit,parcelObjects,cellGroups,bounds,dispose(){window.removeEventListener('praman-spatial-state',onState);unregister.forEach(fn=>fn());resources.forEach(r=>r.dispose());groups.parcels.clear();}};
}
