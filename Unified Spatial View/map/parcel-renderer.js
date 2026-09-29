import {Shape,ShapeGeometry,Mesh,MeshBasicMaterial,DoubleSide,Vector2} from 'three';
// Local metre rings [x,z], not longitude/latitude. Supports holes; multipolygons
// can register multiple independent meshes with the same parcel identity.
export function createParcel({id,outer,holes=[],testOnly=false}){
 const validate=ring=>{if(!Array.isArray(ring)||ring.length<3||ring.some(p=>p.length!==2||p.some(v=>!Number.isFinite(v))))throw new Error('Expected local-metre polygon ring');};
 validate(outer);holes.forEach(validate);
 const shape=new Shape(outer.map(([x,z])=>new Vector2(x,-z)));
 holes.forEach(ring=>shape.holes.push(new Shape(ring.map(([x,z])=>new Vector2(x,-z)))));
 const geometry=new ShapeGeometry(shape);geometry.rotateX(-Math.PI/2);
 const material=new MeshBasicMaterial({color:0xc6deec,transparent:true,opacity:0.55,side:DoubleSide,depthWrite:false});
 const mesh=new Mesh(geometry,material);mesh.position.y=0.02;mesh.frustumCulled=true;
 mesh.userData.selection={kind:'parcel',id,testOnly};
 return {object:mesh,dispose(){geometry.dispose();material.dispose();}};
}
