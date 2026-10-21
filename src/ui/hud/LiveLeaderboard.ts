import type { LeaderboardRacerEntry } from '../../types/game.ts';

interface RacerRowItem {
  rowEl: HTMLElement;
  badgeEl: HTMLElement;
  nameEl: HTMLElement;
  lastRank: number;
}

/**
 * 상단 좌측 실시간 순위표 (Live Leaderboard) 및 추월 애니메이션 전담 컴포넌트
 */
export class LiveLeaderboard {
  private rankContainer: HTMLElement | null;
  private leaderboardEl: HTMLElement | null;
  private racerRowMap: Map<string, RacerRowItem> = new Map();

  constructor() {
    this.rankContainer = document.getElementById('hud-rank-container');
    this.leaderboardEl = document.getElementById('hud-standings-tower');
  }

  public update(gameMode: string, standings?: LeaderboardRacerEntry[]): void {
    if (!this.rankContainer || !this.leaderboardEl) return;

    const showLeaderboard = gameMode !== 'TITLE' && !!standings && standings.length > 0;
    this.rankContainer.style.display = showLeaderboard ? 'block' : 'none';

    if (!showLeaderboard || !standings) return;

    // 1. 엔트리 키 변경 감지 시(모드 전환 등) 기존 노드 재생성
    const currentKeys = standings.map(s => s.id).join(',');
    const existingKeys = Array.from(this.racerRowMap.keys()).join(',');
    if (currentKeys !== existingKeys) {
      this.leaderboardEl.innerHTML = '';
      this.racerRowMap.clear();

      standings.forEach(racer => {
        const rowEl = document.createElement('div');
        rowEl.className = `tower-racer-row ${racer.isPlayer ? 'is-player' : ''}`;
        rowEl.setAttribute('data-racer-id', racer.id);

        const badgeEl = document.createElement('span');
        badgeEl.className = `tower-rank-badge p${racer.rank}`;
        badgeEl.textContent = `${racer.rank}`;

        const colorPill = document.createElement('span');
        colorPill.className = 'tower-color-pill';
        colorPill.style.backgroundColor = racer.color || '#38bdf8';

        const nameEl = document.createElement('span');
        nameEl.className = 'tower-driver-name';
        nameEl.innerHTML = `${racer.driverName}${racer.isPlayer ? ' <span class="tower-you-tag">YOU</span>' : ''}`;

        rowEl.appendChild(badgeEl);
        rowEl.appendChild(colorPill);
        rowEl.appendChild(nameEl);

        this.leaderboardEl!.appendChild(rowEl);
        this.racerRowMap.set(racer.id, {
          rowEl,
          badgeEl,
          nameEl,
          lastRank: racer.rank,
        });
      });
    }

    // 2. 실시간 순위 위치(Slot) 이동 및 셔플 애니메이션 적용
    standings.forEach(racer => {
      const item = this.racerRowMap.get(racer.id);
      if (!item) return;

      const slotIndex = racer.rank - 1; // 0, 1, 2, 3
      item.rowEl.style.transform = `translateY(${slotIndex * 31}px)`;
      item.rowEl.style.zIndex = `${5 - racer.rank}`;

      const expectedHtml = `${racer.driverName}${racer.isPlayer ? ' <span class="tower-you-tag">YOU</span>' : ''}`;
      if (item.nameEl.innerHTML !== expectedHtml) {
        item.nameEl.innerHTML = expectedHtml;
      }

      item.badgeEl.textContent = `${racer.rank}`;
      item.badgeEl.className = `tower-rank-badge p${Math.min(3, racer.rank)}`;

      // 순위 상승(추월) 시 시각적 펄스 애니메이션
      if (racer.rank !== item.lastRank) {
        if (racer.rank < item.lastRank) {
          item.rowEl.classList.remove('rank-up');
          void item.rowEl.offsetWidth; // force reflow
          item.rowEl.classList.add('rank-up');
        }
        item.lastRank = racer.rank;
      }
    });
  }
}
