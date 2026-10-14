import { LOBBY_BGM_TRACKS, INGAME_BGM_TRACKS, BgmTrack } from '../data/audio.ts';
import { appDB } from '../storage/AppDatabase.ts';

/**
 * HTML5 오디오 스트리밍, 플레이리스트 순환, 크로스페이드 및 IndexedDB 캐싱 전담 BGM 플레이어
 */
export class BgmPlayer {
  private ctx: AudioContext | null = null;
  private bgmGain: GainNode | null = null;
  private bgmFadeGain: GainNode | null = null;
  private bgmAudio: HTMLAudioElement | null = null;
  private bgmSourceNode: MediaElementAudioSourceNode | null = null;

  public currentBgmTrack: BgmTrack | null = null;
  public currentScene: 'lobby' | 'ingame' | 'none' = 'none';
  private lobbyTrackIndex: number = 0;
  private inGameTrackIndex: number = 0;
  public pendingPlayScene: 'lobby' | 'ingame' | null = null;
  public onBgmChange?: (track: BgmTrack, scene: 'lobby' | 'ingame') => void;

  public init(ctx: AudioContext, bgmGain: GainNode): void {
    this.ctx = ctx;
    this.bgmGain = bgmGain;

    // BGM 페이드 전용 서브 게인 노드 (곡 전환 크로스페이드 및 덕킹 제어)
    this.bgmFadeGain = this.ctx.createGain();
    this.bgmFadeGain.gain.setValueAtTime(1.0, this.ctx.currentTime);
    this.bgmFadeGain.connect(this.bgmGain);

    this.initAudioElement();
  }

  private initAudioElement(): void {
    if (!this.ctx || !this.bgmFadeGain) return;

    try {
      if (!this.bgmAudio) {
        this.bgmAudio = new Audio();
        this.bgmAudio.loop = false; // 곡 종료 시 ended 이벤트로 다음 플레이리스트 곡 순환
        this.bgmAudio.preload = 'auto';

        this.bgmAudio.addEventListener('ended', () => {
          this.playNextTrack();
        });

        this.bgmSourceNode = this.ctx.createMediaElementSource(this.bgmAudio);
        this.bgmSourceNode.connect(this.bgmFadeGain);
      }
    } catch (e) {
      console.warn('[BgmPlayer] Failed to initialize media element source for BGM:', e);
    }
  }

  private resolveTrackUrl(folder: 'lobby' | 'ingame', fileName: string): string {
    const base = import.meta.env.BASE_URL || './';
    const cleanBase = base.endsWith('/') ? base : `${base}/`;
    return `${cleanBase}audio/bgm/${folder}/${fileName}`;
  }

  public playLobbyBgm(trackId?: string): void {
    const tracks = LOBBY_BGM_TRACKS;
    if (tracks.length === 0) return;

    if (this.currentScene === 'lobby' && this.bgmAudio && !this.bgmAudio.paused && !trackId) {
      return;
    }

    let selected: BgmTrack;
    if (trackId) {
      selected = tracks.find((t) => t.id === trackId) || tracks[0];
      this.lobbyTrackIndex = tracks.indexOf(selected);
    } else {
      selected = tracks[this.lobbyTrackIndex % tracks.length];
    }

    const url = this.resolveTrackUrl('lobby', selected.fileName);
    this.switchBgmWithFade(url, selected, 'lobby');
  }

  public playInGameBgm(trackId?: string): void {
    const tracks = INGAME_BGM_TRACKS;
    if (tracks.length === 0) return;

    if (this.currentScene === 'ingame' && this.bgmAudio && !this.bgmAudio.paused && !trackId) {
      return;
    }

    let selected: BgmTrack;
    if (trackId) {
      selected = tracks.find((t) => t.id === trackId) || tracks[0];
      this.inGameTrackIndex = tracks.indexOf(selected);
    } else {
      selected = tracks[this.inGameTrackIndex % tracks.length];
    }

    const url = this.resolveTrackUrl('ingame', selected.fileName);
    this.switchBgmWithFade(url, selected, 'ingame');
  }

  public playNextLobbyBgm(): void {
    if (LOBBY_BGM_TRACKS.length === 0) return;
    this.lobbyTrackIndex = (this.lobbyTrackIndex + 1) % LOBBY_BGM_TRACKS.length;
    const nextTrack = LOBBY_BGM_TRACKS[this.lobbyTrackIndex];
    this.playLobbyBgm(nextTrack.id);
  }

  public playNextInGameBgm(): void {
    if (INGAME_BGM_TRACKS.length === 0) return;
    this.inGameTrackIndex = (this.inGameTrackIndex + 1) % INGAME_BGM_TRACKS.length;
    const nextTrack = INGAME_BGM_TRACKS[this.inGameTrackIndex];
    this.playInGameBgm(nextTrack.id);
  }

  public playNextTrack(): void {
    if (this.currentScene === 'lobby') {
      this.playNextLobbyBgm();
    } else if (this.currentScene === 'ingame') {
      this.playNextInGameBgm();
    }
  }

  private switchBgmWithFade(url: string, track: BgmTrack, scene: 'lobby' | 'ingame'): void {
    if (!this.bgmAudio || !this.ctx || !this.bgmFadeGain) {
      this.playBgmFileDirect(url, track, scene);
      return;
    }

    const now = this.ctx.currentTime;
    const isPlaying = !this.bgmAudio.paused && this.bgmAudio.currentTime > 0;

    if (isPlaying) {
      // 0.4초 동안 부드럽게 페이드아웃 후 새 트랙 시작
      this.bgmFadeGain.gain.cancelScheduledValues(now);
      this.bgmFadeGain.gain.setValueAtTime(this.bgmFadeGain.gain.value, now);
      this.bgmFadeGain.gain.linearRampToValueAtTime(0.001, now + 0.38);

      setTimeout(() => {
        this.playBgmFileDirect(url, track, scene, true);
      }, 400);
    } else {
      this.playBgmFileDirect(url, track, scene, true);
    }
  }

  private async playBgmFileDirect(
    url: string,
    track: BgmTrack,
    scene: 'lobby' | 'ingame',
    fadeIn: boolean = false
  ): Promise<void> {
    if (!this.bgmAudio) return;

    this.currentBgmTrack = track;
    this.currentScene = scene;

    // 로컬 IndexedDB 캐시된 Blob이 있는지 우선 확인
    let localBlobUrl: string | null = null;
    try {
      localBlobUrl = await appDB.getAudioBlobUrl(url);
    } catch (e) {
      console.warn('[BgmPlayer] IndexedDB cache check failed, falling back to network:', e);
    }

    this.bgmAudio.src = localBlobUrl || url;

    if (this.ctx && this.bgmFadeGain && fadeIn) {
      const now = this.ctx.currentTime;
      this.bgmFadeGain.gain.cancelScheduledValues(now);
      this.bgmFadeGain.gain.setValueAtTime(0.001, now);
      this.bgmFadeGain.gain.linearRampToValueAtTime(1.0, now + 0.6);
    }

    const playPromise = this.bgmAudio.play();
    if (playPromise !== undefined) {
      playPromise.catch((err) => {
        this.pendingPlayScene = scene;
        console.warn('[BgmPlayer] Autoplay blocked, waiting for user gesture:', err);
      });
    }

    if (this.onBgmChange) {
      this.onBgmChange(track, scene);
    }

    // 캐시 저장
    if (!localBlobUrl) {
      fetch(url)
        .then((r) => r.blob())
        .then((blob) => appDB.saveAudio(url, blob, track.id, scene, track.title))
        .catch(() => {});
    }
  }

  public stop(): void {
    this.currentScene = 'none';
    if (this.bgmAudio) {
      this.bgmAudio.pause();
      this.bgmAudio.currentTime = 0;
    }
  }

  public pause(): void {
    if (this.bgmAudio && !this.bgmAudio.paused) {
      this.bgmAudio.pause();
    }
  }

  public resume(): void {
    if (this.bgmAudio && this.currentBgmTrack && this.bgmAudio.paused) {
      if (this.ctx && this.ctx.state === 'suspended') {
        this.ctx.resume().catch(() => {});
      }
      this.bgmAudio.play().catch(() => {});
    }
  }

  public duckBgm(duck: boolean, targetRatio: number = 0.25): void {
    if (!this.ctx || !this.bgmFadeGain) return;
    const now = this.ctx.currentTime;
    const target = duck ? targetRatio : 1.0;
    this.bgmFadeGain.gain.cancelScheduledValues(now);
    this.bgmFadeGain.gain.setValueAtTime(this.bgmFadeGain.gain.value, now);
    this.bgmFadeGain.gain.linearRampToValueAtTime(target, now + 0.2);
  }

  public handleUserGestureUnlock(): void {
    if (this.pendingPlayScene && this.bgmAudio) {
      const scene = this.pendingPlayScene;
      this.pendingPlayScene = null;
      if (scene === 'lobby') {
        this.playLobbyBgm();
      } else if (scene === 'ingame') {
        this.playInGameBgm();
      }
    }
  }
}
