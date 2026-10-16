import * as THREE from 'three';
import { VEHICLE_MODELS, type VehicleModelId } from '../../data/vehicles.ts';
import { buildGTTurboGeometry } from './GTTurboMesh.ts';
import { buildFormulaAeroGeometry } from './FormulaAeroMesh.ts';
import { buildCyberSpeedsterGeometry } from './CyberSpeedsterMesh.ts';
import type { VehicleMeshParams, VehicleWheels } from './types.ts';

/**
 * 차량 정면 듀얼 LED 프로젝터 렌즈 플레어 스프라이트 생성
 */
export function createLensGlowSprite(): THREE.Sprite {
  if (typeof document === 'undefined') return new THREE.Sprite();
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    // 차량 정면에서 직접 바라볼 때 선명한 듀얼 LED 프로젝터 코어 & 광배
    const grad = ctx.createRadialGradient(64, 64, 2, 64, 64, 60);
    grad.addColorStop(0.0, 'rgba(255, 255, 255, 1.0)');
    grad.addColorStop(0.18, 'rgba(254, 243, 199, 0.95)');
    grad.addColorStop(0.45, 'rgba(186, 230, 253, 0.45)');
    grad.addColorStop(0.75, 'rgba(125, 211, 252, 0.12)');
    grad.addColorStop(1.0, 'rgba(56, 189, 248, 0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(64, 64, 60, 0, Math.PI * 2);
    ctx.fill();
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.SpriteMaterial({

    map: tex,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(0.75, 0.75, 1.0);
  return sprite;
}

/**
 * 전방 아스팔트 노면 헤드라이트 투사 빔 메시 생성
 */
export function createGroundBeamMesh(): THREE.Mesh {
  if (typeof document === 'undefined') {
    return new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial());
  }
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.clearRect(0, 0, 512, 512);

    // 차량 전방 도로 전체를 하나로 자연스럽게 비추는 단일(Unified) 로드 일루미네이션 광선
    // 두 갈래(줄기)로 나뉘지 않고 범퍼 전방 노면 전체를 하나로 부드럽게 밝힘
    const grad = ctx.createRadialGradient(256, 30, 10, 256, 260, 250);
    grad.addColorStop(0.0, 'rgba(255, 255, 250, 0.65)');
    grad.addColorStop(0.25, 'rgba(254, 243, 199, 0.38)');
    grad.addColorStop(0.55, 'rgba(224, 242, 254, 0.16)');
    grad.addColorStop(0.80, 'rgba(186, 230, 253, 0.05)');
    grad.addColorStop(1.0, 'rgba(147, 197, 253, 0)');

    ctx.save();
    ctx.fillStyle = grad;
    ctx.beginPath();
    // 차량 전방 범퍼 폭(약 2m)에서 전방 30m 노면으로 고르게 퍼지는 단일 부채꼴
    ctx.moveTo(180, 20);
    ctx.lineTo(332, 20);
    ctx.bezierCurveTo(385, 160, 420, 310, 435, 490);
    ctx.lineTo(77, 490);
    ctx.bezierCurveTo(92, 310, 127, 160, 180, 20);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    // 전방 도로 중앙 핫스팟 (단일 중앙 집중 광선 - 두 갈래 분할 완전 제거)
    const gradCenter = ctx.createRadialGradient(256, 170, 10, 256, 210, 150);
    gradCenter.addColorStop(0.0, 'rgba(255, 255, 255, 0.50)');
    gradCenter.addColorStop(0.35, 'rgba(254, 249, 195, 0.22)');
    gradCenter.addColorStop(0.70, 'rgba(224, 242, 254, 0.06)');
    gradCenter.addColorStop(1.0, 'rgba(186, 230, 253, 0)');

    ctx.save();
    ctx.fillStyle = gradCenter;
    ctx.beginPath();
    ctx.ellipse(256, 210, 100, 160, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const geom = new THREE.PlaneGeometry(8.5, 32);

  geom.rotateX(-Math.PI / 2);
  geom.translate(0, 0.04, 16.5);

  const mat = new THREE.MeshBasicMaterial({
    map: tex,
    transparent: true,
    opacity: 0.65,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    depthTest: false, // 도로 고저차나 오르막 경사에서 빔이 땅속으로 파묻혀 꺼지는 현상 원천 차단
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(geom, mat);
  mesh.renderOrder = 2;
  return mesh;
}


/**
 * 차량 상단 3D 빌보드 네임태그 스프라이트 생성
 */
export function createNameTagSprite(driverName: string, color: string, visible: boolean): THREE.Sprite {
  const canvas = document.createElement('canvas');
  canvas.width = 384;
  canvas.height = 96;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.clearRect(0, 0, 384, 96);

    const fontSize = 26;
    ctx.font = `700 ${fontSize}px 'JetBrains Mono', 'Inter', -apple-system, BlinkMacSystemFont, monospace, sans-serif`;
    ctx.textBaseline = 'middle';

    const textW = ctx.measureText(driverName).width;
    const dotRadius = 7;
    const paddingX = 18;
    const dotSpace = dotRadius * 2 + 12;
    const contentW = dotSpace + textW;
    const pillW = Math.min(368, Math.max(120, contentW + paddingX * 2));
    const pillH = 52;
    const pillX = (384 - pillW) / 2;
    const pillY = (96 - pillH) / 2;
    const pillRadius = 14;

    // 그림자
    ctx.shadowColor = 'rgba(0, 0, 0, 0.65)';
    ctx.shadowBlur = 10;
    ctx.shadowOffsetY = 3;

    // 필 배경
    ctx.fillStyle = 'rgba(15, 23, 42, 0.88)';
    ctx.beginPath();
    if (typeof ctx.roundRect === 'function') {
      ctx.roundRect(pillX, pillY, pillW, pillH, pillRadius);
    } else {
      ctx.rect(pillX, pillY, pillW, pillH);
    }
    ctx.fill();

    // 테두리 및 텍스트는 선명하게
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.22)';
    ctx.lineWidth = 2;
    ctx.stroke();

    // 차량 고유 컬러 인디케이터 도트
    const hexColor = color.startsWith('#') ? color : `#${color}`;
    const dotX = pillX + paddingX + dotRadius;
    const dotY = 96 / 2;

    ctx.fillStyle = hexColor;
    ctx.beginPath();
    ctx.arc(dotX, dotY, dotRadius, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // 드라이버 이름
    const textX = dotX + dotRadius + 12;
    const maxTextW = pillW - (textX - pillX) - paddingX;
    ctx.fillStyle = '#ffffff';
    ctx.fillText(driverName, textX, dotY, maxTextW);
  }

  const tex = new THREE.CanvasTexture(canvas);
  const mat = new THREE.SpriteMaterial({
    map: tex,
    transparent: true,
    depthTest: true,
    depthWrite: false,
  });

  const sprite = new THREE.Sprite(mat);
  sprite.position.set(0, 1.95, 0);
  sprite.scale.set(2.4, 0.6, 1.0);
  sprite.visible = visible;
  return sprite;
}

export interface VehicleVisuals {
  bodyMaterial: THREE.MeshStandardMaterial;
  headLightMaterial: THREE.MeshStandardMaterial;
  brakeLightMaterial: THREE.MeshStandardMaterial;
  frontLeftWheel: THREE.Mesh;
  frontRightWheel: THREE.Mesh;
  rearLeftWheel: THREE.Mesh;
  rearRightWheel: THREE.Mesh;
  headSpotLight: THREE.SpotLight;
  headTarget: THREE.Object3D;
  groundBeamMesh: THREE.Mesh;
  leftLensGlow: THREE.Sprite;
  rightLensGlow: THREE.Sprite;
  leftTailPointLight: THREE.PointLight;
  rightTailPointLight: THREE.PointLight;
}

/**
 * 차량 3D 절차적 지오메트리, 재질, 휠 및 듀얼 조명 시스템 조립
 */
export function assembleVehicleVisuals(
  rootGroup: THREE.Group,
  vehicleModelId: VehicleModelId,
  isGhost: boolean,
  ghostColor: string,
  headlightsEnabled: boolean
): VehicleVisuals {
  while (rootGroup.children.length > 0) {
    rootGroup.remove(rootGroup.children[0]);
  }

  const ghostColorVal = new THREE.Color(ghostColor);

  const bodyMaterial = isGhost
    ? new THREE.MeshStandardMaterial({
        color: ghostColorVal,
        transparent: true,
        opacity: 0.35,
        roughness: 0.15,
        metalness: 0.8,
        emissive: ghostColorVal,
        emissiveIntensity: 0.65,
        flatShading: true,
      })
    : new THREE.MeshPhysicalMaterial({
        color: 0xef4444,
        roughness: 0.2,
        metalness: 0.65,
        clearcoat: 1.0,
        clearcoatRoughness: 0.08,
        flatShading: true,
      });

  const darkMat = new THREE.MeshStandardMaterial({
    color: 0x111827,
    roughness: 0.5,
    metalness: 0.4,
    transparent: isGhost,
    opacity: isGhost ? 0.25 : 1.0,
    flatShading: true,
  });

  const glassMat = new THREE.MeshPhysicalMaterial({
    color: isGhost ? ghostColorVal : 0x0f172a,
    roughness: 0.08,
    metalness: 0.9,
    clearcoat: 1.0,
    transparent: true,
    opacity: isGhost ? 0.2 : 0.88,
    flatShading: true,
  });

  const headLightMaterial = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    emissive: isGhost ? ghostColorVal : 0xffffff,
    emissiveIntensity: isGhost ? 2.0 : 3.2,
  });

  const brakeLightMaterial = new THREE.MeshStandardMaterial({
    color: isGhost ? ghostColorVal : 0xdc2626,
    emissive: isGhost ? ghostColorVal : 0xef4444,
    emissiveIntensity: 1.5,
  });

  const addHoloEdges = (mesh: THREE.Mesh, opacity = 0.65) => {
    if (!isGhost) return;
    const edges = new THREE.EdgesGeometry(mesh.geometry, 18);
    const lineMat = new THREE.LineBasicMaterial({
      color: 0x67e8f9,
      transparent: true,
      opacity,
      blending: THREE.AdditiveBlending,
    });
    mesh.add(new THREE.LineSegments(edges, lineMat));
  };

  const meshParams: VehicleMeshParams = {
    rootGroup,
    bodyMat: bodyMaterial,
    darkMat,
    glassMat,
    headLightMat: headLightMaterial,
    brakeLightMat: brakeLightMaterial,
    isGhost,
    ghostColor: ghostColorVal.getHex(),
    addHoloEdges,
  };

  let wheels: VehicleWheels;
  if (vehicleModelId === 'formula_aero') {
    wheels = buildFormulaAeroGeometry(meshParams);
  } else if (vehicleModelId === 'cyber_speedster') {
    wheels = buildCyberSpeedsterGeometry(meshParams);
  } else {
    wheels = buildGTTurboGeometry(meshParams);
  }

  const meta = VEHICLE_MODELS[vehicleModelId] || VEHICLE_MODELS['gt_turbo'];
  const leftHeadPos = new THREE.Vector3(...meta.headlightPos.left);
  const rightHeadPos = new THREE.Vector3(...meta.headlightPos.right);
  const leftTailPos = new THREE.Vector3(...meta.tailLightPos.left);
  const rightTailPos = new THREE.Vector3(...meta.tailLightPos.right);

  const centerHeadY = (leftHeadPos.y + rightHeadPos.y) * 0.5;
  const centerHeadZ = (leftHeadPos.z + rightHeadPos.z) * 0.5;

  const headSpotLight = new THREE.SpotLight(0xfffbeb, headlightsEnabled ? 55.0 : 0, 55, Math.PI / 3.4, 0.75, 1.2);
  headSpotLight.position.set(0, centerHeadY, centerHeadZ);
  const headTarget = new THREE.Object3D();
  headTarget.position.set(0, 0.05, 30.0);
  rootGroup.add(headSpotLight, headTarget);
  headSpotLight.target = headTarget;

  const leftLensGlow = createLensGlowSprite();
  leftLensGlow.position.set(leftHeadPos.x, leftHeadPos.y, leftHeadPos.z + 0.08);
  leftLensGlow.visible = headlightsEnabled;
  rootGroup.add(leftLensGlow);

  const rightLensGlow = createLensGlowSprite();
  rightLensGlow.position.set(rightHeadPos.x, rightHeadPos.y, rightHeadPos.z + 0.08);
  rightLensGlow.visible = headlightsEnabled;
  rootGroup.add(rightLensGlow);

  const groundBeamMesh = createGroundBeamMesh();
  groundBeamMesh.visible = headlightsEnabled;
  rootGroup.add(groundBeamMesh);

  const leftTailPointLight = new THREE.PointLight(0xef4444, 0, 8, 1.6);
  leftTailPointLight.position.copy(leftTailPos);
  rootGroup.add(leftTailPointLight);

  const rightTailPointLight = new THREE.PointLight(0xef4444, 0, 8, 1.6);
  rightTailPointLight.position.copy(rightTailPos);
  rootGroup.add(rightTailPointLight);

  return {
    bodyMaterial,
    headLightMaterial,
    brakeLightMaterial,
    frontLeftWheel: wheels.frontLeftWheel,
    frontRightWheel: wheels.frontRightWheel,
    rearLeftWheel: wheels.rearLeftWheel,
    rearRightWheel: wheels.rearRightWheel,
    headSpotLight,
    headTarget,
    groundBeamMesh,
    leftLensGlow,
    rightLensGlow,
    leftTailPointLight,
    rightTailPointLight,
  };
}
