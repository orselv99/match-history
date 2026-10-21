import type { TimeOfDay, WeatherType } from '../../../game/EnvironmentManager.ts';
import { t } from '../../../i18n/I18nManager.ts';

export interface EnvironmentStepCallbacks {
  onEnvironmentChange?: (timeOfDay: TimeOfDay, weather: WeatherType) => void;
}

/**
 * 게임 설정 위저드 Step 3: 시간대(Time of Day) 및 기상(Weather) 선택 전담 스텝
 */
export class EnvironmentStep {
  private envTimeChips: NodeListOf<HTMLElement>;
  private envWeatherChips: NodeListOf<HTMLElement>;
  private envSummaryText: HTMLElement | null;

  private selectedTimeOfDay: TimeOfDay = 'noon';
  private selectedWeather: WeatherType = 'clear';
  private callbacks: EnvironmentStepCallbacks;

  constructor(callbacks: EnvironmentStepCallbacks = {}) {
    this.callbacks = callbacks;
    this.envTimeChips = document.querySelectorAll<HTMLElement>('.env-chip-btn[data-time]');
    this.envWeatherChips = document.querySelectorAll<HTMLElement>('.env-chip-btn[data-weather]');
    this.envSummaryText = document.getElementById('env-summary-text');

    this.bindEvents();
  }

  private bindEvents(): void {
    this.envTimeChips.forEach(chip => {
      chip.addEventListener('click', () => {
        this.setTimeOfDay((chip.dataset.time as TimeOfDay) || 'noon');
      });
    });

    this.envWeatherChips.forEach(chip => {
      chip.addEventListener('click', () => {
        this.setWeather((chip.dataset.weather as WeatherType) || 'clear');
      });
    });
  }

  public getTimeOfDay(): TimeOfDay {
    return this.selectedTimeOfDay;
  }

  public getWeather(): WeatherType {
    return this.selectedWeather;
  }

  public setTimeOfDay(time: TimeOfDay): void {
    this.selectedTimeOfDay = time;
    this.updateShowcase();
    this.callbacks.onEnvironmentChange?.(this.selectedTimeOfDay, this.selectedWeather);
  }

  public setWeather(weather: WeatherType): void {
    this.selectedWeather = weather;
    this.updateShowcase();
    this.callbacks.onEnvironmentChange?.(this.selectedTimeOfDay, this.selectedWeather);
  }

  public updateShowcase(): void {
    this.envTimeChips.forEach(c => {
      c.classList.toggle('active', c.dataset.time === this.selectedTimeOfDay);
    });
    this.envWeatherChips.forEach(c => {
      c.classList.toggle('active', c.dataset.weather === this.selectedWeather);
    });

    if (this.envSummaryText) {
      this.envSummaryText.textContent = this.getSummaryText();
    }
  }

  public getSummaryText(): string {
    const timeKey = `wizard.${this.selectedTimeOfDay}`;
    const weatherKey = `wizard.${this.selectedWeather === 'wind_fog' ? 'windFog' : this.selectedWeather}`;
    return `${t(timeKey)} + ${t(weatherKey)}`;
  }

  public reset(): void {
    this.selectedTimeOfDay = 'noon';
    this.selectedWeather = 'clear';
    this.updateShowcase();
    this.callbacks.onEnvironmentChange?.(this.selectedTimeOfDay, this.selectedWeather);
  }
}
