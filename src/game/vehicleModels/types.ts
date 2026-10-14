import * as THREE from 'three';

export interface VehicleMeshParams {
  rootGroup: THREE.Group;
  bodyMat: THREE.Material;
  darkMat: THREE.Material;
  glassMat: THREE.Material;
  headLightMat: THREE.Material;
  brakeLightMat: THREE.Material;
  isGhost: boolean;
  ghostColor: number;
  addHoloEdges: (mesh: THREE.Mesh, opacity?: number) => void;
}

export interface VehicleWheels {
  frontLeftWheel: THREE.Mesh;
  frontRightWheel: THREE.Mesh;
  rearLeftWheel: THREE.Mesh;
  rearRightWheel: THREE.Mesh;
}
