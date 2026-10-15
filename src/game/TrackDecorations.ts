import * as THREE from 'three';

/**
 * 3D 서킷 환경 조형물 및 노면 마킹 생성 전담 빌더
 * - 적백 연석(Curbs) 절차적 메시
 * - 결승선 체커보드 스트립 & 4개 스타팅 그리드 코너 브래킷 「 」 마킹
 * - 네온 듀얼빔 체크포인트 아치 게이트(ArchGate)
 * - 600m x 600m 다크 매트 그라운드 플레인 & 테크니컬 그리드 라인
 */
export class TrackDecorations {
  /**
   * 스타팅 그리드 체커보드 라인 및 4대 머신 주차 그리드 슬롯 마킹 생성
   */
  public static buildStartingGrids(trackCurve: THREE.CatmullRomCurve3, trackWidth: number): THREE.Group {
    const group = new THREE.Group();
    const trackLength = trackCurve.getLength();
    const whiteMat = new THREE.MeshBasicMaterial({ color: 0xf8fafc, side: THREE.DoubleSide, depthWrite: true });
    const blackMat = new THREE.MeshBasicMaterial({ color: 0x121316, side: THREE.DoubleSide, depthWrite: true });

    // 1) 결승선 체커 라인 (가로로 반듯하게 정렬된 2행 체커보드 스트립)
    const startPt = trackCurve.getPointAt(0);
    const startTangent = trackCurve.getTangentAt(0).normalize();
    const startRight = new THREE.Vector3(-startTangent.z, 0, startTangent.x).normalize();

    const checkerTotalW = trackWidth - 2 * (0.15 + 0.35 + 0.05);
    const cols = 18;
    const rows = 2;
    const blockW = checkerTotalW / cols;
    const blockL = 0.55;

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const isWhite = (r + c) % 2 === 0;
        const mat = isWhite ? whiteMat : blackMat;

        const leftDist = -checkerTotalW / 2 + c * blockW;
        const rightDist = leftDist + blockW;
        const backDist = (r - rows / 2) * blockL;
        const frontDist = backDist + blockL;

        const p1 = new THREE.Vector3().copy(startPt).addScaledVector(startRight, leftDist).addScaledVector(startTangent, backDist);
        const p2 = new THREE.Vector3().copy(startPt).addScaledVector(startRight, rightDist).addScaledVector(startTangent, backDist);
        const p3 = new THREE.Vector3().copy(startPt).addScaledVector(startRight, leftDist).addScaledVector(startTangent, frontDist);
        const p4 = new THREE.Vector3().copy(startPt).addScaledVector(startRight, rightDist).addScaledVector(startTangent, frontDist);

        const quadGeom = new THREE.BufferGeometry();
        quadGeom.setAttribute('position', new THREE.Float32BufferAttribute([
          p1.x, 0.08, p1.z,
          p2.x, 0.08, p2.z,
          p3.x, 0.08, p3.z,
          p4.x, 0.08, p4.z
        ], 3));
        quadGeom.setIndex([0, 1, 2, 1, 3, 2]);
        quadGeom.computeVertexNormals();
        const blockMesh = new THREE.Mesh(quadGeom, mat);
        group.add(blockMesh);
      }
    }

    // 2) 4개 슬롯 코너 브래킷 「 」 마킹
    const slotConfigs = [
      { distBehind: 5.0, lane: -2.2 },
      { distBehind: 12.0, lane: 2.2 },
      { distBehind: 19.0, lane: -2.2 },
      { distBehind: 26.0, lane: 2.2 },
    ];

    slotConfigs.forEach((slot) => {
      const t = (1.0 - (slot.distBehind / trackLength)) % 1.0;
      const pt = trackCurve.getPointAt(t);
      const tangent = trackCurve.getTangentAt(t).normalize();
      const right = new THREE.Vector3(-tangent.z, 0, tangent.x).normalize();

      const center = new THREE.Vector3().copy(pt).addScaledVector(right, slot.lane);
      const halfW = 1.35;
      const halfL = 2.4;
      const bracketArm = 0.7;
      const bThick = 0.12;

      const corners = [
        { sideX: -1, sideZ: 1 },  // 전방 좌측 「
        { sideX: 1, sideZ: 1 },   // 전방 우측 」
        { sideX: -1, sideZ: -1 }, // 후방 좌측 ㄴ
        { sideX: 1, sideZ: -1 },  // 후방 우측 ┙
      ];

      corners.forEach(c => {
        const cornerOrigin = new THREE.Vector3()
          .copy(center)
          .addScaledVector(right, c.sideX * halfW)
          .addScaledVector(tangent, c.sideZ * halfL);

        // 가로 바
        const hStart = new THREE.Vector3().copy(cornerOrigin);
        const hEnd = new THREE.Vector3().copy(cornerOrigin).addScaledVector(right, -c.sideX * bracketArm);
        group.add(this.createMarkingStrip(hStart, hEnd, tangent, bThick, whiteMat));

        // 세로 바
        const vStart = new THREE.Vector3().copy(cornerOrigin);
        const vEnd = new THREE.Vector3().copy(cornerOrigin).addScaledVector(tangent, -c.sideZ * bracketArm);
        group.add(this.createMarkingStrip(vStart, vEnd, right, bThick, whiteMat));
      });
    });

    return group;
  }

  private static createMarkingStrip(start: THREE.Vector3, end: THREE.Vector3, normalVec: THREE.Vector3, thick: number, mat: THREE.Material): THREE.Mesh {
    const halfT = thick / 2;
    const p1 = new THREE.Vector3().copy(start).addScaledVector(normalVec, -halfT);
    const p2 = new THREE.Vector3().copy(start).addScaledVector(normalVec, halfT);
    const p3 = new THREE.Vector3().copy(end).addScaledVector(normalVec, -halfT);
    const p4 = new THREE.Vector3().copy(end).addScaledVector(normalVec, halfT);

    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.Float32BufferAttribute([
      p1.x, 0.08, p1.z,
      p2.x, 0.08, p2.z,
      p3.x, 0.08, p3.z,
      p4.x, 0.08, p4.z
    ], 3));
    geom.setIndex([0, 1, 2, 1, 3, 2]);
    geom.computeVertexNormals();

    return new THREE.Mesh(geom, mat);
  }

  /**
   * 도로 양쪽 적백 연석(Curbs) 메시 빌드
   */
  public static buildCurbs(points: THREE.Vector3[], halfWidth: number): THREE.Mesh {
    const curbWidth = 1.3;
    const curbHeight = 0.16;
    const segments = points.length;

    const curbGeom = new THREE.BufferGeometry();
    const positions: number[] = [];
    const colors: number[] = [];
    const indices: number[] = [];

    for (let i = 0; i < segments; i++) {
      const prevI = (i - 1 + segments) % segments;
      const nextI = (i + 1) % segments;
      const pt = points[i];
      const prevPt = points[prevI];
      const nextPt = points[nextI];

      const forward = new THREE.Vector3().subVectors(nextPt, prevPt).normalize();
      const right = new THREE.Vector3(-forward.z, 0, forward.x).normalize();

      const isSpecAccent = Math.floor(i / 3) % 2 === 0;
      const r = isSpecAccent ? 0.77 : 0.93;
      const g = isSpecAccent ? 0.35 : 0.93;
      const b = isSpecAccent ? 0.45 : 0.93;

      const leftInner = new THREE.Vector3().copy(pt).addScaledVector(right, -halfWidth);
      const leftOuter = new THREE.Vector3().copy(pt).addScaledVector(right, -halfWidth - curbWidth);

      positions.push(leftInner.x, curbHeight, leftInner.z);
      positions.push(leftOuter.x, 0.06, leftOuter.z);
      colors.push(r, g, b, r, g, b);

      const v0 = i * 2;
      const v1 = i * 2 + 1;
      const v2 = nextI * 2;
      const v3 = nextI * 2 + 1;
      indices.push(v0, v1, v2, v1, v3, v2);
    }

    curbGeom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    curbGeom.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    curbGeom.setIndex(indices);
    curbGeom.computeVertexNormals();

    const curbMat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.5,
    });
    return new THREE.Mesh(curbGeom, curbMat);
  }

  /**
   * 600m x 600m 다크 매트 그라운드 플레인 & 테크니컬 그리드 헬퍼 생성
   */
  public static buildGround(): THREE.Group {
    const group = new THREE.Group();

    const groundGeom = new THREE.PlaneGeometry(600, 600);
    const groundMat = new THREE.MeshStandardMaterial({
      color: 0x121316,
      roughness: 0.95,
      metalness: 0.05,
    });
    const ground = new THREE.Mesh(groundGeom, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    group.add(ground);

    const grid = new THREE.GridHelper(600, 60, 0x3a3d47, 0x1a1b20);
    grid.position.y = 0.01;
    group.add(grid);

    return group;
  }

  /**
   * 스타트/피니시 및 섹터 체크포인트 네온 듀얼빔 아치 게이트 생성
   */
  public static buildArchGate(pos: THREE.Vector3, tangent: THREE.Vector3, isFinish: boolean, trackWidth: number): THREE.Group {
    const archGroup = new THREE.Group();
    archGroup.position.copy(pos);

    const right = new THREE.Vector3(-tangent.z, 0, tangent.x).normalize();
    const halfW = trackWidth / 2 + 1.5;

    // 기둥 2개
    const pillarGeom = new THREE.BoxGeometry(0.6, 6, 0.6);
    const pillarMat = new THREE.MeshStandardMaterial({ color: 0x26282f, roughness: 0.6, metalness: 0.4 });

    const leftPillar = new THREE.Mesh(pillarGeom, pillarMat);
    leftPillar.position.copy(new THREE.Vector3().addScaledVector(right, -halfW));
    leftPillar.position.y = 3;

    const rightPillar = new THREE.Mesh(pillarGeom, pillarMat);
    rightPillar.position.copy(new THREE.Vector3().addScaledVector(right, halfW));
    rightPillar.position.y = 3;

    // 상단 듀얼 빔 (y=4.9, y=5.8): 피니시는 로즈(0xc45a72), 일반 섹터는 스카이블루(0x7dd3fc)
    const beamGeom = new THREE.BoxGeometry(trackWidth + 4, 0.35, 0.75);
    const beamColor = isFinish ? 0xc45a72 : 0x7dd3fc;
    const beamEmissive = isFinish ? 0xc45a72 : 0x38bdf8;

    const beamMat = new THREE.MeshStandardMaterial({
      color: beamColor,
      emissive: beamEmissive,
      emissiveIntensity: 1.4,
      roughness: 0.3,
    });

    const beam1 = new THREE.Mesh(beamGeom, beamMat);
    beam1.position.y = 4.9;
    beam1.quaternion.setFromUnitVectors(new THREE.Vector3(1, 0, 0), right);

    const beam2 = new THREE.Mesh(beamGeom, beamMat);
    beam2.position.y = 5.8;
    beam2.quaternion.setFromUnitVectors(new THREE.Vector3(1, 0, 0), right);

    archGroup.add(leftPillar, rightPillar, beam1, beam2);
    return archGroup;
  }

  /**
   * 국제 공인 서킷 규격 3D 랜드마크 오브젝트 배치
   * - 출발선 F1 5구 스타팅 라이트 갠트리 (Start / Finish Gantry)
   * - 65m 대형 관중석 그랜드스탠드 (Grandstand with Cantilever Roof)
   * - 2층 피트 빌딩 & 피트 월 & 피트 레인 (Pit Complex & Pit Wall)
   * - 4층 레이스 컨트롤 타워 & 대형 전광판 (Race Control Tower & Live Timing Board)
   */
  public static buildCircuitStructures(trackCurve: THREE.CatmullRomCurve3, trackWidth: number): THREE.Group {
    const group = new THREE.Group();

    const startPt = trackCurve.getPointAt(0);
    const startTangent = trackCurve.getTangentAt(0).normalize();
    const heading = Math.atan2(startTangent.x, startTangent.z);

    group.position.copy(startPt);
    group.rotation.y = heading;

    const halfW = trackWidth / 2;

    // 공통 머티리얼 정의
    const concreteMat = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.85, metalness: 0.15 });
    const steelMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.5, metalness: 0.6 });
    const roofMat = new THREE.MeshStandardMaterial({ color: 0xf1f5f9, roughness: 0.4, metalness: 0.3 });
    const seatRedMat = new THREE.MeshStandardMaterial({ color: 0xdc2626, roughness: 0.6 });
    const seatBlueMat = new THREE.MeshStandardMaterial({ color: 0x2563eb, roughness: 0.6 });
    const glassMat = new THREE.MeshStandardMaterial({
      color: 0x38bdf8,
      roughness: 0.1,
      metalness: 0.85,
      transparent: true,
      opacity: 0.75,
    });
    const emissiveRedMat = new THREE.MeshStandardMaterial({
      color: 0xef4444,
      emissive: 0xef4444,
      emissiveIntensity: 2.8,
      roughness: 0.2,
    });
    const emissiveCyanMat = new THREE.MeshStandardMaterial({
      color: 0x38bdf8,
      emissive: 0x0284c7,
      emissiveIntensity: 1.8,
      roughness: 0.2,
    });

    // 1. 출발선 갠트리 (F1 Start Lights & Race Gantry)
    const gantry = new THREE.Group();
    const postX = halfW + 1.4;
    const postGeom = new THREE.BoxGeometry(0.7, 7.5, 0.7);
    const leftPost = new THREE.Mesh(postGeom, steelMat);
    leftPost.position.set(-postX, 3.75, 0);
    const rightPost = new THREE.Mesh(postGeom, steelMat);
    rightPost.position.set(postX, 3.75, 0);

    const bridgeW = postX * 2 + 1.4;
    const bridgeGeom = new THREE.BoxGeometry(bridgeW, 0.8, 1.2);
    const bridge = new THREE.Mesh(bridgeGeom, steelMat);
    bridge.position.set(0, 7.1, 0);

    // 5구 스타팅 라이트 박스
    const lightBoxGeom = new THREE.BoxGeometry(4.4, 0.9, 0.3);
    const lightBox = new THREE.Mesh(lightBoxGeom, steelMat);
    lightBox.position.set(0, 6.2, -0.65);

    const lightGeom = new THREE.CylinderGeometry(0.24, 0.24, 0.12, 12);
    lightGeom.rotateX(Math.PI / 2);
    for (let i = 0; i < 5; i++) {
      const redLight = new THREE.Mesh(lightGeom, emissiveRedMat);
      redLight.position.set(-1.6 + i * 0.8, 6.2, -0.82);
      gantry.add(redLight);
    }

    // 상단 "START / FINISH" 전광판
    const signGeom = new THREE.BoxGeometry(Math.min(12.0, trackWidth), 0.75, 0.2);
    const sign = new THREE.Mesh(signGeom, emissiveCyanMat);
    sign.position.set(0, 7.8, -0.65);

    gantry.add(leftPost, rightPost, bridge, lightBox, sign);
    group.add(gantry);

    // 2. 그랜드스탠드 (Grandstand - 대형 관중석 & 캔틸레버 차양 지붕)
    const grandstand = new THREE.Group();
    const gsBaseX = halfW + 4.5;
    const gsLength = 65.0;
    const gsZ = -6.0;

    // 5단 계단식 스탠드
    for (let tier = 0; tier < 5; tier++) {
      const tierW = 1.6;
      const tierH = 0.55 * (tier + 1);
      const tierGeom = new THREE.BoxGeometry(tierW, tierH, gsLength);
      const tierMesh = new THREE.Mesh(tierGeom, concreteMat);
      tierMesh.position.set(gsBaseX + tier * tierW + tierW / 2, tierH / 2, gsZ);
      grandstand.add(tierMesh);

      // 관중석 시트 (레드 & 블루 교차 배치)
      const seatMat = tier % 2 === 0 ? seatRedMat : seatBlueMat;
      const seatGeom = new THREE.BoxGeometry(tierW * 0.75, 0.2, gsLength - 2.0);
      const seatMesh = new THREE.Mesh(seatGeom, seatMat);
      seatMesh.position.set(gsBaseX + tier * tierW + tierW / 2, tierH + 0.1, gsZ);
      grandstand.add(seatMesh);
    }

    // 캔틸레버 루프 차양막
    const canopyGeom = new THREE.BoxGeometry(11.0, 0.3, gsLength + 2.0);
    const canopy = new THREE.Mesh(canopyGeom, roofMat);
    canopy.position.set(gsBaseX + 4.5, 7.2, gsZ);
    canopy.rotation.z = -0.16; // 트랙 방향으로 살짝 기울어진 에어로 루프
    grandstand.add(canopy);

    // 후방 지지 강철 기둥 5개
    const colGeom = new THREE.BoxGeometry(0.6, 7.5, 0.6);
    for (let c = 0; c < 5; c++) {
      const col = new THREE.Mesh(colGeom, steelMat);
      col.position.set(gsBaseX + 8.5, 3.75, gsZ - 26.0 + c * 13.0);
      grandstand.add(col);
    }
    group.add(grandstand);

    // 3. 피트 콤플렉스 (Pit Building & Pit Wall & Pit Lane)
    const pitGroup = new THREE.Group();
    const pitBaseX = -(halfW + 3.0);
    const pitLength = 65.0;
    const pitZ = -6.0;

    // A. 피트 월 (트랙과 피트 레인 분리 방호벽)
    const pitWallGeom = new THREE.BoxGeometry(0.7, 1.15, pitLength);
    const pitWall = new THREE.Mesh(pitWallGeom, concreteMat);
    pitWall.position.set(pitBaseX + 1.2, 0.575, pitZ);
    pitGroup.add(pitWall);

    // 피트 스탠드 / 텔레메트리 모니터 퍼치 (팀 피트 부스 4동)
    const perchGeom = new THREE.BoxGeometry(1.6, 1.8, 3.0);
    for (let p = 0; p < 4; p++) {
      const perch = new THREE.Mesh(perchGeom, steelMat);
      perch.position.set(pitBaseX + 1.2, 1.3, pitZ - 20.0 + p * 13.0);
      const screenGeom = new THREE.BoxGeometry(0.15, 0.6, 1.4);
      const screen = new THREE.Mesh(screenGeom, emissiveCyanMat);
      screen.position.set(pitBaseX + 1.2 - 0.75, 1.6, pitZ - 20.0 + p * 13.0);
      pitGroup.add(perch, screen);
    }

    // B. 피트 레인 아스팔트 바닥 및 옐로우 라인
    const pitRoadGeom = new THREE.PlaneGeometry(6.4, pitLength);
    const pitRoadMat = new THREE.MeshStandardMaterial({ color: 0x22262e, roughness: 0.8, metalness: 0.1 });
    const pitRoad = new THREE.Mesh(pitRoadGeom, pitRoadMat);
    pitRoad.rotation.x = -Math.PI / 2;
    pitRoad.position.set(pitBaseX - 2.5, 0.052, pitZ);
    pitGroup.add(pitRoad);

    // C. 2층 피트 가레지 빌딩
    const bldgW = 10.5;
    const bldgH = 7.0;
    const bldgGeom = new THREE.BoxGeometry(bldgW, bldgH, pitLength);
    const pitBldg = new THREE.Mesh(bldgGeom, concreteMat);
    pitBldg.position.set(pitBaseX - 2.5 - 3.2 - bldgW / 2, bldgH / 2, pitZ);
    pitGroup.add(pitBldg);

    // 1층 피트 가레지 셔터 도어 6칸 (금속 롤업 도어 & 팀 컬러 포인트)
    const doorGeom = new THREE.BoxGeometry(0.2, 2.8, 7.5);
    const doorMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.4, metalness: 0.6 });
    for (let d = 0; d < 6; d++) {
      const door = new THREE.Mesh(doorGeom, doorMat);
      door.position.set(pitBaseX - 2.5 - 3.2 + 0.1, 1.4, pitZ - 24.0 + d * 9.6);
      pitGroup.add(door);
    }

    // 2층 VIP 패독 라운지 파노라마 틴티드 글래스 창문
    const vipGlassGeom = new THREE.BoxGeometry(0.2, 2.2, pitLength - 4.0);
    const vipGlass = new THREE.Mesh(vipGlassGeom, glassMat);
    vipGlass.position.set(pitBaseX - 2.5 - 3.2 + 0.1, 5.2, pitZ);
    pitGroup.add(vipGlass);

    group.add(pitGroup);

    // 4. 레이스 컨트롤 타워 (Race Control Tower & Live Timing Board)
    const towerGroup = new THREE.Group();
    const towerX = -(halfW + 9.5);
    const towerZ = 16.0;

    // 타워 1~3층 메인 본체
    const towerBodyGeom = new THREE.BoxGeometry(6.8, 11.0, 6.8);
    const towerBody = new THREE.Mesh(towerBodyGeom, concreteMat);
    towerBody.position.set(towerX, 5.5, towerZ);

    // 4층 최상단 360도 파노라마 경기 관제실
    const obsDeckGeom = new THREE.BoxGeometry(8.6, 3.6, 8.6);
    const obsDeck = new THREE.Mesh(obsDeckGeom, glassMat);
    obsDeck.position.set(towerX, 12.5, towerZ);

    // 타워 지붕 통신 안테나 스파이어
    const spireGeom = new THREE.CylinderGeometry(0.12, 0.16, 6.5, 8);
    const spire = new THREE.Mesh(spireGeom, steelMat);
    spire.position.set(towerX, 17.5, towerZ);

    // 트랙 방향 실시간 레이스 타이밍 전광판 (Live Timing LED Board)
    const boardGeom = new THREE.BoxGeometry(0.2, 7.0, 4.2);
    const board = new THREE.Mesh(boardGeom, steelMat);
    board.position.set(towerX + 3.5, 6.5, towerZ);

    const timingLedGeom = new THREE.BoxGeometry(0.22, 0.5, 3.6);
    for (let l = 0; l < 4; l++) {
      const ledMat = l === 0 ? emissiveCyanMat : emissiveRedMat;
      const ledLine = new THREE.Mesh(timingLedGeom, ledMat);
      ledLine.position.set(towerX + 3.51, 8.5 - l * 1.3, towerZ);
      towerGroup.add(ledLine);
    }

    towerGroup.add(towerBody, obsDeck, spire, board);
    group.add(towerGroup);

    return group;
  }
}
