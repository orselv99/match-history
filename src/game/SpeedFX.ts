/**
 * 고속 주행 시각화 효과 매니저 (SpeedFX)
 * - 100 km/h 초과: 에어로다이내믹 속도선 스트림 및 주변부 비네트 시각화
 * - 200 km/h 초과: 하이퍼스피드 워프 가속선(순백+크림슨 레드), 터널비전 모션블러 비네트 활성화
 */
export class SpeedFX {
  private canvas: HTMLCanvasElement | null;
  private ctx: CanvasRenderingContext2D | null = null;
  private vignetteEl: HTMLElement | null;
  private width: number = 0;
  private height: number = 0;

  // 55개 속도선 파티클 풀링 (가비지 컬렉션 방지)
  private streaks: Array<{
    angle: number;
    dist: number;      // 0.15 ~ 1.25 (소실점으로부터의 방사 거리 비율)
    length: number;    // 선 길이 비율
    speed: number;     // 전진 속도 계수
    width: number;     // 선 두께
    alpha: number;     // 기본 알파값
    isAccent: boolean; // 200km/h 이상 시 레드라인 액센트 선 여부
  }> = [];

  constructor() {
    this.canvas = document.getElementById('speed-fx-canvas') as HTMLCanvasElement;
    if (this.canvas) {
      this.ctx = this.canvas.getContext('2d');
    }
    this.vignetteEl = document.getElementById('speed-blur-vignette');

    this.resize();
    window.addEventListener('resize', () => this.resize());

    // 스트릭 풀 초기화
    for (let i = 0; i < 55; i++) {
      this.streaks.push({
        angle: Math.random() * Math.PI * 2,
        dist: 0.15 + Math.random() * 0.95,
        length: 0.04 + Math.random() * 0.08,
        speed: 0.45 + Math.random() * 0.75,
        width: 1.0 + Math.random() * 1.5,
        alpha: 0.25 + Math.random() * 0.55,
        isAccent: Math.random() < 0.28,
      });
    }
  }

  public resize(): void {
    if (!this.canvas) return;
    this.width = window.innerWidth;
    this.height = window.innerHeight;
    this.canvas.width = this.width;
    this.canvas.height = this.height;
  }

  /**
   * 프레임별 속도선 및 모션 블러 비네트 갱신
   * @param delta 프레임 경과 시간(초)
   * @param speedKmh 현재 차량 속도(km/h)
   */
  public update(delta: number, speedKmh: number): void {
    if (!this.canvas || !this.ctx) return;

    // 95km/h 미만 시 렌더링 생략 및 비네트 페이드아웃 (CPU/GPU 비용 0)
    if (speedKmh < 95) {
      if (this.canvas.style.display !== 'none') {
        this.ctx.clearRect(0, 0, this.width, this.height);
        this.canvas.style.display = 'none';
      }
      if (this.vignetteEl) {
        this.vignetteEl.style.opacity = '0';
        this.vignetteEl.classList.remove('hyper');
      }
      return;
    }

    if (this.canvas.style.display === 'none') {
      this.canvas.style.display = 'block';
    }

    // 100km/h: ~0.15, 200km/h: 1.0, 240km/h: 1.35
    const intensity = Math.min(1.4, Math.max(0.1, (speedKmh - 95) / 105));
    const isHyperSpeed = speedKmh >= 195;

    // 1. 주변부 터널비전 모션블러 비네트 제어
    if (this.vignetteEl) {
      const vignetteOpacity = Math.min(0.85, 0.15 + intensity * 0.55);
      this.vignetteEl.style.opacity = vignetteOpacity.toFixed(2);
      this.vignetteEl.classList.toggle('hyper', isHyperSpeed);
    }

    // 2. 캔버스 클리어 및 소실점 계산
    this.ctx.clearRect(0, 0, this.width, this.height);

    const centerX = this.width * 0.5;
    const centerY = this.height * 0.52; // 3D 체이스 카메라의 지평선 소실점 위치
    const maxRadius = Math.hypot(centerX, centerY);

    const speedScale = 1.0 + (speedKmh / 100) * 1.3;
    this.ctx.lineCap = 'round';

    // 3. 다이내믹 속도선 드로잉
    for (let i = 0; i < this.streaks.length; i++) {
      const s = this.streaks[i];

      // 방사형 바깥으로 전진
      s.dist += s.speed * speedScale * delta * 0.65;
      if (s.dist > 1.25) {
        s.dist = 0.15 + Math.random() * 0.2;
        s.angle = Math.random() * Math.PI * 2;
      }

      // 선 길이: 속도 및 200km/h 하이퍼 모드에서 대폭 확장
      const currentLen = s.length * (1.0 + intensity * 1.5);
      const innerDist = Math.max(0.08, s.dist - currentLen);

      const r1 = innerDist * maxRadius;
      const r2 = s.dist * maxRadius;

      const cosA = Math.cos(s.angle);
      const sinA = Math.sin(s.angle);

      const x1 = centerX + cosA * r1;
      const y1 = centerY + sinA * r1;
      const x2 = centerX + cosA * r2;
      const y2 = centerY + sinA * r2;

      // 소실점 부근은 은은하게, 주변부로 나갈수록 선명하게 페이드
      const radialFade = Math.min(1.0, Math.max(0.08, (s.dist - 0.15) / 0.5));
      const finalAlpha = Math.min(0.92, s.alpha * intensity * radialFade);

      this.ctx.beginPath();
      this.ctx.moveTo(x1, y1);
      this.ctx.lineTo(x2, y2);
      this.ctx.lineWidth = s.width * (isHyperSpeed ? 1.5 : 1.0);

      if (isHyperSpeed && s.isAccent) {
        // 200km/h 초과: 크림슨 레드(#f43f5e) 워프 가속선
        this.ctx.strokeStyle = `rgba(244, 63, 94, ${finalAlpha})`;
      } else if (isHyperSpeed) {
        // 200km/h 초과: 순백색 하이퍼스피드 광선
        this.ctx.strokeStyle = `rgba(255, 255, 255, ${Math.min(1.0, finalAlpha * 1.15)})`;
      } else {
        // 100km/h 초과: 에어로다이내믹 아이스 스카이블루(#e0f2fe)
        this.ctx.strokeStyle = `rgba(224, 242, 254, ${finalAlpha * 0.85})`;
      }

      this.ctx.stroke();
    }
  }

  public clear(): void {
    if (this.ctx) {
      this.ctx.clearRect(0, 0, this.width, this.height);
    }
    if (this.canvas) {
      this.canvas.style.display = 'none';
    }
    if (this.vignetteEl) {
      this.vignetteEl.style.opacity = '0';
      this.vignetteEl.classList.remove('hyper');
    }
  }
}
