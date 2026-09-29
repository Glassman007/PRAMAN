import {PerspectiveCamera} from 'three';
// All camera distances are metres; Y is up. X/Z are local metric coordinates.
export const CAMERA_LIMITS = Object.freeze({minDistance:5,maxDistance:2500,minPolarAngle:5*Math.PI/180,maxPolarAngle:70*Math.PI/180});
export function createCamera(){const camera=new PerspectiveCamera(45,1,0.1,10000);camera.position.set(24,30,34);return camera;}
