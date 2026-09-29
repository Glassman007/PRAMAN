import {MOUSE,TOUCH} from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {CAMERA_LIMITS} from './camera.js';
export function createControls(camera,canvas,onChange){
 const controls=new OrbitControls(camera,canvas);
 Object.assign(controls,CAMERA_LIMITS);
 controls.enableDamping=false; // On-demand frames; no permanent animation loop.
 controls.screenSpacePanning=false;
 controls.target.set(0,0,0);
 controls.mouseButtons={LEFT:MOUSE.ROTATE,MIDDLE:MOUSE.DOLLY,RIGHT:MOUSE.PAN};
 controls.touches={ONE:TOUCH.ROTATE,TWO:TOUCH.DOLLY_PAN};
 controls.update();controls.saveState();controls.addEventListener('change',onChange);
 return {controls,reset:()=>controls.reset(),dispose(){controls.removeEventListener('change',onChange);controls.dispose();}};
}
