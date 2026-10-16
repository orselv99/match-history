import { Circuit } from './Circuit.ts';
import { Vehicle } from './Vehicle.ts';
import { AICarManager } from './AICarManager.ts';
import { ReplayPlayer } from '../replay/ReplayPlayer.ts';
import { t } from '../i18n/I18nManager.ts';

export interface MinimapRenderParams {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D | null;
  circuit: Circuit;
  targetVehicle: Vehicle;
  aiManager: AICarManager;
  replayPlayer: ReplayPlayer;
  mode: 'TITLE' | 'DRIVING' | 'REPLAY' | 'DEMO';
}

/**
 * 2D 캔버스 실시간 레이더 GPS 미니맵 전담 렌더러
 * - 플레이어 중심 동적 스크롤링 및 추적
 * - 3D 조향각/슬립각과 100% 동기화된 지향 화살표
 */
export class MinimapRenderer {
  public static draw(params: MinimapRenderParams): void {
    const { canvas, ctx, circuit, targetVehicle, aiManager, replayPlayer, mode } = params;
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;

    const targetPos = targetVehicle.position;

    // 동적 추적 좌표 변환 (차량이 항상 미니맵 정중앙에 위치하도록 오프셋 설정)
    const scale = 0.52;
    const offsetX = w / 2 - targetPos.x * scale;
    const offsetY = h / 2 - targetPos.z * scale;

    ctx.clearRect(0, 0, w, h);

    // 1. 배경 (Swiss Dark Card 면)
    ctx.fillStyle = '#14151a';
    ctx.fillRect(0, 0, w, h);

    // 2. 레이더 동심원 및 십자선 가이드
    ctx.strokeStyle = '#232630';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(w / 2, h / 2, 35, 0, Math.PI * 2);
    ctx.arc(w / 2, h / 2, 68, 0, Math.PI * 2);
    ctx.moveTo(w / 2, 0); ctx.lineTo(w / 2, h);
    ctx.moveTo(0, h / 2); ctx.lineTo(w, h / 2);
    ctx.stroke();

    // 3. 서킷 도로 렌더링 (아스팔트 베이스 + 경계선)
    if (circuit.circuitPoints2D && circuit.circuitPoints2D.length > 0) {
      // 아스팔트 베이스 (두꺼운 진한 도로)
      ctx.beginPath();
      ctx.lineWidth = 8;
      ctx.strokeStyle = '#232630';
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      circuit.circuitPoints2D.forEach((p, idx) => {
        const cx = p.x * scale + offsetX;
        const cy = p.z * scale + offsetY;
        if (idx === 0) ctx.moveTo(cx, cy);
        else ctx.lineTo(cx, cy);
      });
      ctx.closePath();
      ctx.stroke();

      // 서킷 주행 중심선
      ctx.beginPath();
      ctx.lineWidth = 3;
      ctx.strokeStyle = '#383d49';
      circuit.circuitPoints2D.forEach((p, idx) => {
        const cx = p.x * scale + offsetX;
        const cy = p.z * scale + offsetY;
        if (idx === 0) ctx.moveTo(cx, cy);
        else ctx.lineTo(cx, cy);
      });
      ctx.closePath();
      ctx.stroke();

      // 스타트 / 피니시 라인 (화이트 마커)
      const startP = circuit.circuitPoints2D[0];
      const sX = startP.x * scale + offsetX;
      const sY = startP.z * scale + offsetY;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(sX, sY, 3.5, 0, Math.PI * 2);
      ctx.fill();
    }

    // 4. 체크포인트 마커
    if (circuit.checkpoints) {
      ctx.fillStyle = '#475569';
      circuit.checkpoints.forEach(cp => {
        const cX = cp.position.x * scale + offsetX;
        const cY = cp.position.z * scale + offsetY;
        ctx.beginPath();
        ctx.arc(cX, cY, 2, 0, Math.PI * 2);
        ctx.fill();
      });
    }

    // 5. 주변 라이벌 AI 차량 닷 렌더링
    if (aiManager.isActive) {
      aiManager.agents.forEach(agent => {
        if (!agent.vehicle.mesh.visible || agent.vehicle === targetVehicle) return;
        const p = agent.vehicle.position;
        const ax = p.x * scale + offsetX;
        const ay = p.z * scale + offsetY;

        ctx.fillStyle = `#${agent.color.toString(16).padStart(6, '0')}`;
        ctx.beginPath();
        ctx.arc(ax, ay, 4, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 1;
        ctx.stroke();
      });
    }

    // 6. 리플레이 모드일 때 동승 경쟁 차량들 닷 표시
    if (mode === 'REPLAY') {
      replayPlayer.opponentVehicles.forEach(opp => {
        if (!opp.mesh.visible || opp === targetVehicle) return;
        const op = opp.position;
        ctx.fillStyle = `#${(opp.bodyColorHex || 0x38bdf8).toString(16).padStart(6, '0')}`;
        ctx.beginPath();
        ctx.arc(op.x * scale + offsetX, op.z * scale + offsetY, 4, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 1;
        ctx.stroke();
      });
    }

    // 7. 현재 중심 추적 차량 (정중앙 w/2, h/2에 방향 화살표 + 펄스 링 표시)
    ctx.save();
    ctx.translate(w / 2, h / 2);

    // 외곽 펄스 링
    ctx.strokeStyle = mode === 'DEMO' ? 'rgba(56, 189, 248, 0.5)' : 'rgba(239, 68, 68, 0.5)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, 9, 0, Math.PI * 2);
    ctx.stroke();

    // 차량 진행 방향 화살표 포인터 (3D 좌표계 -> 2D 캔버스 매핑 및 차량 조향각과 100% 일치)
    const carHeading = targetVehicle.heading + targetVehicle.slipAngle;
    const arrowAngle = Math.atan2(Math.sin(carHeading), -Math.cos(carHeading));
    ctx.rotate(arrowAngle);
    ctx.fillStyle = mode === 'DEMO' ? '#38bdf8' : '#ef4444';
    ctx.beginPath();
    ctx.moveTo(0, -8);
    ctx.lineTo(6, 6);
    ctx.lineTo(0, 3.5);
    ctx.lineTo(-6, 6);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.2;
    ctx.stroke();
    ctx.restore();

    // 8. 테크니컬 HUD 텍스트 오버레이
    ctx.fillStyle = '#94a3b8';
    ctx.font = '9px monospace';
    ctx.fillText(t('hud.minimapGps'), 8, 14);
  }
}
