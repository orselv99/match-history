import { CIRCUIT_DEFINITIONS, getCircuitSvgData, type CircuitId } from '../data/circuits.ts';

/**
 * 게임 설정 위저드 Step 1: 서킷 2D SVG 트랙맵 및 스펙 쇼케이스 렌더러
 */
export class CircuitPreview {
  private circuitCards: NodeListOf<HTMLElement>;
  private circuitSvgs: Map<CircuitId, HTMLElement | null>;
  private showcaseTitle: HTMLElement | null;
  private showcaseBadge: HTMLElement | null;
  private showcaseDesc: HTMLElement | null;
  private specLen: HTMLElement | null;
  private specCorners: HTMLElement | null;
  private specRecord: HTMLElement | null;
  private specType: HTMLElement | null;

  constructor(onSelect?: (id: CircuitId) => void) {
    this.circuitCards = document.querySelectorAll<HTMLElement>('.wizard-choice-card[data-circuit]');
    this.circuitSvgs = new Map<CircuitId, HTMLElement | null>([
      ['circuit_monaco', document.getElementById('circuit-svg-monaco')],
      ['circuit_monza', document.getElementById('circuit-svg-monza')],
      ['circuit_spa', document.getElementById('circuit-svg-spa')],
    ]);
    this.showcaseTitle = document.getElementById('circuit-showcase-title');
    this.showcaseBadge = document.getElementById('circuit-showcase-badge');
    this.showcaseDesc = document.getElementById('circuit-showcase-desc');
    this.specLen = document.getElementById('circuit-spec-len');
    this.specCorners = document.getElementById('circuit-spec-corners');
    this.specRecord = document.getElementById('circuit-spec-record');
    this.specType = document.getElementById('circuit-spec-type');

    this.initCircuitSvgs();

    if (onSelect) {
      this.circuitCards.forEach(card => {
        card.addEventListener('click', () => {
          const id = (card.dataset.circuit as CircuitId) || 'circuit_monaco';
          onSelect(id);
        });
      });
    }
  }

  public update(selectedCircuit: CircuitId): void {
    this.circuitCards.forEach(c => {
      c.classList.toggle('active', c.dataset.circuit === selectedCircuit);
    });

    this.circuitSvgs.forEach((el, id) => {
      el?.classList.toggle('active', id === selectedCircuit);
    });

    const meta = CIRCUIT_DEFINITIONS[selectedCircuit];
    if (meta) {
      if (this.showcaseTitle) this.showcaseTitle.textContent = meta.title;
      if (this.showcaseBadge) {
        this.showcaseBadge.textContent = meta.badge;
        this.showcaseBadge.className = `choice-card-badge ${meta.badgeClass}`;
      }
      if (this.showcaseDesc) this.showcaseDesc.textContent = meta.desc;
      if (this.specLen) this.specLen.textContent = meta.len;
      if (this.specCorners) this.specCorners.textContent = meta.corners;
      if (this.specRecord) this.specRecord.textContent = meta.record;
      if (this.specType) this.specType.textContent = meta.type;
    }
  }

  private initCircuitSvgs(): void {
    this.circuitSvgs.forEach((el, id) => {
      if (!el) return;
      const data = getCircuitSvgData(id);
      const pathEl = el.querySelector<SVGPathElement>('.circuit-svg-outline');
      const circleEl = el.querySelector<SVGCircleElement>('.circuit-start-pin');
      const textEl = el.querySelector<SVGTextElement>('.circuit-start-text');

      if (pathEl) pathEl.setAttribute('d', data.pathD);
      if (circleEl) {
        circleEl.setAttribute('cx', data.startX.toString());
        circleEl.setAttribute('cy', data.startY.toString());
      }
      if (textEl) {
        textEl.setAttribute('x', data.textX.toString());
        textEl.setAttribute('y', data.textY.toString());
      }
    });
  }
}
