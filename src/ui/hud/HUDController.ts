import { GameUIState } from '../../core/Game.ts';
import { SpeedometerWidget } from './SpeedometerWidget.ts';
import { StandingsTower } from './StandingsTower.ts';
import { LapTimerDisplay } from './LapTimerDisplay.ts';
import { InputOverlay } from './InputOverlay.ts';
import { SectorNotification } from './SectorNotification.ts';

/**
 * 인게임 헤드업 디스플레이(HUD) 갱신 및 애니메이션 전담 메인 오케스트레이터
 * - 위젯 단위(속도계, 순위 타워, 랩 타이머, 조작 오버레이, 섹터 알림)로 위임 제어
 */
export class HUDController {
  public readonly speedometer: SpeedometerWidget;
  public readonly standingsTower: StandingsTower;
  public readonly lapTimer: LapTimerDisplay;
  public readonly inputOverlay: InputOverlay;
  public readonly sectorNotification: SectorNotification;

  private cutsceneSkipPrompt: HTMLElement | null;
  private cinematicBars: HTMLElement | null;
  private countdownOverlay: HTMLElement | null;
  private countdownNumber: HTMLElement | null;

  constructor() {
    this.speedometer = new SpeedometerWidget();
    this.standingsTower = new StandingsTower();
    this.lapTimer = new LapTimerDisplay();
    this.inputOverlay = new InputOverlay();
    this.sectorNotification = new SectorNotification();

    this.cutsceneSkipPrompt = document.getElementById('cutscene-skip-prompt');
    this.cinematicBars = document.getElementById('cinematic-bars');
    this.countdownOverlay = document.getElementById('countdown-overlay');
    this.countdownNumber = document.getElementById('countdown-number');
  }

  public updateControlGuide(): void {
    this.inputOverlay.updateControlGuide();
  }

  public setCircuitTitle(title: string): void {
    this.lapTimer.setCircuitTitle(title);
  }

  public update(state: GameUIState): void {
    // 1. 상단 좌측 실시간 4인 순위 타워
    this.standingsTower.update(state.gameMode, state.standings);

    // 2. 우측 하단 속도계, 기어, RPM, 드리프트 스태미나
    this.speedometer.update(
      state.speedKmh,
      state.gear,
      state.rpmRatio,
      state.driftStamina,
      state.isDrifting,
      state.isSpinningOut
    );

    // 3. 우측 상단 랩 타이머
    this.lapTimer.update(
      state.currentLap,
      state.totalLaps,
      state.currentLapTimeStr,
      state.bestLapTimeStr
    );

    // 4. 좌측 하단 키 입력 오버레이
    this.inputOverlay.update(state.gameMode, state.inputState);

    // 5. 중앙 카운트다운 오버레이
    if (this.countdownOverlay && this.countdownNumber) {
      if (state.countdownVisible) {
        this.countdownOverlay.classList.add('visible');
        this.countdownNumber.textContent = state.countdownText || '';
        if (state.countdownText === 'GO!') {
          this.countdownNumber.classList.add('highlight');
        } else {
          this.countdownNumber.classList.remove('highlight');
        }
      } else {
        this.countdownOverlay.classList.remove('visible');
      }
    }

    // 6. 컷씬 스킵 프롬프트
    if (this.cutsceneSkipPrompt) {
      this.cutsceneSkipPrompt.classList.toggle('visible', state.raceState === 'START_CUTSCENE');
    }

    // 7. 컷씬 (시작 컷씬 및 도착 컷씬) 시네마틱 블랙 레터박스 연출
    if (this.cinematicBars) {
      const isCutscene = state.gameMode !== 'TITLE' &&
        (state.raceState === 'START_CUTSCENE' || state.raceState === 'FINISHED');
      this.cinematicBars.classList.toggle('active', isCutscene);
    }

    // 8. 로비 또는 준비 상태 진입 시 섹터 텍스트 초기화
    if (state.raceState === 'READY' || state.gameMode === 'TITLE') {
      this.resetSectorNotification();
    }
  }

  public showSectorNotification(driverName: string, sectorName: string, timeMs: number): void {
    this.sectorNotification.show(driverName, sectorName, timeMs);
  }

  public resetSectorNotification(): void {
    this.sectorNotification.reset();
  }
}
