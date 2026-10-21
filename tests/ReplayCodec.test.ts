import { describe, it, expect } from 'vitest';
import { ReplayCodec } from '../src/replay/ReplayCodec.ts';
import type { RawReplayTick } from '../src/replay/ReplayTypes.ts';

describe('ReplayCodec', () => {
  const sampleTicks: RawReplayTick[] = [
    {
      timeMs: 0,
      x: -5.12,
      y: 0.06,
      z: 2.06,
      yaw: 1.519,
      pitch: 0,
      roll: 0,
      speedKmh: 0,
      steer: 0,
      throttle: 1,
      brake: 0,
      isDrifting: false,
      lap: 1,
    },
    {
      timeMs: 67,
      x: -4.89,
      y: 0.06,
      z: 2.07,
      yaw: 1.521,
      pitch: 0.02,
      roll: -0.01,
      speedKmh: 12.5,
      steer: 0.1,
      throttle: 1,
      brake: 0,
      isDrifting: false,
      lap: 1,
    },
    {
      timeMs: 134,
      x: -4.10,
      y: 0.06,
      z: 2.10,
      yaw: 1.525,
      pitch: 0.01,
      roll: 0.03,
      speedKmh: 28.0,
      steer: -0.2,
      throttle: 0.8,
      brake: 0.5,
      isDrifting: true,
      lap: 1,
    },
  ];

  it('RawReplayTick 배열을 바이너리로 인코딩하고 헤더 및 크기가 유효해야 한다', () => {
    const buffer = ReplayCodec.encode(sampleTicks, 'circuit_monaco');
    expect(buffer).toBeInstanceOf(ArrayBuffer);

    // Header (26 bytes) + 3 ticks * 20 bytes = 86 bytes
    expect(buffer.byteLength).toBe(26 + 3 * 20);

    const view = new DataView(buffer);
    const magic = view.getUint32(0, false);
    expect(magic).toBe(0x52414345); // 'RACE'
  });

  it('인코딩된 바이너리 데이터를 디코딩했을 때 틱 위치 및 시간 데이터가 오차 범위 내로 복원되어야 한다', () => {
    const buffer = ReplayCodec.encode(sampleTicks, 'circuit_monaco');
    const { ticks, circuitId } = ReplayCodec.decode(buffer);

    expect(circuitId).toBe('circuit_monaco');
    expect(ticks.length).toBe(sampleTicks.length);

    // 1번 틱 검증
    expect(ticks[0].x).toBeCloseTo(sampleTicks[0].x, 1);
    expect(ticks[0].z).toBeCloseTo(sampleTicks[0].z, 1);
    expect(ticks[0].speedKmh).toBeCloseTo(sampleTicks[0].speedKmh, 0);

    // 3번 틱 드리프트 플래그 및 브레이크 입력 복원 검증
    expect(ticks[2].isDrifting).toBe(true);
    expect(ticks[2].brake).toBeGreaterThan(0.4);
    expect(ticks[2].speedKmh).toBeCloseTo(28.0, 0);
  });

  it('잘못된 매직 넘버를 가진 바이너리 데이터를 디코딩할 경우 예외를 발생시켜야 한다', () => {
    const invalidBuffer = new ArrayBuffer(50);
    const view = new DataView(invalidBuffer);
    view.setUint32(0, 0x12345678, false);

    expect(() => {
      ReplayCodec.decode(invalidBuffer);
    }).toThrow(/Invalid replay magic/);
  });
});
