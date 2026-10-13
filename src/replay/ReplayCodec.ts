import { RawReplayTick, REPLAY_PACKET } from './ReplayTypes.ts';

/**
 * 고주파 리플레이 데이터 직렬화/역직렬화 및 초압축 코덱
 * - Float32 ➡️ Int16 고정소수점 양자화 (cm 단위)
 * - 0~2PI 라디안 ➡️ Uint16 (0~65535) 각도 정규화
 * - 브라우저 네이티브 CompressionStream(Gzip) 파이프라인
 */
export class ReplayCodec {
  /**
   * RawReplayTick 배열을 20바이트 고정 바이너리 버퍼로 인코딩
   */
  public static encode(ticks: RawReplayTick[], trackId: string = 'circuit_monaco'): ArrayBuffer {
    const totalTicks = ticks.length;
    // 헤더 크기: Magic(4) + Version(2) + TotalTicks(4) + TrackId(16 ASCII) = 26 bytes
    const HEADER_SIZE = 26;
    const totalBytes = HEADER_SIZE + totalTicks * REPLAY_PACKET.TICK_BYTES;

    const buffer = new ArrayBuffer(totalBytes);
    const view = new DataView(buffer);

    // 1. 헤더 작성
    view.setUint32(0, REPLAY_PACKET.HEADER_MAGIC, false); // 'RACE' Big-Endian
    view.setUint16(4, REPLAY_PACKET.VERSION, true);       // Version 1 Little-Endian
    view.setUint32(6, totalTicks, true);                     // Total Ticks Little-Endian

    // Track ID (16바이트 고정 길이 문자열 패딩)
    const encoder = new TextEncoder();
    const trackBytes = encoder.encode(trackId.slice(0, 16).padEnd(16, ' '));
    new Uint8Array(buffer, 10, 16).set(trackBytes);

    // 2. 틱 데이터 패킹 (20바이트씩)
    let offset = HEADER_SIZE;
    let prevTimeMs = 0;

    for (let i = 0; i < totalTicks; i++) {
      const t = ticks[i];

      // [0..1] timeDelta (10ms 단위, 1 = 10ms)
      const delta10ms = Math.min(65535, Math.round((t.timeMs - prevTimeMs) / 10));
      view.setUint16(offset + 0, delta10ms, true);
      prevTimeMs = t.timeMs;

      // [2..7] PosX, PosY, PosZ: cm 단위 Int16 (-32768 ~ 32767 cm = ±327.67m)
      const xCm = Math.max(-32768, Math.min(32767, Math.round(t.x * 100)));
      const yCm = Math.max(-32768, Math.min(32767, Math.round(t.y * 100)));
      const zCm = Math.max(-32768, Math.min(32767, Math.round(t.z * 100)));
      view.setInt16(offset + 2, xCm, true);
      view.setInt16(offset + 4, yCm, true);
      view.setInt16(offset + 6, zCm, true);

      // [8..9] Yaw: 0 ~ 2PI 라디안 ➡️ Uint16 (0 ~ 65535)
      let normalizedYaw = t.yaw % (Math.PI * 2);
      if (normalizedYaw < 0) normalizedYaw += Math.PI * 2;
      const yawU16 = Math.round((normalizedYaw / (Math.PI * 2)) * 65535);
      view.setUint16(offset + 8, yawU16, true);

      // [10..11] Pitch & Roll 각도 (각 1바이트씩 압축: -128 ~ 127)
      const pitchB = Math.max(-128, Math.min(127, Math.round((t.pitch / Math.PI) * 127)));
      const rollB = Math.max(-128, Math.min(127, Math.round((t.roll / Math.PI) * 127)));
      view.setInt8(offset + 10, pitchB);
      view.setInt8(offset + 11, rollB);

      // [12..13] Speed (0.1 km/h 단위 Uint16)
      const speedU16 = Math.min(65535, Math.round(t.speedKmh * 10));
      view.setUint16(offset + 12, speedU16, true);

      // [14] Steer (-1.0 ~ 1.0 ➡️ -127 ~ 127 Int8)
      const steerI8 = Math.max(-127, Math.min(127, Math.round(t.steer * 127)));
      view.setInt8(offset + 14, steerI8);

      // [15] Throttle (0.0 ~ 1.0 ➡️ 0 ~ 255 Uint8)
      view.setUint8(offset + 15, Math.min(255, Math.round(t.throttle * 255)));

      // [16] Brake (0.0 ~ 1.0 ➡️ 0 ~ 255 Uint8)
      view.setUint8(offset + 16, Math.min(255, Math.round(t.brake * 255)));

      // [17] Flags: Bit 0 = Drifting, Bit 1~7 = Lap 번호(하위 7비트)
      let flags = (t.isDrifting ? 1 : 0);
      flags |= ((t.lap & 0x7f) << 1);
      view.setUint8(offset + 17, flags);

      // [18..19] Reserved (0)
      view.setUint16(offset + 18, 0, true);

      offset += REPLAY_PACKET.TICK_BYTES;
    }

    return buffer;
  }

  /**
   * 바이너리 버퍼를 RawReplayTick 배열로 디코딩
   */
  public static decode(buffer: ArrayBuffer): { ticks: RawReplayTick[]; trackId: string } {
    const view = new DataView(buffer);
    const magic = view.getUint32(0, false);
    if (magic !== REPLAY_PACKET.HEADER_MAGIC) {
      throw new Error(`Invalid replay magic: 0x${magic.toString(16)}`);
    }

    const version = view.getUint16(4, true);
    const totalTicks = view.getUint32(6, true);

    const decoder = new TextDecoder();
    const trackIdBytes = new Uint8Array(buffer, 10, 16);
    const trackId = decoder.decode(trackIdBytes).trim();

    const HEADER_SIZE = 26;
    const ticks: RawReplayTick[] = [];
    let offset = HEADER_SIZE;
    let accumulatedTimeMs = 0;

    for (let i = 0; i < totalTicks; i++) {
      const delta10ms = view.getUint16(offset + 0, true);
      accumulatedTimeMs += delta10ms * 10;

      const x = view.getInt16(offset + 2, true) / 100;
      const y = view.getInt16(offset + 4, true) / 100;
      const z = view.getInt16(offset + 6, true) / 100;

      const yawU16 = view.getUint16(offset + 8, true);
      const yaw = (yawU16 / 65535) * Math.PI * 2;

      const pitchB = view.getInt8(offset + 10);
      const rollB = view.getInt8(offset + 11);
      const pitch = (pitchB / 127) * Math.PI;
      const roll = (rollB / 127) * Math.PI;

      const speedKmh = view.getUint16(offset + 12, true) / 10;
      const steer = view.getInt8(offset + 14) / 127;
      const throttle = view.getUint8(offset + 15) / 255;
      const brake = view.getUint8(offset + 16) / 255;

      const flags = view.getUint8(offset + 17);
      const isDrifting = (flags & 1) === 1;
      const lap = (flags >> 1) & 0x7f;

      ticks.push({
        timeMs: accumulatedTimeMs,
        x, y, z,
        yaw, pitch, roll,
        speedKmh,
        steer, throttle, brake,
        isDrifting,
        lap
      });

      offset += REPLAY_PACKET.TICK_BYTES;
    }

    return { ticks, trackId };
  }

  /**
   * 브라우저 내장 CompressionStream을 이용한 Gzip 압축
   */
  public static async compress(buffer: ArrayBuffer): Promise<Uint8Array> {
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(new Uint8Array(buffer));
        controller.close();
      }
    });

    // @ts-ignore (CompressionStream is standard in modern browsers & Node 18+)
    const cs = new CompressionStream('gzip');
    const compressedStream = stream.pipeThrough(cs);
    const response = new Response(compressedStream);
    const compressedArrayBuffer = await response.arrayBuffer();

    return new Uint8Array(compressedArrayBuffer);
  }

  /**
   * 브라우저 내장 DecompressionStream을 이용한 Gzip 압축 해제
   */
  public static async decompress(compressedBytes: Uint8Array): Promise<ArrayBuffer> {
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(compressedBytes);
        controller.close();
      }
    });

    // @ts-ignore
    const ds = new DecompressionStream('gzip');
    const decompressedStream = stream.pipeThrough(ds);
    const response = new Response(decompressedStream);
    return await response.arrayBuffer();
  }

  /**
   * 실시간 압축 벤치마크 지표 계산
   */
  public static async benchmark(ticks: RawReplayTick[]): Promise<{
    rawJsonBytes: number;
    binaryBytes: number;
    compressedBytes: number;
    reductionVsJsonPercent: number;
    reductionVsBinaryPercent: number;
  }> {
    const jsonStr = JSON.stringify(ticks);
    const rawJsonBytes = new TextEncoder().encode(jsonStr).byteLength;

    const binaryBuffer = this.encode(ticks);
    const binaryBytes = binaryBuffer.byteLength;

    const compressed = await this.compress(binaryBuffer);
    const compressedBytes = compressed.byteLength;

    const reductionVsJsonPercent = Number(((1 - (compressedBytes / rawJsonBytes)) * 100).toFixed(2));
    const reductionVsBinaryPercent = Number(((1 - (compressedBytes / binaryBytes)) * 100).toFixed(2));

    return {
      rawJsonBytes,
      binaryBytes,
      compressedBytes,
      reductionVsJsonPercent,
      reductionVsBinaryPercent
    };
  }
}

