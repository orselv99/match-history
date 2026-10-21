import { describe, it, expect, beforeEach } from 'vitest';
import * as THREE from 'three';
import { OpponentManager } from '../src/game/OpponentManager.ts';
import type { Circuit } from '../src/game/Circuit.ts';

describe('OpponentManager', () => {
  let opponentManager: OpponentManager;

  const mockCircuit = {
    circuitCurve: {
      getLength: () => 1200,
    },
    getGridPosition: (slot: number) => ({
      position: new THREE.Vector3(slot * 2, 0, 0),
      heading: 0,
    }),
  } as unknown as Circuit;

  beforeEach(() => {
    opponentManager = new OpponentManager(mockCircuit);
  });

  it('초기 생성 시 4대의 에이전트 이름이 opponent_ ID가 아닌 유효한 드라이버 이름이어야 한다', () => {
    expect(opponentManager.agents.length).toBe(4);
    opponentManager.agents.forEach((agent) => {
      expect(agent.driverName).not.toMatch(/^opponent_\d+/i);
      expect(agent.driverName.length).toBeGreaterThan(0);
    });
  });

  it('assignRivalDriverNames() 호출 시 플레이어 닉네임과 중복되지 않는 고유한 AI 드라이버 이름들이 할당되어야 한다', () => {
    const playerNickname = 'Apex Hunter';
    opponentManager.assignRivalDriverNames(playerNickname);

    // 슬롯 0은 플레이어 이름
    expect(opponentManager.agents[0].driverName).toBe(playerNickname);

    // 슬롯 1~3은 플레이어 이름과 중복되지 않고, 서로 고유해야 함
    const rivalNames = [
      opponentManager.agents[1].driverName,
      opponentManager.agents[2].driverName,
      opponentManager.agents[3].driverName,
    ];

    rivalNames.forEach((name) => {
      expect(name).not.toBe(playerNickname);
      expect(name).not.toMatch(/^opponent_\d+/i);
    });

    const uniqueSet = new Set(rivalNames);
    expect(uniqueSet.size).toBe(rivalNames.length);
  });

  it('DRIVING 모드 (asRivals: true) 시 슬롯 0은 플레이어용으로 비활성화되고 라이벌들에게 고유 닉네임이 부여되어야 한다', () => {
    const playerNickname = '질주본능';
    opponentManager.resetToGrids(true, 2, playerNickname);

    expect(opponentManager.agents[0].vehicle.mesh.visible).toBe(false);
    expect(opponentManager.agents[0].driverName).toBe(playerNickname);

    for (let i = 1; i < opponentManager.agents.length; i++) {
      const a = opponentManager.agents[i];
      expect(a.vehicle.mesh.visible).toBe(true);
      expect(a.driverName).not.toBe(playerNickname);
      expect(a.driverName).not.toMatch(/^opponent_\d+/i);
    }
  });

  it('DEMO 모드 (asRivals: false) 시 슬롯 0(플레이어 대리 AI)을 포함해 4대 모두 가시화되고 플레이어 닉네임이 유지되어야 한다', () => {
    const playerNickname = 'Monaco Ghost';
    opponentManager.resetToGrids(false, 0, playerNickname);

    expect(opponentManager.agents[0].vehicle.mesh.visible).toBe(true);
    expect(opponentManager.agents[0].driverName).toBe(playerNickname);

    for (let i = 1; i < opponentManager.agents.length; i++) {
      const a = opponentManager.agents[i];
      expect(a.vehicle.mesh.visible).toBe(true);
      expect(a.driverName).not.toBe(playerNickname);
      expect(a.driverName).not.toMatch(/^opponent_\d+/i);
    }
  });
});
