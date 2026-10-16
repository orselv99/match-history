import * as THREE from 'three';
import type { StructureMaterials } from './types.ts';

/**
 * 4층 레이스 컨트롤 타워 & 대형 실시간 타이밍 전광판 (Race Control Tower & Timing Board)
 * - 출발선 직전 (Z = -2.5m, Z <= 0), 피트 빌딩 옆 배치
 * - 타워 1~3층 메인 본체 & 4층 360도 파노라마 경기 관제실
 * - 통신 안테나 스파이어
 * - 트랙 방향 실시간 레이스 타이밍 전광판 (Live Timing LED Board)
 */
export function buildControlTower(materials: StructureMaterials, circuitWidth: number): THREE.Group {
  const towerGroup = new THREE.Group();
  const halfW = circuitWidth / 2;
  const towerX = -(halfW + 10.5);
  const towerZ = 5.0; // 출발선 통과 직후 메인 스트레이트 초입에 배치하여 마지막 코너 간섭 원천 배제

  // 타워 1~3층 메인 본체
  const towerBodyGeom = new THREE.BoxGeometry(6.8, 11.0, 6.8);
  const towerBody = new THREE.Mesh(towerBodyGeom, materials.concreteMat);
  towerBody.position.set(towerX, 5.5, towerZ);

  // 4층 최상단 360도 파노라마 경기 관제실
  const obsDeckGeom = new THREE.BoxGeometry(8.6, 3.6, 8.6);
  const obsDeck = new THREE.Mesh(obsDeckGeom, materials.glassMat);
  obsDeck.position.set(towerX, 12.5, towerZ);

  // 타워 지붕 통신 안테나 스파이어
  const spireGeom = new THREE.CylinderGeometry(0.12, 0.16, 6.5, 8);
  const spire = new THREE.Mesh(spireGeom, materials.steelMat);
  spire.position.set(towerX, 17.5, towerZ);

  // 트랙 방향 실시간 레이스 타이밍 전광판 (Live Timing LED Board)
  const boardGeom = new THREE.BoxGeometry(0.2, 7.0, 4.2);
  const board = new THREE.Mesh(boardGeom, materials.steelMat);
  board.position.set(towerX + 3.5, 6.5, towerZ);

  const timingLedGeom = new THREE.BoxGeometry(0.22, 0.5, 3.6);
  for (let l = 0; l < 4; l++) {
    const ledMat = l === 0 ? materials.emissiveCyanMat : materials.emissiveRedMat;
    const ledLine = new THREE.Mesh(timingLedGeom, ledMat);
    ledLine.position.set(towerX + 3.51, 8.5 - l * 1.3, towerZ);
    towerGroup.add(ledLine);
  }

  towerGroup.add(towerBody, obsDeck, spire, board);
  return towerGroup;
}
