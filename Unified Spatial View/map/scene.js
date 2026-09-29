import * as THREE from 'three';
export const GROUP_NAMES = Object.freeze(['parcels','buildings','roads','parks','trees','props','sourceGeometry','historicalGeometry','conflicts','temporaryAnimations']);
export function createScene(host) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#f1f5f9');
  const renderer = new THREE.WebGLRenderer({antialias:true,alpha:false,powerPreference:'low-power'});
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.5));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = false;
  renderer.domElement.className = 'spatial-canvas';
  renderer.domElement.tabIndex = 0;
  renderer.domElement.setAttribute('aria-label','Unified Spatial View. Drag to orbit; right-drag to pan; scroll to zoom.');
  host.prepend(renderer.domElement);
  const groups = Object.fromEntries(GROUP_NAMES.map(name=>{const g=new THREE.Group();g.name=name;scene.add(g);return [name,g];}));
  groups.historicalGeometry.visible = false;
  scene.add(new THREE.HemisphereLight(0xffffff,0x89939d,2));
  const sun = new THREE.DirectionalLight(0xffffff,2.2);sun.position.set(20,35,15);scene.add(sun);
  return {scene,renderer,groups,dispose(){renderer.dispose();renderer.domElement.remove();}};
}
