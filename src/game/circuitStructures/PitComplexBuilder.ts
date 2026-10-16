import * as THREE from 'three';
import type { StructureMaterials } from './types.ts';

/**
 * 2층 레이싱팀 피트 빌딩 & 피트 월 & 피트 레인 (Pit Complex & Pit Wall)
 * - 출발선 이전 (Z <= 0) 구간에 완벽 배치
 * - 트랙과 피트 레인 분리 방호벽 (피트 월) 및 팀 텔레메트리 퍼치
 * - 피트 레인 아스팔트 주행로
 * - 6개 레이싱팀 정비 가레지 베이 도어 & 상단 사이니지
 * - 2층 VIP 패독 라운지 파노라마 틴티드 글래스 창문
 */
export function buildPitComplex(materials: StructureMaterials, circuitWidth: number): THREE.Group {
  const pitGroup = new THREE.Group();
  const halfW = circuitWidth / 2;
  const pitBaseX = -(halfW + 3.0);
  const pitLength = 46.0;
  const pitZ = 0.0; // 트랙 전용 앵커 프레임 기준 Z=0 중심 대칭 배치

  // A. 피트 월 (트랙과 피트 레인 분리 방호벽)
  const pitWallLength = 32.0;
  const pitWallZ = 0.0;
  const pitWallGeom = new THREE.BoxGeometry(0.7, 1.15, pitWallLength);
  const pitWall = new THREE.Mesh(pitWallGeom, materials.concreteMat);
  pitWall.position.set(pitBaseX + 1.2, 0.575, pitWallZ);
  pitGroup.add(pitWall);

  // 피트 스탠드 / 텔레메트리 모니터 퍼치 (팀 피트 부스 3동)
  const perchGeom = new THREE.BoxGeometry(1.6, 1.8, 3.0);
  for (let p = 0; p < 3; p++) {
    const perch = new THREE.Mesh(perchGeom, materials.steelMat);
    perch.position.set(pitBaseX + 1.2, 1.3, pitWallZ - 10.0 + p * 10.0);
    const screenGeom = new THREE.BoxGeometry(0.15, 0.6, 1.4);
    const screen = new THREE.Mesh(screenGeom, materials.emissiveCyanMat);
    screen.position.set(pitBaseX + 1.2 - 0.75, 1.6, pitWallZ - 10.0 + p * 10.0);
    pitGroup.add(perch, screen);
  }

  // B. 피트 레인 아스팔트 바닥 (메인 서킷 노면과 동일한 아스팔트 톤 및 그림자 동기화)
  const pitRoadGeom = new THREE.PlaneGeometry(6.4, pitLength);
  const pitRoadMat = new THREE.MeshStandardMaterial({ color: 0x2e323b, roughness: 0.68, metalness: 0.16 });
  const pitRoad = new THREE.Mesh(pitRoadGeom, pitRoadMat);
  pitRoad.rotation.x = -Math.PI / 2;
  pitRoad.position.set(pitBaseX - 2.5, 0.052, pitZ);
  pitRoad.receiveShadow = true;
  pitGroup.add(pitRoad);

  // C. 2층 레이싱팀 피트 가레지 빌딩
  const bldgW = 10.5;
  const bldgH = 7.0;
  const bldgGeom = new THREE.BoxGeometry(bldgW, bldgH, pitLength);
  const pitBldg = new THREE.Mesh(bldgGeom, materials.concreteMat);
  pitBldg.position.set(pitBaseX - 2.5 - 3.2 - bldgW / 2, bldgH / 2, pitZ);
  pitGroup.add(pitBldg);

  // 1층 피트 가레지 셔터 도어 6칸 (레이싱팀 정비 베이)
  const doorGeom = new THREE.BoxGeometry(0.2, 2.8, 5.5);
  const doorMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.4, metalness: 0.6 });
  for (let d = 0; d < 6; d++) {
    const door = new THREE.Mesh(doorGeom, doorMat);
    const bayZ = pitZ - 17.5 + d * 7.0;
    door.position.set(pitBaseX - 2.5 - 3.2 + 0.1, 1.4, bayZ);
    pitGroup.add(door);

    // 팀 피트 베이 번호 및 상단 사이니지
    const signMesh = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.5, 3.5), materials.emissiveCyanMat);
    signMesh.position.set(pitBaseX - 2.5 - 3.2 + 0.15, 3.2, bayZ);
    pitGroup.add(signMesh);
  }

  // 2층 VIP 패독 라운지 파노라마 틴티드 글래스 창문
  const vipGlassGeom = new THREE.BoxGeometry(0.2, 2.2, pitLength - 4.0);
  const vipGlass = new THREE.Mesh(vipGlassGeom, materials.glassMat);
  vipGlass.position.set(pitBaseX - 2.5 - 3.2 + 0.1, 5.2, pitZ);
  pitGroup.add(vipGlass);

  return pitGroup;
}
