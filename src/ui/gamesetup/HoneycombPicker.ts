/**
 * Honeycomb (Hexagonal) Color Palette Picker Component
 * - 127개의 허니콤 헥사곤 셀로 구성된 원형 색상환 팔레트
 * - 중심 순백색(White) ➔ 내부 파스텔 ➔ 중간 비비드 레인보우 ➔ 외곽 다크 쉐이드
 * - 클릭 시 3D 차량 렌더링에 실시간 반영
 */
export class HoneycombPicker {
  private container: HTMLElement;
  private selectedHex: string = '#ef4444';
  private onColorSelect: (hex: string) => void;
  private svgEl!: SVGSVGElement;
  private swatchEl!: HTMLElement;
  private cells: { polygon: SVGPolygonElement; hex: string }[] = [];

  constructor(container: HTMLElement, initialHex: string = '#ef4444', onColorSelect: (hex: string) => void) {
    this.container = container;
    this.selectedHex = initialHex.toLowerCase();
    this.onColorSelect = onColorSelect;

    this.render();
  }

  private hslToHex(h: number, s: number, l: number): string {
    l /= 100;
    const a = (s * Math.min(l, 1 - l)) / 100;
    const f = (n: number) => {
      const k = (n + h / 30) % 12;
      const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
      return Math.round(255 * color).toString(16).padStart(2, '0');
    };
    return `#${f(0)}${f(8)}${f(4)}`.toLowerCase();
  }

  private render(): void {
    this.container.innerHTML = `
      <div class="honeycomb-picker-box">
        <div id="honeycomb-swatch" class="honeycomb-swatch-top-right" style="background-color: ${this.selectedHex};"></div>
        <div class="honeycomb-svg-wrap">
          <svg class="honeycomb-svg" viewBox="-112 -100 224 200"></svg>
        </div>
      </div>
    `;

    this.svgEl = this.container.querySelector('.honeycomb-svg') as SVGSVGElement;
    this.swatchEl = this.container.querySelector('#honeycomb-swatch') as HTMLElement;

    // 허니콤 헥사곤 셀 생성 (R = 6, 127셀)
    const R = 6;
    const s = 9.2; // 헥사곤 반지름 크기
    const maxDist = s * Math.sqrt(3) * R;

    for (let q = -R; q <= R; q++) {
      const r1 = Math.max(-R, -q - R);
      const r2 = Math.min(R, -q + R);
      for (let r = r1; r <= r2; r++) {
        const cx = s * Math.sqrt(3) * (q + r / 2.0);
        const cy = s * 1.5 * r;
        const dist = Math.sqrt(cx * cx + cy * cy);
        const normDist = Math.min(1.0, dist / maxDist);

        let cellHex = '#ffffff';
        if (dist > 1e-4) {
          const angleDeg = Math.atan2(cy, cx) * (180 / Math.PI);
          const a = (angleDeg + 360) % 360;
          const hue = a <= 90 ? (300 + (a / 90) * 60) % 360 : (120 * (a - 90)) / 90;
          const sat = Math.min(100, Math.round(35 + normDist * 65));

          let lightness = 50;
          if (normDist < 0.22) {
            lightness = 100 - normDist * 80;
          } else if (normDist < 0.65) {
            lightness = 82 - (normDist - 0.22) * 68;
          } else {
            lightness = 52 - (normDist - 0.65) * 82;
          }
          cellHex = this.hslToHex(Math.round(hue), sat, Math.max(18, Math.round(lightness)));
        }

        // 6개 꼭짓점 생성 (Pointy-topped)
        const pointsArr: string[] = [];
        for (let k = 0; k < 6; k++) {
          const angle = (k * Math.PI) / 3 + Math.PI / 6;
          const px = Number((cx + s * Math.cos(angle)).toFixed(2));
          const py = Number((cy + s * Math.sin(angle)).toFixed(2));
          pointsArr.push(`${px},${py}`);
        }

        const polygon = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
        polygon.setAttribute('points', pointsArr.join(' '));
        polygon.setAttribute('fill', cellHex);
        polygon.setAttribute('data-hex', cellHex);
        polygon.setAttribute('class', 'honeycomb-cell');

        if (cellHex === this.selectedHex) {
          polygon.classList.add('selected');
        }

        polygon.addEventListener('click', () => {
          this.selectColor(cellHex);
        });

        this.svgEl.appendChild(polygon);
        this.cells.push({ polygon, hex: cellHex });
      }
    }
  }

  public selectColor(hex: string): void {
    this.selectedHex = hex.toLowerCase();
    this.swatchEl.style.backgroundColor = hex;

    // 활성 셀 하이라이트 갱신
    let foundExact = false;
    this.cells.forEach(({ polygon, hex: cellHex }) => {
      if (cellHex === this.selectedHex) {
        polygon.classList.add('selected');
        foundExact = true;
      } else {
        polygon.classList.remove('selected');
      }
    });

    if (!foundExact) {
      // 정확한 타일이 없는 임의 색상인 경우 가장 가까운 셀 선택
      this.highlightClosestCell(this.selectedHex);
    }

    this.onColorSelect(hex);
  }

  private highlightClosestCell(targetHex: string): void {
    const targetRgb = this.hexToRgb(targetHex);
    if (!targetRgb) return;

    let closestDist = Infinity;
    let closestPoly: SVGPolygonElement | null = null;

    this.cells.forEach(({ polygon, hex: cellHex }) => {
      const rgb = this.hexToRgb(cellHex);
      if (rgb) {
        const d =
          (rgb.r - targetRgb.r) ** 2 +
          (rgb.g - targetRgb.g) ** 2 +
          (rgb.b - targetRgb.b) ** 2;
        if (d < closestDist) {
          closestDist = d;
          closestPoly = polygon;
        }
      }
    });

    this.cells.forEach(({ polygon }) => polygon.classList.remove('selected'));
    if (closestPoly) {
      (closestPoly as SVGPolygonElement).classList.add('selected');
    }
  }

  private hexToRgb(hex: string): { r: number; g: number; b: number } | null {
    const clean = hex.replace('#', '');
    if (clean.length !== 6) return null;
    return {
      r: parseInt(clean.substring(0, 2), 16),
      g: parseInt(clean.substring(2, 4), 16),
      b: parseInt(clean.substring(4, 6), 16),
    };
  }

  public getColor(): string {
    return this.selectedHex;
  }
}
