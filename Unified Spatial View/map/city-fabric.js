import {isCurrentAuthority} from '../data/temporal-model.js';
import {Group,Mesh,BufferGeometry,Float32BufferAttribute,MeshBasicMaterial,LineBasicMaterial,LineSegments,Box3,Vector3,DoubleSide,Color} from 'three';
import {createParcel} from './parcel-renderer.js';
export const LAND_COLORS={PUBLIC_PARK:0xa1c699,GREEN_BELT:0x85b78e,PLAYGROUND:0xb6c69e,PARKING_AREA:0xb7bec7,ROAD_ACCESS_CORRIDOR:0x667581,VACANT_PLOT:0xd9d2bb,UNDER_CONSTRUCTION_PLOT:0xd8bd96};
// Batched drawing retains a triangle→parcel identity mapping; no identity is merged away.
export function createCityFabric({data,manifest,groups,interaction,camera,controls,invalidate}){
 const cells=new Map(),parcelObjects=new Map(),resources=[],unregister=[];
 const material=new MeshBasicMaterial({vertexColors:true,side:DoubleSide}),lineMaterial=new LineBasicMaterial({color:0x54616c});resources.push(material,lineMaterial);
 const geometryById=new Map(data.geometryVersions.map(g=>[g.id,g]));
 const parcelById=new Map(data.parcels.filter(p=>isCurrentAuthority(p,geometryById.get(p.geometryId))).map(p=>[p.id,p]));
 for(const cell of data.cells){
  const root=new Group();root.name=cell.id;groups.parcels.add(root);const positions=[],colors=[],lines=[],faces=[];
  for(const id of cell.parcelIds){const p=parcelById.get(id);if(!p?.geometry)continue;const color=new Color(LAND_COLORS[manifest.propertyTypes[id]]??0xc7c6b9);const parts=p.geometry.type==='Polygon'?[p.geometry.coordinates]:p.geometry.coordinates;
   for(const rings of parts){const part=createParcel({id,outer:rings[0],holes:rings.slice(1)}),geo=part.object.geometry.toNonIndexed();positions.push(...geo.attributes.position.array);for(let i=0;i<geo.attributes.position.count;i++)colors.push(color.r,color.g,color.b);for(let i=0;i<geo.attributes.position.count/3;i++)faces.push({kind:'parcel',id});geo.dispose();part.dispose();
    for(const ring of rings)for(let i=1;i<ring.length;i++)lines.push(ring[i-1][0],.045,ring[i-1][1],ring[i][0],.045,ring[i][1]);
   }parcelObjects.set(id,{cellId:cell.id,geometry:p.geometry});
  }
  const geometry=new BufferGeometry();geometry.setAttribute('position',new Float32BufferAttribute(positions,3));geometry.setAttribute('color',new Float32BufferAttribute(colors,3));geometry.computeBoundingBox();geometry.computeBoundingSphere();const mesh=new Mesh(geometry,material);mesh.position.y=.02;mesh.userData.selectionForFace=i=>faces[i];mesh.userData.originalColors=new Float32Array(colors);root.add(mesh);unregister.push(interaction.register(mesh));resources.push(geometry);
  const edgeGeo=new BufferGeometry();edgeGeo.setAttribute('position',new Float32BufferAttribute(lines,3));root.add(new LineSegments(edgeGeo,lineMaterial));resources.push(edgeGeo);cells.set(cell.id,root);
 }
 let selectionFillVisible=true;let highlight=null;const showSelection=id=>{highlight?.dispose();highlight?.object.removeFromParent();highlight=null;const p=parcelById.get(id);if(!p?.geometry)return;const group=new Group(),parts=p.geometry.type==='Polygon'?[p.geometry.coordinates]:p.geometry.coordinates,rs=[];for(const rings of parts){const r=createParcel({id,outer:rings[0],holes:rings.slice(1)});r.object.position.y=.07;r.object.material.color.setHex(0x1f618b);r.object.material.opacity=.2;group.add(r.object);rs.push(r);}group.visible=selectionFillVisible;groups.parcels.add(group);highlight={object:group,dispose(){rs.forEach(r=>r.dispose());}};};
 const onState=e=>{groups.parcels.visible=e.detail.activeOrder.includes('canonical');showSelection(e.detail.selectedParcel);invalidate();};window.addEventListener('praman-spatial-state',onState);
 const bounds=new Box3().setFromObject(groups.parcels);
 function fit(){const c=bounds.getCenter(new Vector3()),size=bounds.getSize(new Vector3()),d=Math.max(size.z,size.x/camera.aspect)/(2*Math.tan(camera.fov*Math.PI/360))*1.3;controls.maxDistance=Math.max(5000,d*2);controls.target.copy(c);camera.position.set(c.x,d*.94,c.z+d*.34);controls.update();controls.saveState();invalidate();}
 let issueSignature='';
 function setIssueIds(ids){const signature=ids?[...ids].sort().join('|'):'none';if(signature===issueSignature)return;issueSignature=signature;const background=new Color('#f1f5f9');for(const root of cells.values())for(const mesh of root.children){const original=mesh.userData.originalColors;if(!original)continue;const attr=mesh.geometry.attributes.color;for(let i=0;i<attr.count;i++){const faded=ids&&!ids.has(mesh.userData.selectionForFace(Math.floor(i/3)).id),mix=faded?.9:0;attr.setXYZ(i,original[i*3]*(1-mix)+background.r*mix,original[i*3+1]*(1-mix)+background.g*mix,original[i*3+2]*(1-mix)+background.b*mix);}attr.needsUpdate=true;}invalidate();}
 fit();return {setSelectionFillVisible(value){selectionFillVisible=value;if(highlight)highlight.object.visible=value;},setIssueIds,fit,bounds,cellGroups:cells,parcelObjects,showSelection,dispose(){window.removeEventListener('praman-spatial-state',onState);highlight?.dispose();unregister.forEach(fn=>fn());resources.forEach(r=>r.dispose());groups.parcels.clear();}};
}
