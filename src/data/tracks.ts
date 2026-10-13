import * as THREE from 'three';

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
 * 2. Silverstone GP (초고속 복합 S-코너 GP 서킷)
 * 3. Nürburgring Nordschleife (장대한 고저차 롤러코스터 엔듀런스 서킷)
 */
export const TRACK_DEFINITIONS: Record<string, TrackMetadata> = {
  circuit_monaco: {
    id: 'circuit_monaco',
    title: 'Circuit de Monaco',
    badge: '★★★★★ HARD',
    badgeClass: 'badge-expert',
    desc: '모나코 몬테카를로 항만을 끼고 달리는 전설적인 도심 서킷. 폭이 좁고 가드레일이 가까워 극한의 집중력과 정밀한 브레이킹 포인트 제어가 요구됩니다.',
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

  circuit_silverstone: {
    id: 'circuit_silverstone',
    title: 'Silverstone GP',
    badge: '★★★☆☆ MEDIUM',
    badgeClass: 'badge-medium',
    desc: '영국 모터스포츠의 성지. 초고속 Maggotts-Becketts 복합 S자 코너와 긴 직선주로를 통해 고속 코너링 다운포스와 슬립스트림 추월의 진수를 선사합니다.',
    len: '5.891 km',
    corners: '18 CORNERS',
    record: '01:27.097',
    type: 'HIGH-SPEED GP',
    trackWidth: 15.5,
    controlPoints: [
      new THREE.Vector3(0, 0, 0),         // 스타트 피니시 (Hamilton Straight)
      new THREE.Vector3(120, 0, 0),       // Abbey 고속 우코너 진입
      new THREE.Vector3(190, 0, -50),     // Farm Curve & Village 시케인
      new THREE.Vector3(170, 0, -120),    // The Loop 타이트 헤어핀
      new THREE.Vector3(110, 0, -150),    // Aintree 가속 구간
      new THREE.Vector3(70, 0, -230),     // Wellington Straight (긴 직선)
      new THREE.Vector3(10, 0, -270),     // Brooklands 중속 좌턴
      new THREE.Vector3(-60, 0, -250),    // Luffield 롱 더블 아펙스
      new THREE.Vector3(-110, 0, -180),   // Woodcote 복귀 가속
      new THREE.Vector3(-160, 0, -110),   // Copse 고속 블라인드 우코너
      new THREE.Vector3(-220, 0, -40),    // Maggotts 초고속 S자 진입
      new THREE.Vector3(-250, 0, 40),     // Becketts 횡가속 S자 굴절
      new THREE.Vector3(-200, 0, 110),    // Chapel 탈출
      new THREE.Vector3(-90, 0, 120),     // Hangar Straight (초고속 슬립스트림 스트레이트)
      new THREE.Vector3(-20, 0, 70),      // Stowe 코너 & Vale 시케인 복귀
    ],
  },

  circuit_nurburgring: {
    id: 'circuit_nurburgring',
    title: 'Nürburgring Nordschleife',
    badge: '★★★★★★ INSANE',
    badgeClass: 'badge-insane',
    desc: '악명 높은 녹색 지옥(Green Hell). 극심한 고저차와 연속 블라인드 코너, 뱅킹 Carousel이 공존하는 세계에서 가장 장대하고 위험한 서킷입니다.',
    len: '20.832 km',
    corners: '154 CORNERS',
    record: '06:40.330',
    type: 'ROLLERCOASTER',
    trackWidth: 14.0,
    controlPoints: [
      new THREE.Vector3(0, 0, 0),         // 메인 그랜드스탠드 스타트 라인
      new THREE.Vector3(100, 0, 40),      // Antoniusbuche 고속 우턴
      new THREE.Vector3(200, 0, 30),      // Hatzenbach 테크니컬 S-곡선 진입
      new THREE.Vector3(280, 0, -50),     // Hocheichen 숲길 진입
      new THREE.Vector3(300, 0, -160),    // Flugplatz 점프 가속 스트레이트
      new THREE.Vector3(240, 0, -260),    // Schwedenkreuz 고속 블라인드
      new THREE.Vector3(150, 0, -320),    // Aremberg 헤어핀 브레이킹
      new THREE.Vector3(40, 0, -340),     // Fuchsröhre (여우굴) 급강하 구간
      new THREE.Vector3(-80, 0, -320),    // Adenauer Forst 더블 에이펙스 시케인
      new THREE.Vector3(-180, 0, -260),   // Metzgesfeld 숲속 고속 탈출
      new THREE.Vector3(-260, 0, -180),   // Kallenhard 급경사 우턴
      new THREE.Vector3(-310, 0, -80),    // Wehrseifen 다운힐 헤어핀
      new THREE.Vector3(-300, 0, 40),     // Breidscheid 다리 건너기
      new THREE.Vector3(-240, 0, 140),    // Bergwerk (광산 코너)
      new THREE.Vector3(-140, 0, 210),    // Caracciola-Karussell (콘크리트 뱅킹 헤어핀)
      new THREE.Vector3(-50, 0, 220),     // Wippermann & Brünnchen 점프존
      new THREE.Vector3(30, 0, 180),      // Pflanzgarten 고속 다운힐
      new THREE.Vector3(50, 0, 90),       // Döttinger Höhe 2km 초고속 백스트레이트 진입
    ],
  },
};
