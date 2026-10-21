# Project Directory Structure

```
artifacts_0/
├── .github/
│   └── workflows/
│       └── deploy.yml              # GitHub Pages CI/CD 배포 워크플로우
├── public/                         # 정적 배포 에셋 (Vite 배포 에셋)
│   ├── audio/                      # 사운드 에셋
│   │   └── bgm/                    # 레이싱 BGM 트랙 (.ogg)
│   │       ├── ingame/             # 인게임 고속 레이싱 트랙 6종
│   │       └── lobby/              # 로비/메뉴 라운지 BGM 트랙 2종
│   └── data/
│       └── seed-replays.json       # 200경기 풀 틱 시드 리플레이 더미 데이터
├── scripts/                        # 빌드/데이터 생성 자동화 스크립트
│   └── generateSeedReplays.ts      # 200경기 물리 시뮬레이션 기반 시드 리플레이 생성기
├── src/                            # Three.js 3D 레이싱 웹 애플리케이션 프론트엔드
│   ├── audio/                      # 오디오 재생 및 효과음 서브시스템
│   │   ├── BgmPlayer.ts            # 인게임/로비 BGM 재생, 크로스페이드 및 볼륨 제어기
│   │   └── SoundEffects.ts         # 충돌, 카운트다운, 스키드 등 인게임 효과음 제어기
│   ├── core/                       # 코어 엔진 시스템
│   │   ├── AudioManager.ts         # Web Audio API 기반 오디오 버퍼 및 마스터 오디오 매니저
│   │   ├── CameraController.ts     # 다이내믹 체이스 카메라, 충돌 쉐이크, 완주 컷씬
│   │   ├── Game.ts                 # 메인 게임 루프, 씬, 조명, 환경 및 일시정지 오케스트레이션
│   │   ├── GraphicsSettingsManager.ts # 안티에일리어싱, 그림자, 블룸 등 그래픽 옵션 관리자
│   │   ├── InputManager.ts         # 키보드 입력 및 스티어링/가속/브레이크 제어
│   │   ├── KeyBindingManager.ts    # 사용자 정의 키 매핑 및 바인딩 관리자
│   │   ├── MirrorRenderer.ts       # 좌/우 사이드 미러 Scissor 렌더러 및 후방 추격 차량 감지
│   │   ├── StandingsManager.ts     # 실시간 순위 산출, 2m 히스테리시스, 홀드 및 버블 정렬
│   │   └── StartCutsceneController.ts # 피트 출차 롤아웃 키네마틱스 컷씬 제어기
│   ├── data/                       # 모듈화된 게임 정적 데이터
│   │   ├── audio.ts                # BGM 트랙 목록 및 오디오 메타데이터 상수
│   │   ├── circuits.ts             # 서킷 지오메트리 제어점(Catmull-Rom), 출발 그리드 슬롯 및 사양
│   │   ├── gameConstants.ts        # 랜덤 드라이버명, 환경 라벨, 로딩 팁 문구
│   │   └── vehicles.ts             # 차량 모델 스펙(가속/최고속/에어로) 및 라이벌 머신 설정
│   ├── game/                       # 인게임 엔티티 및 게임플레이 물리/시뮬레이션 로직
│   │   ├── Circuit.ts              # 3D 리본 서킷 지오메트리, 고저차, 교량, 연석, 그리드 및 체크포인트
│   │   ├── CircuitDecorations.ts   # 그랜드스탠드, 방호벽, 관중석, 라이트 타워 절차적 장식물
│   │   ├── CollisionManager.ts     # 차량 간 탄성 물리 충돌, 반발 임펄스, 카메라 쉐이크 및 스파크
│   │   ├── EnvironmentManager.ts   # 시간대 및 날씨별 태양/안개/비/앰비언스 환경 시뮬레이션
│   │   ├── LapTimer.ts             # 랩 타임 및 섹터 기록 측정기
│   │   ├── MinimapRenderer.ts      # 2D 캔버스 실시간 미니맵 및 레이더 렌더러
│   │   ├── OpponentManager.ts      # 상대 레이서(Opponent) 차량 관리 및 순위/그리드 오케스트레이션
│   │   ├── SkidMarkManager.ts      # 실시간 드리프트 타이어 스키드마크 쿼드 및 타이어 연기
│   │   ├── SpeedFX.ts              # 고속 방사형 줌 블러 및 포스트 프로세싱
│   │   ├── Vehicle.ts              # 레이싱 머신 3D 메시, 물리, 헤드라이트/조명 및 리버리 컬러
│   │   ├── circuitStructures/      # 서킷 입체 구조물 빌더 모듈
│   │   │   ├── ArchGateBuilder.ts      # 서킷 중간 스폰서 아치 게이트 빌더
│   │   │   ├── ControlTowerBuilder.ts  # 관제탑/피트 타워 빌더
│   │   │   ├── GrandstandBuilder.ts    # 대형 메인 스탠드 및 관람석 빌더
│   │   │   ├── OverpassBridgeBuilder.ts # 서킷 교차 오버패스 입체 교량 빌더
│   │   │   ├── PitComplexBuilder.ts    # 피트 빌딩 및 정비 구역 복합 빌더
│   │   │   ├── StartGantryBuilder.ts   # 스타트/피니시 갠트리 및 3구 라이트 빌더
│   │   │   ├── types.ts                # 구조물 빌더 공통 인터페이스 및 타입
│   │   │   └── index.ts                # 서킷 구조물 배럴 내보내기
│   │   ├── environment/            # 날씨 및 환경 프리셋 모듈
│   │   │   ├── EnvironmentPresets.ts   # 맑음, 석양, 야간, 비 프리셋 조명/안개 정의
│   │   │   └── WeatherParticles.ts     # 비/물보라 파티클 시스템
│   │   ├── opponent/               # 상대 차량 AI 시뮬레이션
│   │   │   └── OpponentSimulation.ts   # 슬립스트림/어택/러버밴딩 AI 및 제로GC 비주얼 갱신
│   │   └── vehicleModels/          # 세부 차량 모델 지오메트리 빌더
│   │       ├── CyberSpeedsterMesh.ts   # 사이버 스피드스터 3D 메시 빌더
│   │       ├── FormulaAeroMesh.ts      # 포뮬러 에어로 3D 메시 빌더
│   │       ├── GTTurboMesh.ts          # GT 터보 3D 메시 빌더
│   │       ├── LmHypercarMesh.ts       # LM 하이퍼카 3D 메시 빌더
│   │       ├── VehicleVisualsBuilder.ts # 차량 바디, 섀시, 휠, 스포일러 조합 빌더
│   │       ├── types.ts                # 차량 파츠 및 재질 타입 정의
│   │       └── index.ts                # 차량 모델 배럴 내보내기
│   ├── i18n/                       # 다국어(i18n) 시스템
│   │   ├── I18nManager.ts          # 다국어 상태 관리 및 언어 전환 이벤트 매니저
│   │   └── locales/                # 한국어(ko) / 영어(en) 번역 사전
│   │       ├── en.ts               # 영어 번역 딕셔너리
│   │       └── ko.ts               # 한국어 번역 딕셔너리
│   ├── replay/                     # 30Hz 틱 레코딩 및 압축 코덱
│   │   ├── ReplayCodec.ts          # 양자화 및 Gzip/Deflate 압축 코덱
│   │   ├── ReplayPlayer.ts         # 고스트 차량 리플레이 플레이어
│   │   ├── ReplayRecorder.ts       # 30Hz 레이스 주행 데이터 레코더
│   │   └── ReplayTypes.ts          # 리플레이 데이터 타입 정의
│   ├── storage/                    # 브라우저 영구 데이터베이스 (IndexedDB)
│   │   ├── AppDatabase.ts          # BGM 오디오 바이너리 캐시 및 매치 리플레이 로컬 저장소
│   │   ├── ReplaySeedService.ts    # 200경기 시드 리플레이 데이터베이스 초기화 및 주입기
│   │   └── schema.ts               # IndexedDB 데이터베이스 스키마 및 마이그레이션 핸들러
│   ├── styles/                     # 모듈화된 CSS 스타일시트
│   │   ├── base.css                # 기본 레이아웃, 모달 카드 규격, 공통 버튼
│   │   ├── history.css             # 전적 검색 및 글로벌 리더보드 모달 스타일
│   │   ├── honeycomb-picker.css    # 허니콤 헥사곤 컬러 팔레트 스타일
│   │   ├── hud.css                 # HUD 계기판, 속도계, 미니맵, 카운트다운
│   │   ├── loading.css             # 로딩 씬 오버레이, 프로그레스바, 스크린샷 배경
│   │   ├── lobby.css               # 로비 씬 및 메인 메뉴 스크림
│   │   ├── pause.css               # 인게임 일시정지 (Pause) 메뉴
│   │   ├── replay.css              # 완주 통계 모달 및 벤치마크 테이블
│   │   ├── settings.css            # 환경설정 (그래픽/오디오/조작) 모달
│   │   ├── variables.css           # 디자인 토큰, 테마 변수, 커스텀 스크롤바
│   │   └── wizard.css              # 4단계 게임 설정 위저드 모달
│   ├── types/                      # 공통 TypeScript 타입 정의
│   │   └── game.ts                 # 레이스 상태, 게임 모드, 키 입력, 순위표 타입 정의
│   ├── ui/                         # DOM UI 컴포넌트, 모달 및 프리뷰 제어기
│   │   ├── gamesetup/              # 4단계 게임 세팅 위저드 및 프리뷰 서브시스템
│   │   │   ├── steps/              # 위저드 단계별 전담 스텝 모듈
│   │   │   │   ├── BriefingStep.ts     # Step 4: 드라이버 프로필 및 최종 레이스 브리핑 스텝
│   │   │   │   ├── CircuitStep.ts      # Step 1: 서킷 선택 및 2D 트랙 프리뷰 스텝
│   │   │   │   ├── EnvironmentStep.ts  # Step 3: 시간대 및 날씨 환경 선택 스텝
│   │   │   │   └── VehicleStep.ts      # Step 2: 머신 모델, 스펙 쇼케이스 및 컬러 팔레트 스텝
│   │   │   ├── CircuitPreview.ts   # 게임 설정 Step 1용 2D SVG 서킷 맵 & 스펙 쇼케이스
│   │   │   ├── GameSetupWizard.ts  # 4단계 레이스 세팅 위저드 모달 오케스트레이터
│   │   │   ├── HoneycombPicker.ts  # 127셀 헥사곤 허니콤 컬러 팔레트 컴포넌트
│   │   │   └── VehiclePreview.ts   # 게임 설정 Step 2용 독립 3D 턴테이블 뷰어
│   │   ├── history/                # 전적 검색 및 리더보드 서브시스템
│   │   │   ├── HistoryStatsSummary.ts # 상단 3대 KPI 통계 요약 카드 (총 경기, 최고 랩타임, 최고속)
│   │   │   ├── MatchHistoryInspector.ts # 인스펙터 풀-커버 팝업 및 상세 섹터/텔레메트리 뷰어
│   │   │   ├── MatchHistoryModal.ts # 전적 검색 및 리더보드 메인 오케스트레이터
│   │   │   ├── MatchHistoryTable.ts # 전적 검색 테이블 및 페이지네이션 제어기
│   │   │   ├── MinimapReplayPlayer.ts # 2D 캔버스 트랙 미니맵 리플레이 플레이어
│   │   │   └── index.ts            # 전적 검색 서브시스템 배럴 내보내기
│   │   ├── hud/                    # 인게임 HUD 위젯 서브시스템
│   │   │   ├── HUDController.ts    # 속도계, 실시간 순위표, 랩 타이머, 조작 오버레이 메인 오케스트레이터
│   │   │   ├── InputOverlay.ts     # 조작 가이드 키 뱃지 및 실시간 키 입력 오버레이
│   │   │   ├── LapTimerDisplay.ts  # 서킷 명칭, 랩 카운터 및 랩 타임(현재/최고) 표시
│   │   │   ├── LiveLeaderboard.ts  # 상단 좌측 4인 실시간 순위표 및 추월 애니메이션
│   │   │   ├── SectorNotification.ts # 섹터/도착선 통과 순차 알림 텍스트 컴포넌트
│   │   │   ├── SpeedometerWidget.ts # 속도계, 기어 단수, RPM 타코미터, 드리프트 스태미나 바
│   │   │   └── index.ts            # HUD 서브시스템 배럴 내보내기
│   │   ├── settings/               # 환경 설정 서브시스템
│   │   │   ├── GeneralSettingsTab.ts # 언어 선택, BGM 및 경기 리플레이 캐시 분리 관리 탭
│   │   │   ├── AudioSettingsTab.ts # 볼륨, 음소거, 사운드 제어 전담 탭
│   │   │   ├── ControlsSettingsTab.ts # 조작 설정 아코디언(키보드 & 게임패드), 감도, 카메라 뷰 전담 탭
│   │   │   ├── GraphicsSettingsTab.ts # GPU 감지, 프리셋(HIGH/MED/LOW), 그래픽 옵션 전담 탭
│   │   │   ├── SettingsModal.ts    # 환경 설정 모달 메인 오케스트레이터
│   │   │   └── index.ts            # 환경 설정 서브시스템 배럴 내보내기
│   │   ├── BaseModal.ts            # 공통 모달 베이스 추상 클래스
│   │   ├── FinishModal.ts          # 레이스 완주 및 결과 요약 모달
│   │   ├── LoadingScreen.ts        # 초기화 및 인게임전 겸용 로딩 씬 제어기
│   │   ├── ModalManager.ts         # 모달 상태 관리 및 오케스트레이션
│   │   ├── PauseModal.ts           # 인게임 일시정지 메뉴 모달
│   │   ├── ReplayBarController.ts  # 리플레이 하단 재생바 컨트롤러
│   │   └── Toast.ts                # 알림 토스트 팝업 컴포넌트
│   ├── main.ts                     # 애플리케이션 진입점 및 UI 이벤트 오케스트레이션
│   ├── styles.css                  # 모듈별 스타일시트 매니페스트 (@import)
│   └── vite-env.d.ts               # Vite 환경 클라이언트 타입 선언
├── .gitignore                      # Git 추적 제외 파일 목록
├── AGENTS.md                       # 에이전트 작업 지침 및 코드베이스 가이드
├── DESIGN.md                       # UI/UX 및 디자인 시스템 가이드 문서
├── index.html                      # 메인 싱글 페이지 HTML 템플릿
├── package.json                    # 프로젝트 메타데이터 및 종속성
├── package-lock.json               # 종속성 잠금 파일
├── RACING_GAME_SERVICE_ARCHITECTURE_PLAN.md # 아키텍처 및 서비스 플랜 문서
├── tsconfig.json                   # TypeScript 컴파일러 설정
└── vite.config.ts                  # Vite 빌드 도구 설정
```
