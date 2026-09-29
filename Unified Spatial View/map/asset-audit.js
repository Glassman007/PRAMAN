import {Box3,Vector3} from 'three';
// Inspect GLTFLoader's scene, never parse GLB bytes. Counts cover the default scene.
export function inspectAsset(gltf){
 const root=gltf.scene;root.updateMatrixWorld(true);
 const bounds=new Box3().setFromObject(root,true),size=bounds.getSize(new Vector3()),center=bounds.getCenter(new Vector3());
 const meshes=[],materials=new Set(),textures=new Set(),transforms=[],problems=[];
 let triangles=0,skinned=0,morph=0,nestedInstances=0,nonTriangle=0,negative=0,singular=0,nonUniform=0;
 root.traverse(node=>{
  if(node.isLine||node.isPoints)nonTriangle++;
  const scale=node.scale.toArray(),det=node.matrixWorld.determinant();
  const unusual=[];
  if(det<0){negative++;unusual.push('negative world determinant');}
  if(Math.abs(det)<1e-12){singular++;unusual.push('singular/near-singular transform');}
  if(Math.max(...scale.map(Math.abs))-Math.min(...scale.map(Math.abs))>1e-6){nonUniform++;unusual.push('native nonuniform scale');}
  if(scale.some(v=>Math.abs(v)>100||Math.abs(v)<0.001))unusual.push('extreme native scale');
  if(node.position.length()>1000)unusual.push('large native translation');
  if(unusual.length)transforms.push({name:node.name,type:node.type,position:node.position.toArray(),scale,determinant:det,flags:unusual});
  if(!node.isMesh)return;
  meshes.push(node);if(node.isSkinnedMesh)skinned++;if(node.morphTargetInfluences?.length)morph++;if(node.isInstancedMesh)nestedInstances++;
  const g=node.geometry;triangles+=(g.index?g.index.count:g.attributes.position?.count||0)/3*(node.isInstancedMesh?node.count:1);
  (Array.isArray(node.material)?node.material:[node.material]).filter(Boolean).forEach(m=>{materials.add(m);Object.values(m).forEach(v=>{if(v?.isTexture)textures.add(v);});});
 });
 if(!meshes.length)problems.push('No meshes in default scene');
 if([...bounds.min,...bounds.max].some(v=>!Number.isFinite(v)))problems.push('Nonfinite bounds');
 if(singular)problems.push('Singular transforms');
 const reasons=[];
 if(skinned)reasons.push('skinned meshes');if(morph)reasons.push('morph targets');if(nestedInstances)reasons.push('nested InstancedMesh');if(negative)reasons.push('negative transforms');if(singular)reasons.push('singular transforms');if(gltf.animations.length)reasons.push('animation clips');if(nonTriangle)reasons.push('line/point primitives');
 if([...materials].some(m=>m.transparent))reasons.push('transparent materials require per-object sorting');
 return {nativeBounds:{min:bounds.min.toArray(),max:bounds.max.toArray()},nativeWidth:size.x,nativeDepth:size.z,nativeHeight:size.y,meshCount:meshes.length,triangleCount:triangles,materialCount:materials.size,textureCount:textures.size,lowestY:bounds.min.y,
 pivot:{origin:[0,0,0],boundsCenter:center.toArray(),bottomCenter:[center.x,bounds.min.y,center.z],groundedAtOrigin:Math.abs(bounds.min.y)<1e-5},
 orientation:{sceneUp:'Y (glTF convention)',semanticUpright:'requires visual review',rootRotationRadians:root.rotation.toArray().slice(0,3)},
 unusualTransforms:transforms,negativeTransforms:negative,nonUniformTransforms:nonUniform,singularTransforms:singular,skinnedMeshes:skinned,morphMeshes:morph,animationClips:gltf.animations.length,
 instancingAllowed:!reasons.length&&meshes.length>0,instancingReasons:reasons,problems};
}
