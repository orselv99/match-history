import * as THREE from 'three';

export type TimeOfDay = 'morning' | 'noon' | 'sunset' | 'night';
export type WeatherType = 'clear' | 'rain' | 'wind_fog' | 'snow';

export interface EnvironmentPreset {
  bgColor: number;
  fogColor: number;
  fogDensity: number;

  dirColor: number;
  dirIntensity: number;
  dirPos: THREE.Vector3;

  ambColor: number;
  ambIntensity: number;
  hemiSky: number;
  hemiGround: number;

  skyTop: number;
  skyUpperMid: number;
  skyLowerMid: number;
  skyHorizon: number;
  sunGlowColor: number;
  sunGlowStrength: number;

  cloudTopColor: number;
  cloudBellyColor: number;
  cloudTopEmissive: number;
  cloudBellyEmissive: number;
  cloudEmissiveIntensity: number;
  cloudWindX: number;

  sunOffset: THREE.Vector3;
  sunVisible: boolean;
  sunCoreColor: number;
  sunCoronaColor: number;
  sunCoronaScale: number;
  sunHorizonHaloColor: number;
  sunHorizonHaloOpacity: number;

  moonOffset: THREE.Vector3;
  moonVisible: boolean;

  starsVisible: boolean;
  starsOpacity: number;

  roadRoughness: number;
  roadMetalness: number;
  roadColor: number;

  isRaining: boolean;
  isFoggy: boolean;
  isSnowing: boolean;
  playRainAudio: boolean;
  needHeadlights: boolean;
}

export function getEnvironmentPreset(timeOfDay: TimeOfDay, weather: WeatherType): EnvironmentPreset {
  let bgColor = 0x121316;
  let fogColor = 0x121316;
  let fogDensity = 0.0022;
  let dirColor = 0xffedd5;
  let dirIntensity = 1.4;
  const dirPos = new THREE.Vector3(120, 150, 80);
  let ambColor = 0xdbeafe;
  let ambIntensity = 0.6;
  let hemiSky = 0x7dd3fc;
  let hemiGround = 0x121316;

  let skyTop = 0x1d4ed8;
  let skyUpperMid = 0x38bdf8;
  let skyLowerMid = 0x7dd3fc;
  let skyHorizon = 0xe0f2fe;
  let sunGlowColor = 0xfffbeb;
  let sunGlowStrength = 0.3;

  let cloudTopColor = 0xffffff;
  let cloudBellyColor = 0xcbd5e1;
  let cloudTopEmissive = 0x000000;
  let cloudBellyEmissive = 0x000000;
  let cloudEmissiveIntensity = 0.0;

  // 1. 시간대 기본 설정
  if (timeOfDay === 'morning') {
    bgColor = 0x60a5fa;
    fogColor = 0xfef3c7;
    fogDensity = 0.0016;
    dirColor = 0xfffbeb;
    dirIntensity = 1.85;
    dirPos.set(180, 55, 65);
    ambColor = 0xfef3c7;
    ambIntensity = 0.8;
    hemiSky = 0xfde68a;
    hemiGround = 0x334155;

    skyTop = 0x2563eb;
    skyUpperMid = 0x60a5fa;
    skyLowerMid = 0xfcd34d;
    skyHorizon = 0xfef3c7;
    sunGlowColor = 0xfde047;
    sunGlowStrength = 0.65;

    cloudTopColor = 0xfffbeb;
    cloudBellyColor = 0xfde68a;
    cloudTopEmissive = 0xfef08a;
    cloudBellyEmissive = 0xd97706;
    cloudEmissiveIntensity = 0.15;
  } else if (timeOfDay === 'noon') {
    bgColor = 0x38bdf8;
    fogColor = 0xdbeafe;
    fogDensity = 0.0014;
    dirColor = 0xffffff;
    dirIntensity = 2.2;
    dirPos.set(70, 200, 60);
    ambColor = 0xf8fafc;
    ambIntensity = 0.92;
    hemiSky = 0x7dd3fc;
    hemiGround = 0x334155;

    skyTop = 0x0284c7;
    skyUpperMid = 0x38bdf8;
    skyLowerMid = 0x7dd3fc;
    skyHorizon = 0xe0f2fe;
    sunGlowColor = 0xffffff;
    sunGlowStrength = 0.25;

    cloudTopColor = 0xffffff;
    cloudBellyColor = 0xcbd5e1;
    cloudEmissiveIntensity = 0.05;
    cloudTopEmissive = 0xffffff;
  } else if (timeOfDay === 'sunset') {
    bgColor = 0x4c1d4b;
    fogColor = 0x88394e;
    fogDensity = 0.0013;
    dirColor = 0xff9e5e;
    dirIntensity = 2.15;
    dirPos.set(210, 32, 95);
    ambColor = 0xc06c84;
    ambIntensity = 0.82;
    hemiSky = 0xfb923c;
    hemiGround = 0x2e1a36;

    skyTop = 0x161336;
    skyUpperMid = 0x5b2159;
    skyLowerMid = 0xc83e52;
    skyHorizon = 0xff9238;
    sunGlowColor = 0xffe082;
    sunGlowStrength = 0.92;

    cloudTopColor = 0xffc299;
    cloudBellyColor = 0x52254e;
    cloudTopEmissive = 0xf97316;
    cloudBellyEmissive = 0x3b173b;
    cloudEmissiveIntensity = 0.38;
  } else if (timeOfDay === 'night') {
    bgColor = 0x070a14;
    fogColor = 0x070a14;
    fogDensity = 0.0020; // 야간 서킷 시야 확보를 위해 안개 농도 최적화
    dirColor = 0x93c5fd; // 서킷 조명 및 은빛 달빛 반사광
    dirIntensity = 1.15; // 야간 서킷 조명 대폭 강화
    dirPos.set(60, 120, -80);
    ambColor = 0x24324a; // 앰비언트 광량 상향으로 아스팔트 및 도로 시설물 시인성 확보
    ambIntensity = 0.75;
    hemiSky = 0x3b82f6;
    hemiGround = 0x1e293b;

    skyTop = 0x03050a;
    skyUpperMid = 0x070b16;
    skyLowerMid = 0x0f172a;
    skyHorizon = 0x1e293b;
    sunGlowColor = 0x60a5fa;
    sunGlowStrength = 0.0;

    cloudTopColor = 0x334155;
    cloudBellyColor = 0x0f172a;
    cloudEmissiveIntensity = 0.0;
  }

  // 2. 날씨 효과 오버라이드
  let isRaining = false;
  let isFoggy = false;
  let isSnowing = false;
  let playRainAudio = false;
  let roadRoughness = 0.68;
  let roadMetalness = 0.16;
  let roadColor = timeOfDay === 'night' ? 0x343946 : 0x2e323b;

  if (weather === 'rain') {
    isRaining = true;
    playRainAudio = true;
    roadRoughness = 0.12;
    roadMetalness = 0.55;
    roadColor = timeOfDay === 'night' ? 0x181a20 : 0x222630;

    if (timeOfDay === 'morning') {
      bgColor = 0x94a3b8;
      fogColor = 0xb0bec5;
      fogDensity = 0.0042;
      dirColor = 0xfef3c7;
      dirIntensity = 1.25;
      ambColor = 0xe2e8f0;
      ambIntensity = 0.88;
      hemiSky = 0xcbd5e1;
      hemiGround = 0x334155;

      skyTop = 0x64748b;
      skyUpperMid = 0x829ab1;
      skyLowerMid = 0xa8b8c8;
      skyHorizon = 0xdbeafe;
      sunGlowStrength = 0.2;

      cloudTopColor = 0xcbd5e1;
      cloudBellyColor = 0x64748b;
      cloudEmissiveIntensity = 0.08;
    } else if (timeOfDay === 'noon') {
      bgColor = 0x829ab1;
      fogColor = 0x9fb3c8;
      fogDensity = 0.0040;
      dirColor = 0xe2e8f0;
      dirIntensity = 1.45;
      ambColor = 0xf1f5f9;
      ambIntensity = 0.98;
      hemiSky = 0xbae6fd;
      hemiGround = 0x334155;

      skyTop = 0x475569;
      skyUpperMid = 0x64748b;
      skyLowerMid = 0x8fa3b8;
      skyHorizon = 0xcbd5e1;
      sunGlowStrength = 0.15;

      cloudTopColor = 0xb0c4de;
      cloudBellyColor = 0x52667a;
      cloudEmissiveIntensity = 0.05;
    } else if (timeOfDay === 'sunset') {
      bgColor = 0x4a2c40;
      fogColor = 0x73414c;
      fogDensity = 0.0044;
      dirColor = 0xfb923c;
      dirIntensity = 1.15;
      ambColor = 0x9a6b78;
      ambIntensity = 0.76;
      hemiSky = 0xd97757;
      hemiGround = 0x261722;

      skyTop = 0x1f1930;
      skyUpperMid = 0x46263f;
      skyLowerMid = 0x7d3c47;
      skyHorizon = 0xc46243;
      sunGlowColor = 0xf97316;
      sunGlowStrength = 0.45;

      cloudTopColor = 0xb87a76;
      cloudBellyColor = 0x3d2336;
      cloudTopEmissive = 0xc2410c;
      cloudBellyEmissive = 0x291526;
      cloudEmissiveIntensity = 0.22;
    } else {
      bgColor = 0x090d16;
      fogColor = 0x0f172a;
      fogDensity = 0.0055;
      dirIntensity = 0.45;
      ambColor = 0x1e293b;
      ambIntensity = 0.45;

      skyTop = 0x04070e;
      skyUpperMid = 0x090f1d;
      skyLowerMid = 0x111a2e;
      skyHorizon = 0x1e293b;
      sunGlowStrength = 0.0;

      cloudTopColor = 0x283548;
      cloudBellyColor = 0x0f172a;
      cloudEmissiveIntensity = 0.0;
    }
  } else if (weather === 'wind_fog') {
    isFoggy = true;
    if (timeOfDay === 'morning') fogColor = 0xd4d4d8;
    else if (timeOfDay === 'noon') fogColor = 0xe2e8f0;
    else if (timeOfDay === 'sunset') fogColor = 0x8c464f;
    else fogColor = 0x0f172a;

    bgColor = fogColor;
    skyTop = fogColor;
    skyUpperMid = fogColor;
    skyLowerMid = fogColor;
    skyHorizon = fogColor;
    sunGlowStrength = 0.1;
    fogDensity = 0.024;
    dirIntensity *= 0.45;
    ambIntensity *= 1.25;

    roadRoughness = 0.55;
    roadMetalness = 0.25;
    roadColor = 0x282c35;
  } else if (weather === 'snow') {
    isSnowing = true;
    if (timeOfDay === 'morning') fogColor = 0xdde6ed;
    else if (timeOfDay === 'noon') fogColor = 0xe2e8f0;
    else if (timeOfDay === 'sunset') fogColor = 0xa37b88;
    else fogColor = 0x182030;

    bgColor = fogColor;
    skyTop = fogColor;
    skyUpperMid = fogColor;
    skyLowerMid = fogColor;
    skyHorizon = fogColor;
    sunGlowStrength = 0.05;
    fogDensity = 0.032; // 안개보다 강한 블리자드 시야 제한
    dirIntensity *= 0.40;
    ambIntensity *= 1.35;

    roadRoughness = 0.85;
    roadMetalness = 0.08;
    roadColor = timeOfDay === 'night' ? 0x5a6878 : 0xd5e0ea; // 눈 덮인 연회색/설원 노면
  }

  // 3. 천체(해/달/별) 상태
  const sunOffset = new THREE.Vector3(230, 34, 110);
  let sunVisible = false;
  let sunCoreColor = 0xffffff;
  let sunCoronaColor = 0xffedd5;
  let sunCoronaScale = 78;
  let sunHorizonHaloColor = 0xf97316;
  let sunHorizonHaloOpacity = 0.0;

  const moonOffset = new THREE.Vector3(160, 56, -240);
  let moonVisible = false;

  let starsVisible = false;
  let starsOpacity = 0.0;

  if (timeOfDay === 'morning') {
    sunOffset.set(220, 55, 75);
    sunCoreColor = 0xfef08a;
    sunCoronaColor = 0xfbbf24;
    sunHorizonHaloColor = 0xf59e0b;
    sunHorizonHaloOpacity = weather === 'clear' ? 0.35 : 0.0;
    sunVisible = weather === 'clear';
  } else if (timeOfDay === 'noon') {
    sunOffset.set(80, 240, 70);
    sunCoreColor = 0xffffff;
    sunCoronaColor = 0xffedd5;
    sunHorizonHaloOpacity = 0.0;
    sunVisible = weather === 'clear';
  } else if (timeOfDay === 'sunset') {
    sunOffset.set(230, 34, 110);
    sunCoreColor = 0xfff3b0;
    sunCoronaColor = 0xff7b38;
    sunCoronaScale = 95;
    sunHorizonHaloColor = 0xe11d48;
    sunHorizonHaloOpacity = weather === 'clear' ? 0.55 : 0.22;
    sunVisible = weather === 'clear';

    starsVisible = weather === 'clear';
    starsOpacity = 0.42;
  } else if (timeOfDay === 'night') {
    moonVisible = weather === 'clear';
    starsVisible = weather === 'clear';
    starsOpacity = 0.95;
  }

  // 야간에는 구름이 별빛을 가로질러 빠르게 날아가지 않도록 미풍(0.4m/s)으로 잔잔하게 연출
  const cloudWindX = timeOfDay === 'night'
    ? (weather === 'clear' ? 0.4 : 1.2)
    : (weather === 'wind_fog' ? 16.0 : (weather === 'snow' ? 12.0 : 4.5));
  const needHeadlights = timeOfDay === 'night' || weather === 'rain' || weather === 'wind_fog' || weather === 'snow';

  return {
    bgColor,
    fogColor,
    fogDensity,
    dirColor,
    dirIntensity,
    dirPos,
    ambColor,
    ambIntensity,
    hemiSky,
    hemiGround,
    skyTop,
    skyUpperMid,
    skyLowerMid,
    skyHorizon,
    sunGlowColor,
    sunGlowStrength,
    cloudTopColor,
    cloudBellyColor,
    cloudTopEmissive,
    cloudBellyEmissive,
    cloudEmissiveIntensity,
    cloudWindX,
    sunOffset,
    sunVisible,
    sunCoreColor,
    sunCoronaColor,
    sunCoronaScale,
    sunHorizonHaloColor,
    sunHorizonHaloOpacity,
    moonOffset,
    moonVisible,
    starsVisible,
    starsOpacity,
    roadRoughness,
    roadMetalness,
    roadColor,
    isRaining,
    isFoggy,
    isSnowing,
    playRainAudio,
    needHeadlights,
  };
}
