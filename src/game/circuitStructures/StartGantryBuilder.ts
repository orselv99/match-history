import * as THREE from 'three';
import type { StructureMaterials } from './types.ts';

/**
 * 출발선 3구 스타팅 라이트 갠트리 (Start / Finish Gantry)
 * - 좌우 강철 기둥 및 상단 트러스 브릿지
 * - 3구 스타팅 라이트 (3 > 2 > 1 > GO! 카운트다운 연동)
 * - 트랙 폭 맞춤 상단 START / FINISH 사이니지
 */
export function buildStartGantry(materials: StructureMaterials, circuitWidth: number): THREE.Group {
  const gantry = new THREE.Group();
  gantry.name = 'start_finish_gantry';
  const halfW = circuitWidth / 2;
  const postX = halfW + 1.4;

  // 좌우 기둥
  const postGeom = new THREE.BoxGeometry(0.7, 7.5, 0.7);
  const leftPost = new THREE.Mesh(postGeom, materials.steelMat);
  leftPost.position.set(-postX, 3.75, 0);
  const rightPost = new THREE.Mesh(postGeom, materials.steelMat);
  rightPost.position.set(postX, 3.75, 0);

  // 상단 트러스 브릿지
  const bridgeW = postX * 2 + 1.4;
  const bridgeGeom = new THREE.BoxGeometry(bridgeW, 0.8, 1.2);
  const bridge = new THREE.Mesh(bridgeGeom, materials.steelMat);
  bridge.position.set(0, 7.1, 0);

  // 3구 스타팅 라이트 박스 (2.8m 폭)
  const lightBoxGeom = new THREE.BoxGeometry(2.8, 0.9, 0.3);
  const lightBox = new THREE.Mesh(lightBoxGeom, materials.steelMat);
  lightBox.position.set(0, 6.2, -0.65);

  // 3구 라이트 배치: -0.8 (1번), 0.0 (2번), 0.8 (3번)
  const lightGeom = new THREE.CylinderGeometry(0.24, 0.24, 0.12, 16);
  lightGeom.rotateX(Math.PI / 2);
  for (let i = 0; i < 3; i++) {
    const lightMesh = new THREE.Mesh(lightGeom, materials.lightOffMat);
    lightMesh.position.set(-0.8 + i * 0.8, 6.2, -0.82);
    lightMesh.name = `gantry_light_${i}`;
    gantry.add(lightMesh);
  }

  // 상단 "START / FINISH" 전광판
  const signGeom = new THREE.BoxGeometry(Math.min(12.0, circuitWidth), 0.75, 0.2);
  const sign = new THREE.Mesh(signGeom, materials.emissiveCyanMat);
  sign.position.set(0, 7.8, -0.65);

  gantry.add(leftPost, rightPost, bridge, lightBox, sign);
  return gantry;
}
