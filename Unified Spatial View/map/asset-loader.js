import {Group,InstancedMesh,Matrix4} from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {clone as cloneSkeleton} from 'three/addons/utils/SkeletonUtils.js';
import {getAsset} from './asset-registry.js';
export class AssetLoader {
 constructor(){this.loader=new GLTFLoader();this.cache=new Map();this.loads=0;this.disposed=false;}
 async template(id){
  if(this.disposed)throw new Error('Asset cache is disposed');
  const spec=getAsset(id);
  if(!this.cache.has(spec.url)){
   this.loads++;
   const promise=this.loader.loadAsync(spec.url).then(gltf=>{if(this.disposed){this.disposeObjects([gltf.scene]);throw new Error('Asset cache disposed during load');}return gltf;});
   this.cache.set(spec.url,promise);promise.catch(()=>this.cache.delete(spec.url));
  }
  return this.cache.get(spec.url);
 }
 async clone(id){
  const gltf=await this.template(id),spec=getAsset(id);
  const model=cloneSkeleton(gltf.scene);
  const scale=spec.uniformScale;
  if(!Number.isFinite(scale)||scale<=0)throw new Error('Asset has no valid metre calibration');
  const root=new Group(),calibrated=new Group(),oriented=new Group();
  calibrated.scale.setScalar(scale);
  calibrated.position.set(spec.horizontalOffset[0],spec.groundOffset,spec.horizontalOffset[1]);
  oriented.rotation.set(...spec.rotationCorrection);oriented.add(model);calibrated.add(oriented);root.add(calibrated);
  root.userData.assetId=id;root.userData.calibration=spec.calibrationBasis;
  root.traverse(o=>{if(o.isMesh)o.frustumCulled=true;});
  root.updateMatrixWorld(true);
  return root; // geometry/materials/textures shared; skeletons cloned independently.
 }
 async instances(id,placements){
  if(!getAsset(id).instancingAllowed)throw new Error(`Static instancing disabled for ${id}: ${getAsset(id).instancingReasons.join(', ')}`);
  if(!placements.length)throw new Error('Instancing requires placements');
  if(placements.some(p=>!p.matrix?.isMatrix4||p.matrix.determinant()<=0))throw new Error('Placements require positive, nonsingular Matrix4 transforms');
  const model=await this.clone(id);const group=new Group();
  model.updateMatrixWorld(true);const meshes=[];
  model.traverse(o=>{if(o.isMesh)meshes.push(o);});
  if(meshes.some(o=>o.isSkinnedMesh||o.isInstancedMesh||o.morphTargetInfluences?.length||o.matrixWorld.determinant()<=0))throw new Error('Use clones for skinned, morph or already-instanced assets');
  for(const source of meshes){
   const mesh=new InstancedMesh(source.geometry,source.material,placements.length);
   placements.forEach((p,i)=>mesh.setMatrixAt(i,new Matrix4().multiplyMatrices(p.matrix,source.matrixWorld)));
   mesh.instanceMatrix.needsUpdate=true;mesh.computeBoundingBox();mesh.computeBoundingSphere();mesh.frustumCulled=true;
   mesh.userData.selectionByInstance=placements.map(p=>p.selection || null);group.add(mesh);
  }
  return group;
 }
 disposeObjects(objects){
  const geometries=new Set(),materials=new Set(),textures=new Set();
  objects.forEach(root=>root.traverse(o=>{if(o.geometry)geometries.add(o.geometry);for(const m of (Array.isArray(o.material)?o.material:[o.material]).filter(Boolean)){materials.add(m);Object.values(m).forEach(v=>{if(v?.isTexture)textures.add(v);});}}));
  textures.forEach(t=>{t.source?.data?.close?.();t.dispose();});materials.forEach(m=>m.dispose());geometries.forEach(g=>g.dispose());
 }
 async dispose(){this.disposed=true;const results=await Promise.allSettled(this.cache.values());this.disposeObjects(results.filter(r=>r.status==='fulfilled').map(r=>r.value.scene));this.cache.clear();}
}
