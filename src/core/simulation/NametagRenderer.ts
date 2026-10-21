import { Vehicle } from '../../game/Vehicle.ts';
import { OpponentManager } from '../../game/OpponentManager.ts';
import { ReplayPlayer } from '../../replay/ReplayPlayer.ts';
import type { GameMode } from '../../types/game.ts';

/**
 * 3D 차량 머리 위 드라이버 네임태그 노출 제어 전담 렌더러
 * - 설정 토글에 따른 localStorage 영구 보관
 * - 현재 플레이어가 주시(Focus) 중인 차량은 제외하고 나머지 라이벌 차량에만 라벨 표시
 */
export class NametagRenderer {
  public showNametagsSetting: boolean = typeof localStorage !== 'undefined'
    ? localStorage.getItem('apex_show_nametags') !== 'false'
    : true;

  public setShowNametags(enabled: boolean): void {
    this.showNametagsSetting = enabled;
    try {
      localStorage.setItem('apex_show_nametags', enabled ? 'true' : 'false');
    } catch {}
  }

  public updateNameTags(
    focused: Vehicle | null,
    opponentManager: OpponentManager,
    replayPlayer: ReplayPlayer,
    mode: GameMode
  ): void {
    const allowNametags = this.showNametagsSetting;

    if (allowNametags && opponentManager.isActive) {
      const agents = opponentManager.agents;
      for (let i = 0; i < agents.length; i++) {
        const v = agents[i].vehicle;
        v.setNameTagVisible(v !== focused && v.mesh.visible);
      }
    } else if (allowNametags && mode === 'REPLAY') {
      replayPlayer.ghostVehicle.setNameTagVisible(false);
      for (let i = 0; i < replayPlayer.opponentVehicles.length; i++) {
        const v = replayPlayer.opponentVehicles[i];
        v.setNameTagVisible(v !== focused && v.mesh.visible);
      }
    } else {
      const agents = opponentManager.agents;
      for (let i = 0; i < agents.length; i++) {
        agents[i].vehicle.setNameTagVisible(false);
      }
      for (let i = 0; i < replayPlayer.opponentVehicles.length; i++) {
        replayPlayer.opponentVehicles[i].setNameTagVisible(false);
      }
    }
  }
}
