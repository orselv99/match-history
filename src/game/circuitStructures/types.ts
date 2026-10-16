import * as THREE from 'three';

export interface StructureMaterials {
  concreteMat: THREE.MeshStandardMaterial;
  steelMat: THREE.MeshStandardMaterial;
  roofMat: THREE.MeshStandardMaterial;
  seatRedMat: THREE.MeshStandardMaterial;
  seatBlueMat: THREE.MeshStandardMaterial;
  glassMat: THREE.MeshStandardMaterial;
  emissiveRedMat: THREE.MeshStandardMaterial;
  emissiveCyanMat: THREE.MeshStandardMaterial;
  floodlightBulbMat: THREE.MeshStandardMaterial;
}

export function createStructureMaterials(): StructureMaterials {
  return {
    concreteMat: new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.85, metalness: 0.15 }),
    steelMat: new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.5, metalness: 0.6 }),
    roofMat: new THREE.MeshStandardMaterial({ color: 0xf1f5f9, roughness: 0.4, metalness: 0.3 }),
    seatRedMat: new THREE.MeshStandardMaterial({ color: 0xdc2626, roughness: 0.6 }),
    seatBlueMat: new THREE.MeshStandardMaterial({ color: 0x2563eb, roughness: 0.6 }),
    glassMat: new THREE.MeshStandardMaterial({
      color: 0x38bdf8,
      roughness: 0.1,
      metalness: 0.85,
      transparent: true,
      opacity: 0.75,
    }),
    emissiveRedMat: new THREE.MeshStandardMaterial({
      color: 0xef4444,
      emissive: 0xef4444,
      emissiveIntensity: 2.8,
      roughness: 0.2,
    }),
    emissiveCyanMat: new THREE.MeshStandardMaterial({
      color: 0x38bdf8,
      emissive: 0x0284c7,
      emissiveIntensity: 1.8,
      roughness: 0.2,
    }),
    floodlightBulbMat: new THREE.MeshStandardMaterial({
      color: 0xffffff,
      emissive: 0xfffbeb,
      emissiveIntensity: 0.05,
      roughness: 0.15,
      metalness: 0.1,
    }),
  };
}

