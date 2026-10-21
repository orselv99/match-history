import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import {
  CIRCUIT_DEFINITIONS,
  STARTING_GRID_SLOTS,
  type CircuitId,
} from '../src/data/circuits.ts';

describe('Circuit Definitions & Starting Grid', () => {
  it('모든 공식 서킷(Monaco, Monza, Spa, Silverstone) 메타데이터가 정의되어 있어야 한다', () => {
    const circuitIds: CircuitId[] = ['circuit_monaco', 'circuit_monza', 'circuit_spa', 'circuit_silverstone'];
    
    circuitIds.forEach(id => {
      const def = CIRCUIT_DEFINITIONS[id];
      expect(def).toBeDefined();
      expect(def.title).toBeTruthy();
      expect(def.circuitWidth).toBeGreaterThan(10);
      expect(def.controlPoints.length).toBeGreaterThan(5);
    });
  });

  it('STARTING_GRID_SLOTS은 4개 슬롯에 대해 좌우 교차 레인(±2.2m)과 안전 후방 거리를 가져야 한다', () => {
    expect(STARTING_GRID_SLOTS.length).toBe(4);

    expect(STARTING_GRID_SLOTS[0]).toEqual({ slotIndex: 0, distBehind: 5.0, lane: -2.2 });
    expect(STARTING_GRID_SLOTS[1]).toEqual({ slotIndex: 1, distBehind: 16.0, lane: 2.2 });
    expect(STARTING_GRID_SLOTS[2]).toEqual({ slotIndex: 2, distBehind: 27.0, lane: -2.2 });
    expect(STARTING_GRID_SLOTS[3]).toEqual({ slotIndex: 3, distBehind: 38.0, lane: 2.2 });
  });

  it('모나코 서킷의 모든 그리드 슬롯 위치가 트랙 아스팔트 폭(13.5m) 내에 안착해야 한다', () => {
    const def = CIRCUIT_DEFINITIONS.circuit_monaco;
    const curve = new THREE.CatmullRomCurve3(def.controlPoints, true, 'centripetal');
    const totalLength = curve.getLength();
    const halfWidth = def.circuitWidth / 2; // 6.75m

    STARTING_GRID_SLOTS.forEach(slot => {
      const u = ((1.0 - (slot.distBehind / totalLength)) % 1.0 + 1.0) % 1.0;
      const centerPos = curve.getPointAt(u);
      const tangent = curve.getTangentAt(u).normalize();
      const right = new THREE.Vector3(-tangent.z, 0, tangent.x).normalize();
      const pos = centerPos.clone().addScaledVector(right, slot.lane);

      // 중심선으로부터의 오프셋 거리 검증
      const distFromCenter = pos.distanceTo(centerPos);
      expect(distFromCenter).toBeCloseTo(Math.abs(slot.lane), 2);
      expect(distFromCenter).toBeLessThan(halfWidth); // 아스팔트 범위 이내

      // 여유 마진 (4.5m 이상 아스팔트 여유 공간 확보)
      const margin = halfWidth - distFromCenter;
      expect(margin).toBeGreaterThanOrEqual(4.0);
    });
  });
});
