import * as THREE from 'three';
import { t } from '../i18n/I18nManager.ts';

export interface TrackMetadata {
  id: string;
  title: string;
  badge: string;
  badgeClass: string;
  desc: string;
  len: string;
  corners: string;
  record: string;
  type: string;
  trackWidth: number;
  controlPoints: THREE.Vector3[];
}

/**
 * 3대 글로벌 공식 서킷 제어점 및 메타데이터 정의
 * 1. Circuit de Monaco (테크니컬 스트리트 서킷)
 * 2. Autodromo Nazionale Monza (초고속 스피드의 신전 GP 서킷)
 * 3. Circuit de Spa-Francorchamps (아르덴의 전설적인 롤러코스터 서킷)
 */
export const TRACK_DEFINITIONS: Record<string, TrackMetadata> = {
  circuit_monaco: {
    id: 'circuit_monaco',
    title: 'Circuit de Monaco',
    badge: '★★★★★ HARD',
    badgeClass: 'badge-expert',
    get desc(): string {
      return t('wizard.trackMonacoDesc');
    },
    len: '3.337 km',
    corners: '19 CORNERS',
    record: '01:14.260',
    type: 'TECHNICAL STREET',
    trackWidth: 13.5,
    controlPoints: [
      new THREE.Vector3(0, 0, 0),          // 스타트/피니시 라인 (평지 0m)
      new THREE.Vector3(80, 0, 0),         // 메인 스트레이트
      new THREE.Vector3(140, 2.0, -30),    // Sainte Devote 고속 우코너 오르막 진입 (+2m)
      new THREE.Vector3(170, 8.5, -90),    // Beau Rivage 가파른 언덕 & Massenet (+8.5m)
      new THREE.Vector3(130, 12.0, -140),  // Casino Square 정상 고지대 (+12m)
      new THREE.Vector3(60, 7.5, -120),    // Mirabeau 급경사 내리막 (+7.5m, 섹터 1 부근)
      new THREE.Vector3(10, 3.2, -150),    // Grand Hotel 헤어핀 내리막 (+3.2m)
      new THREE.Vector3(-40, 1.0, -130),   // Portier 해안 진입 코너 (+1m)
      new THREE.Vector3(-80, 0, -170),     // 터널 고속 스트레이트 (0m)
      new THREE.Vector3(-150, 0, -130),    // Nouvelle 시케인 (0m, 섹터 2 부근)
      new THREE.Vector3(-160, 0.6, -60),   // Tabac 고속 좌코너 (+0.6m)
      new THREE.Vector3(-120, 0, -20),     // 수영장 복합 시케인 (Louis Chiron, 0m)
      new THREE.Vector3(-80, 0, 40),       // La Rascasse 헤어핀 (0m)
      new THREE.Vector3(-30, 0, 20),       // Anthony Noghes 마지막 복귀 코너 (0m)
    ],
  },

  circuit_monza: {
    id: 'circuit_monza',
    title: 'Autodromo Nazionale Monza',
    badge: '★★★☆☆ MEDIUM',
    badgeClass: 'badge-medium',
    get desc(): string {
      return t('wizard.trackMonzaDesc');
    },
    len: '5.793 km',
    corners: '11 CORNERS',
    record: '01:21.046',
    type: 'TEMPLE OF SPEED',
    trackWidth: 15.0,
    controlPoints: [
      new THREE.Vector3(40, 0, 90),        // Start / Finish Line (Rettifilo Tribune, 0m)
      new THREE.Vector3(-20, 0, 90),       // Main straight acceleration (0m)
      new THREE.Vector3(-80, 0, 90),       // Approaching Rettifilo (0m)
      new THREE.Vector3(-120, 0, 90),      // Braking zone (0m)
      new THREE.Vector3(-142, 0.5, 88),    // Turn 1 (Variante del Rettifilo right, +0.5m)
      new THREE.Vector3(-152, 1.2, 72),    // Turn 2 (Rettifilo left exit, +1.2m)
      new THREE.Vector3(-165, 2.8, 45),    // Turn 3 (Curva Grande uphill entry, +2.8m)
      new THREE.Vector3(-172, 4.8, 0),     // Curva Grande sweeping apex (+4.8m)
      new THREE.Vector3(-168, 6.2, -45),   // Curva Grande exit (+6.2m)
      new THREE.Vector3(-162, 7.2, -80),   // Turn 4 (Variante della Roggia entry, +7.2m)
      new THREE.Vector3(-155, 7.8, -105),  // Turn 5 (Roggia exit, +7.8m)
      new THREE.Vector3(-148, 8.5, -135),  // Approach to Lesmo 1 (+8.5m)
      new THREE.Vector3(-135, 9.0, -165),  // Turn 6 (Curva di Lesmo 1 summit, +9.0m)
      new THREE.Vector3(-105, 8.2, -172),  // Lesmo 1 exit (+8.2m)
      new THREE.Vector3(-70, 7.0, -162),   // Straight between Lesmos (+7.0m)
      new THREE.Vector3(-35, 5.5, -145),   // Turn 7 (Curva di Lesmo 2 right, +5.5m)
      new THREE.Vector3(0, 2.8, -110),     // Diagonal Straight Serraglio downhill (+2.8m)
      new THREE.Vector3(40, 0.8, -70),     // Serraglio dip (high speed compression, +0.8m)
      new THREE.Vector3(75, 0.5, -35),     // Ascari braking zone (+0.5m)
      new THREE.Vector3(95, 1.2, -22),     // Turn 8 (Variante Ascari left, +1.2m)
      new THREE.Vector3(115, 2.5, -32),    // Turn 9 (Ascari right, +2.5m)
      new THREE.Vector3(135, 4.0, -30),    // Turn 10 (Ascari exit climb, +4.0m)
      new THREE.Vector3(180, 5.2, -30),    // Back straight crest (+5.2m)
      new THREE.Vector3(225, 3.8, -28),    // Back straight high speed descent (+3.8m)
      new THREE.Vector3(255, 1.8, -20),    // Parabolica braking zone (+1.8m)
      new THREE.Vector3(280, 0.8, -2),     // Turn 11 (Curva Parabolica entry, +0.8m)
      new THREE.Vector3(292, 0.3, 32),     // Curva Parabolica apex (+0.3m)
      new THREE.Vector3(278, 0, 68),       // Curva Parabolica late apex (0m)
      new THREE.Vector3(245, 0, 87),       // Parabolica exit (0m)
      new THREE.Vector3(190, 0, 90),       // Accelerating onto main straight (0m)
      new THREE.Vector3(115, 0, 90),       // Full throttle towards start line (0m)
    ],
  },

  circuit_spa: {
    id: 'circuit_spa',
    title: 'Circuit de Spa-Francorchamps',
    badge: '★★★★★ HARD',
    badgeClass: 'badge-expert',
    get desc(): string {
      return t('wizard.trackSpaDesc');
    },
    len: '7.004 km',
    corners: '20 CORNERS',
    record: '01:41.252',
    type: 'ARDENNES ROLLERCOASTER',
    trackWidth: 14.5,
    controlPoints: [
      new THREE.Vector3(-105, 0, 75),      // Start / Finish Line (Pit Straight, 0m)
      new THREE.Vector3(-135, 0, 105),     // Braking for La Source (0m)
      new THREE.Vector3(-165, 1.5, 135),   // Turn 1 (La Source Hairpin entry, +1.5m)
      new THREE.Vector3(-180, 3.0, 155),   // La Source apex (+3.0m)
      new THREE.Vector3(-160, 2.2, 170),   // La Source exit (+2.2m)
      new THREE.Vector3(-125, 0.6, 140),   // Downhill plunge towards Eau Rouge (+0.6m)
      new THREE.Vector3(-90, 0, 95),       // Turn 2 (Eau Rouge bottom dip - heavy compression, 0m)
      new THREE.Vector3(-65, 6.5, 60),     // Turn 3-4 (Raidillon steep uphill wall, +6.5m)
      new THREE.Vector3(-35, 12.5, 20),    // Kemmel Straight crest entry (+12.5m)
      new THREE.Vector3(15, 14.5, -45),    // Kemmel Straight mid summit (+14.5m)
      new THREE.Vector3(65, 15.0, -115),   // Kemmel Straight peak braking zone (+15.0m)
      new THREE.Vector3(95, 13.8, -145),   // Turn 5 (Les Combes right, +13.8m)
      new THREE.Vector3(120, 12.2, -140),  // Turn 6 (Les Combes left, +12.2m)
      new THREE.Vector3(145, 10.5, -115),  // Turn 7 (Malmedy right, +10.5m)
      new THREE.Vector3(135, 8.8, -75),    // Approach to Bruxelles downhill (+8.8m)
      new THREE.Vector3(150, 6.8, -45),    // Turn 8 (Bruxelles / Rivage 180 deg hairpin, +6.8m)
      new THREE.Vector3(135, 5.2, -20),    // Bruxelles exit (+5.2m)
      new THREE.Vector3(110, 4.0, -5),     // Turn 9 (Speaker's Corner left, +4.0m)
      new THREE.Vector3(85, 2.8, 25),      // Turn 10 (Pouhon fast downhill entry, +2.8m)
      new THREE.Vector3(95, 1.8, 65),      // Turn 11 (Pouhon double-left apex, +1.8m)
      new THREE.Vector3(80, 2.5, 100),     // Pouhon exit (+2.5m)
      new THREE.Vector3(65, 3.8, 130),     // Turn 12-13 (Fagnes / Pif-Paf chicane climb, +3.8m)
      new THREE.Vector3(55, 4.5, 160),     // Turn 14 (Campus right crest, +4.5m)
      new THREE.Vector3(40, 3.2, 185),     // Turn 15 (Stavelot apex, +3.2m)
      new THREE.Vector3(0, 2.2, 180),      // Turn 16 (Courbe Paul Frère, +2.2m)
      new THREE.Vector3(-40, 1.2, 140),    // Turn 17 (Blanchimont 1 flat-out left descent, +1.2m)
      new THREE.Vector3(-65, 0.4, 115),    // Turn 18 (Blanchimont 2, +0.4m)
      new THREE.Vector3(-80, 0, 95),       // Turn 19 (Bus Stop entry, 0m)
      new THREE.Vector3(-90, 0, 85),       // Turn 20 (Bus Stop exit onto pit straight, 0m)
    ],
  },
};

export interface CircuitSvgData {
  pathD: string;
  startX: number;
  startY: number;
  textX: number;
  textY: number;
}

/**
 * CatmullRom 3D 제어점 스플라인 곡선으로부터 위저드 쇼케이스용 2D SVG 패스 및 스타트 핀 좌표를 정밀 산출
 */
export function getCircuitSvgData(trackId: string, width = 400, height = 240, padding = 34): CircuitSvgData {
  const def = TRACK_DEFINITIONS[trackId] || TRACK_DEFINITIONS.circuit_monaco;
  const curve = new THREE.CatmullRomCurve3(def.controlPoints, true, 'centripetal');
  const points = curve.getPoints(140);

  let minX = Infinity, maxX = -Infinity;
  let minZ = Infinity, maxZ = -Infinity;
  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.z < minZ) minZ = p.z;
    if (p.z > maxZ) maxZ = p.z;
  }

  const rangeX = maxX - minX || 1;
  const rangeZ = maxZ - minZ || 1;
  const availW = width - padding * 2;
  const availH = height - padding * 2;
  const scale = Math.min(availW / rangeX, availH / rangeZ);

  const midX = (minX + maxX) / 2;
  const midZ = (minZ + maxZ) / 2;
  const cx = width / 2;
  const cy = height / 2;

  const toSvgX = (x: number) => (x - midX) * scale + cx;
  const toSvgY = (z: number) => (z - midZ) * scale + cy;

  const dParts: string[] = [];
  points.forEach((p, idx) => {
    const sx = toSvgX(p.x).toFixed(1);
    const sy = toSvgY(p.z).toFixed(1);
    if (idx === 0) {
      dParts.push(`M ${sx},${sy}`);
    } else {
      dParts.push(`L ${sx},${sy}`);
    }
  });
  dParts.push('Z');

  const startPt = points[0];
  const startX = Number(toSvgX(startPt.x).toFixed(1));
  const startY = Number(toSvgY(startPt.z).toFixed(1));

  let textX = startX + 12;
  let textY = startY + 4;
  if (textX + 75 > width - 10) {
    textX = startX - 85;
  }
  if (textY < 22) {
    textY = startY + 16;
  }
  if (textY > height - 16) {
    textY = startY - 10;
  }

  return {
    pathD: dParts.join(' '),
    startX,
    startY,
    textX,
    textY,
  };
}
