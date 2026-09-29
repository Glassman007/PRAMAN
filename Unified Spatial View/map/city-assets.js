import {Group,InstancedMesh} from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {getAsset} from './asset-registry.js';
// Exact static geometry batching, not model simplification or GLB-byte rewriting.
export class CityAssets {
 constructor(loader){this.loader=loader;this.cache=new Map();this.disposed=false;}
 async template(id){if(!getAsset(id).instancingAllowed)return null;
  if(!this.cache.has(id))this.cache.set(id,(async()=>{
   const root=await this.loader.clone(id),buckets=new Map();root.updateMatrixWorld(true);
   root.traverse(o=>{if(!o.isMesh)return;const materials=Array.isArray(o.material)?o.material:[o.material],g=o.geometry.index?o.geometry.toNonIndexed():o.geometry.clone();g.applyMatrix4(o.matrixWorld);
    const groups=Array.isArray(o.material)?g.groups:[{start:0,count:g.attributes.position.count,materialIndex:0}];
    for(const part of groups){const material=materials[part.materialIndex];if(!material)continue;const geometry=g.clone();for(const [name,attr] of Object.entries(geometry.attributes)){geometry.setAttribute(name,new attr.constructor(attr.array.slice(part.start*attr.itemSize,(part.start+part.count)*attr.itemSize),attr.itemSize,attr.normalized));}geometry.clearGroups();
     const description=material.toJSON();delete description.uuid;delete description.name;const key=JSON.stringify(description)+Object.entries(geometry.attributes).map(([k,a])=>k+a.itemSize+a.normalized).join(',');if(!buckets.has(key))buckets.set(key,{material,geometries:[]});buckets.get(key).geometries.push(geometry);
    }g.dispose();
   });
   const result=[];for(const b of buckets.values()){const geometry=mergeGeometries(b.geometries);if(!geometry)throw new Error('Static geometry batching failed for '+id);b.geometries.forEach(g=>g.dispose());geometry.computeBoundingSphere();result.push({geometry,material:b.material});}
   if(this.disposed){result.forEach(r=>r.geometry.dispose());throw new Error('City asset cache disposed');}return result;
  })());return this.cache.get(id);
 }
 async instances(id,placements){const parts=await this.template(id);if(!parts)return null;const root=new Group();
  for(const part of parts){const mesh=new InstancedMesh(part.geometry,part.material,placements.length);placements.forEach((p,i)=>mesh.setMatrixAt(i,p.matrix));mesh.instanceMatrix.needsUpdate=true;mesh.computeBoundingBox();mesh.computeBoundingSphere();mesh.userData.selectionByInstance=placements.map(p=>p.selection);root.add(mesh);}return root;
 }
 async dispose(){this.disposed=true;const values=await Promise.allSettled(this.cache.values());values.filter(v=>v.status==='fulfilled').forEach(v=>v.value.forEach(p=>p.geometry.dispose()));this.cache.clear();}
}
