import * as THREE from 'three';
import { t } from '../i18n/I18nManager.ts';

export type CircuitId = 'circuit_monaco' | 'circuit_monza' | 'circuit_spa' | 'circuit_silverstone';

export interface CircuitMetadata {
  id: CircuitId;
  title: string;
  badge: string;
  badgeClass: string;
  desc: string;
  len: string;
  corners: string;
  record: string;
  type: string;
  circuitWidth: number;
  bridgeSpan?: [number, number];
  controlPoints: THREE.Vector3[];
}

/**
 * 3대 글로벌 공식 서킷 제어점 및 메타데이터 정의
 * 1. Circuit de Monaco (테크니컬 스트리트 서킷)
 * 2. Autodromo Nazionale Monza (초고속 스피드의 신전 GP 서킷)
 * 3. Circuit de Spa-Francorchamps (아르덴의 전설적인 롤러코스터 서킷)
 */
export const CIRCUIT_DEFINITIONS: Record<string, CircuitMetadata> = {
  circuit_monaco: {
    id: 'circuit_monaco',
    title: 'Circuit de Monaco',
    badge: '★★★★★ HARD',
    badgeClass: 'badge-expert',
    get desc(): string {
      return t('wizard.circuitMonacoDesc');
    },
    len: '3.337 km',
    corners: '19 CORNERS',
    record: '01:14.260',
    type: 'TECHNICAL STREET',
    circuitWidth: 13.5,
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
      return t('wizard.circuitMonzaDesc');
    },
    len: '5.793 km',
    corners: '11 CORNERS',
    record: '01:21.046',
    type: 'TEMPLE OF SPEED',
    circuitWidth: 15.0,
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
      return t('wizard.circuitSpaDesc');
    },
    len: '7.004 km',
    corners: '20 CORNERS',
    record: '01:41.252',
    type: 'ARDENNES ROLLERCOASTER',
    circuitWidth: 14.5,
    bridgeSpan: [0.135, 0.275],            // 하부 도로(t≈0.98) 위를 가로지르는 상부 고가 대교(Overpass Viaduct) 구간
    controlPoints: [
      new THREE.Vector3(-105, 0, 75),      // Start / Finish Line (Pit Straight, 0m)
      new THREE.Vector3(-135, 0, 105),     // Braking for La Source (0m)
      new THREE.Vector3(-165, 3.8, 135),   // Turn 1 (La Source Hairpin entry climb, +3.8m)
      new THREE.Vector3(-180, 7.8, 155),   // La Source elevated apex (+7.8m)
      new THREE.Vector3(-160, 11.5, 170),  // La Source exit onto Viaduct Bridge ramp (+11.5m)
      new THREE.Vector3(-125, 13.8, 140),  // Entering Spa Overpass Bridge (+13.8m)
      new THREE.Vector3(-90, 14.8, 95),    // Turn 2 (Spa Overpass Bridge Center Span - 하부 도로 위 14.8m 통과!)
      new THREE.Vector3(-65, 15.2, 60),    // Turn 3-4 (Bridge exit onto Raidillon high plateau, +15.2m)
      new THREE.Vector3(-35, 15.6, 20),    // Kemmel Straight crest (+15.6m)
      new THREE.Vector3(15, 16.0, -45),    // Kemmel Straight mid summit (+16.0m)
      new THREE.Vector3(65, 15.0, -115),   // Kemmel Straight peak braking zone (+15.0m)
      new THREE.Vector3(95, 13.5, -145),   // Turn 5 (Les Combes right, +13.5m)
      new THREE.Vector3(120, 11.8, -140),  // Turn 6 (Les Combes left, +11.8m)
      new THREE.Vector3(145, 10.0, -115),  // Turn 7 (Malmedy right, +10.0m)
      new THREE.Vector3(135, 8.2, -75),    // Approach to Bruxelles downhill (+8.2m)
      new THREE.Vector3(150, 6.2, -45),    // Turn 8 (Bruxelles / Rivage 180 deg hairpin, +6.2m)
      new THREE.Vector3(135, 4.8, -20),    // Bruxelles exit (+4.8m)
      new THREE.Vector3(110, 3.5, -5),     // Turn 9 (Speaker's Corner left, +3.5m)
      new THREE.Vector3(85, 2.2, 25),      // Turn 10 (Pouhon fast downhill entry, +2.2m)
      new THREE.Vector3(95, 1.5, 65),      // Turn 11 (Pouhon double-left dip compression, +1.5m)
      new THREE.Vector3(80, 2.5, 100),     // Pouhon exit (+2.5m)
      new THREE.Vector3(65, 4.0, 130),     // Turn 12-13 (Fagnes / Pif-Paf chicane climb, +4.0m)
      new THREE.Vector3(55, 4.8, 160),     // Turn 14 (Campus right crest, +4.8m)
      new THREE.Vector3(40, 3.2, 185),     // Turn 15 (Stavelot apex, +3.2m)
      new THREE.Vector3(0, 2.0, 180),      // Turn 16 (Courbe Paul Frère, +2.0m)
      new THREE.Vector3(-40, 1.0, 140),    // Turn 17 (Blanchimont 1 flat-out left descent, +1.0m)
      new THREE.Vector3(-65, 0.2, 115),    // Turn 18 (Blanchimont 2 approaching underpass, +0.2m)
      new THREE.Vector3(-80, 0, 95),       // Turn 19 (Bus Stop Underpass beneath the Overpass Bridge, 0m)
      new THREE.Vector3(-90, 0, 85),       // Turn 20 (Bus Stop exit onto pit straight, 0m)
    ],
  },

  circuit_silverstone: {
    id: 'circuit_silverstone',
    title: 'Silverstone Circuit',
    badge: '★★★★☆ FAST',
    badgeClass: 'badge-hard',
    get desc(): string {
      return t('wizard.circuitSilverstoneDesc');
    },
    len: '5.891 km',
    corners: '18 CORNERS',
    record: '01:27.097',
    type: 'HOME OF BRITISH MOTORSPORT',
    circuitWidth: 15.0,
    controlPoints: [
      new THREE.Vector3(0, 0, 0),          // Start / Finish Line (Hamilton Straight, 0m)
      new THREE.Vector3(0, 0, 50),         // Hamilton Straight acceleration (0m)
      new THREE.Vector3(35, 0, 105),       // Turn 1 (Abbey high-speed right, 0m)
      new THREE.Vector3(80, 0.5, 125),     // Turn 2 (Farm Curve flat out, +0.5m)
      new THREE.Vector3(120, 1.2, 105),    // Turn 3 (Village Hairpin heavy braking, +1.2m)
      new THREE.Vector3(100, 1.0, 70),     // Turn 4 (The Loop tight hairpin, +1.0m)
      new THREE.Vector3(65, 0.5, 75),      // Turn 5 (Aintree acceleration, +0.5m)
      new THREE.Vector3(0, 0, 70),         // Wellington Straight entry (0m)
      new THREE.Vector3(-65, 0, 65),       // Wellington Straight mid section (0m)
      new THREE.Vector3(-130, 0, 60),      // Wellington Straight braking zone (0m)
      new THREE.Vector3(-175, 0.2, 30),    // Turn 6 (Brooklands sweeping left, +0.2m)
      new THREE.Vector3(-185, 0.6, -20),   // Turn 7 (Luffield double-apex summit, +0.6m)
      new THREE.Vector3(-160, 0.3, -60),   // Turn 8 (Woodcote fast exit, +0.3m)
      new THREE.Vector3(-120, 0, -115),    // National Straight (0m)
      new THREE.Vector3(-85, 0, -165),     // Turn 9 (Copse ultra high-speed right apex, 0m)
      new THREE.Vector3(-45, 1.5, -195),   // Turn 10 (Maggotts high-G entry, +1.5m)
      new THREE.Vector3(-5, 2.0, -205),    // Turn 11-12 (Becketts S-curves crest, +2.0m)
      new THREE.Vector3(35, 1.5, -190),    // Turn 13-14 (Chapel exit onto Hangar Straight, +1.5m)
      new THREE.Vector3(95, 0.5, -160),    // Hangar Straight full throttle crest (+0.5m)
      new THREE.Vector3(155, 0, -125),     // Hangar Straight high-speed braking zone (0m)
      new THREE.Vector3(185, 0, -75),      // Turn 15 (Stowe heavy braking right, 0m)
      new THREE.Vector3(145, 0.2, -40),    // Turn 16 (Vale chicane downhill, +0.2m)
      new THREE.Vector3(90, 0.1, -65),     // Turn 17 (Vale exit chicane, +0.1m)
      new THREE.Vector3(30, 0, -90),       // Turn 18 (Club corner sweeping left, 0m)
      new THREE.Vector3(-5, 0, -50),       // Club corner exit lining up with Hamilton Straight (0m)
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
export function getCircuitSvgData(circuitId: CircuitId, width = 400, height = 240, padding = 34): CircuitSvgData {
  const def = CIRCUIT_DEFINITIONS[circuitId] || CIRCUIT_DEFINITIONS.circuit_monaco;
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
