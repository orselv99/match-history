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
      new THREE.Vector3(0, 0, 0),         // 스타트/피니시 라인
      new THREE.Vector3(80, 0, 0),        // 메인 스트레이트
      new THREE.Vector3(140, 0, -30),     // Sainte Devote 고속 우코너 진입
      new THREE.Vector3(170, 0, -90),     // Beau Rivage 언덕 & Massenet
      new THREE.Vector3(130, 0, -140),    // Casino Square
      new THREE.Vector3(60, 0, -120),     // Mirabeau (섹터 1 체크포인트 부근)
      new THREE.Vector3(10, 0, -150),     // Grand Hotel 헤어핀
      new THREE.Vector3(-40, 0, -130),    // Portier 코너
      new THREE.Vector3(-80, 0, -170),    // 터널 고속 스트레이트
      new THREE.Vector3(-150, 0, -130),   // Nouvelle 시케인 (섹터 2 체크포인트 부근)
      new THREE.Vector3(-160, 0, -60),    // Tabac 고속 좌코너
      new THREE.Vector3(-120, 0, -20),    // 수영장 복합 시케인 (Louis Chiron)
      new THREE.Vector3(-80, 0, 40),      // La Rascasse 헤어핀
      new THREE.Vector3(-30, 0, 20),      // Anthony Noghes 마지막 복귀 코너
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
      new THREE.Vector3(40, 0, 90),       // Start / Finish Line (Rettifilo Tribune)
      new THREE.Vector3(-20, 0, 90),      // Main straight acceleration
      new THREE.Vector3(-80, 0, 90),      // Approaching Rettifilo
      new THREE.Vector3(-120, 0, 90),     // Braking zone
      new THREE.Vector3(-142, 0, 88),     // Turn 1 (Variante del Rettifilo right)
      new THREE.Vector3(-152, 0, 72),     // Turn 2 (Rettifilo left exit)
      new THREE.Vector3(-165, 0, 45),     // Turn 3 (Curva Grande entry)
      new THREE.Vector3(-172, 0, 0),      // Curva Grande sweeping apex
      new THREE.Vector3(-168, 0, -45),    // Curva Grande exit
      new THREE.Vector3(-162, 0, -80),    // Turn 4 (Variante della Roggia entry)
      new THREE.Vector3(-155, 0, -105),   // Turn 5 (Roggia exit)
      new THREE.Vector3(-148, 0, -135),   // Approach to Lesmo 1
      new THREE.Vector3(-135, 0, -165),   // Turn 6 (Curva di Lesmo 1 right)
      new THREE.Vector3(-105, 0, -172),   // Lesmo 1 exit
      new THREE.Vector3(-70, 0, -162),    // Straight between Lesmos
      new THREE.Vector3(-35, 0, -145),    // Turn 7 (Curva di Lesmo 2 right)
      new THREE.Vector3(0, 0, -110),      // Diagonal Straight (Serraglio)
      new THREE.Vector3(40, 0, -70),      // Serraglio mid (high speed)
      new THREE.Vector3(75, 0, -35),      // Ascari braking zone
      new THREE.Vector3(95, 0, -22),      // Turn 8 (Variante Ascari left)
      new THREE.Vector3(115, 0, -32),     // Turn 9 (Ascari right)
      new THREE.Vector3(135, 0, -30),     // Turn 10 (Ascari exit onto back straight)
      new THREE.Vector3(180, 0, -30),     // Back straight acceleration
      new THREE.Vector3(225, 0, -28),     // Back straight high speed
      new THREE.Vector3(255, 0, -20),     // Parabolica braking zone
      new THREE.Vector3(280, 0, -2),      // Turn 11 (Curva Parabolica entry)
      new THREE.Vector3(292, 0, 32),      // Curva Parabolica apex
      new THREE.Vector3(278, 0, 68),      // Curva Parabolica late apex
      new THREE.Vector3(245, 0, 87),      // Parabolica exit
      new THREE.Vector3(190, 0, 90),      // Accelerating onto main straight
      new THREE.Vector3(115, 0, 90),      // Full throttle towards start line
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
      new THREE.Vector3(-105, 0, 75),     // Start / Finish Line (Pit Straight)
      new THREE.Vector3(-135, 0, 105),    // Braking for La Source
      new THREE.Vector3(-165, 0, 135),    // Turn 1 (La Source Hairpin entry)
      new THREE.Vector3(-180, 0, 155),    // La Source apex (tight right hairpin)
      new THREE.Vector3(-160, 0, 170),    // La Source exit
      new THREE.Vector3(-125, 0, 140),    // Downhill run towards Eau Rouge
      new THREE.Vector3(-90, 0, 95),      // Turn 2 (Eau Rouge left dip)
      new THREE.Vector3(-65, 0, 60),      // Turn 3-4 (Raidillon uphill right-left)
      new THREE.Vector3(-35, 0, 20),      // Kemmel Straight entry
      new THREE.Vector3(15, 0, -45),      // Kemmel Straight mid (ultra high speed)
      new THREE.Vector3(65, 0, -115),     // Kemmel Straight end / braking zone
      new THREE.Vector3(95, 0, -145),     // Turn 5 (Les Combes right)
      new THREE.Vector3(120, 0, -140),    // Turn 6 (Les Combes left)
      new THREE.Vector3(145, 0, -115),    // Turn 7 (Malmedy right)
      new THREE.Vector3(135, 0, -75),     // Approach to Bruxelles
      new THREE.Vector3(150, 0, -45),     // Turn 8 (Bruxelles / Rivage 180 deg hairpin apex)
      new THREE.Vector3(135, 0, -20),     // Bruxelles exit
      new THREE.Vector3(110, 0, -5),      // Turn 9 (Speaker's Corner left)
      new THREE.Vector3(85, 0, 25),       // Turn 10 (Pouhon entry)
      new THREE.Vector3(95, 0, 65),       // Turn 11 (Pouhon double-left apex)
      new THREE.Vector3(80, 0, 100),      // Pouhon exit
      new THREE.Vector3(65, 0, 130),      // Turn 12-13 (Fagnes / Pif-Paf chicane)
      new THREE.Vector3(55, 0, 160),      // Turn 14 (Campus right)
      new THREE.Vector3(40, 0, 185),      // Turn 15 (Stavelot apex - bottom-right)
      new THREE.Vector3(0, 0, 180),       // Turn 16 (Courbe Paul Frère)
      new THREE.Vector3(-40, 0, 140),     // Turn 17 (Blanchimont 1 flat-out left)
      new THREE.Vector3(-65, 0, 115),     // Turn 18 (Blanchimont 2)
      new THREE.Vector3(-80, 0, 95),      // Turn 19 (Bus Stop entry)
      new THREE.Vector3(-90, 0, 85),      // Turn 20 (Bus Stop exit onto pit straight)
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
