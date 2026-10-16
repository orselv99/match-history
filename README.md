# Project Directory Structure

```
match-history/
├── .github/
│   └── workflows/
│       └── deploy.yml              # GitHub Pages CI/CD 배포 워크플로우
├── cloudflare-worker/              # Cloudflare Worker 백엔드 API (D1 & R2)
│   ├── src/
│   │   └── index.ts                # Worker API 라우트 (리더보드, 전적 업로드/조회, OpenAPI)
│   ├── package.json
│   ├── tsconfig.json
│   └── wrangler.toml               # Cloudflare Worker 설정 (D1 & R2 바인딩)
├── database/                       # 데이터베이스 SQL 스크립트
│   ├── queries.sql                 # 전적 조회 및 리더보드 쿼리 (circuits, matches)
│   └── schema.sql                  # D1 SQLite 테이블 스키마 (circuits, users, matches, match_laps)
├── public/                         # 정적 오디오 에셋 (Vite 배포 에셋)
│   └── audio/                      # 사운드 에셋
│       ├── bgm/                    # 레이싱 BGM 트랙 (.ogg)
│       └── sfx/                    # 게임 효과음 디렉토리 및 가이드
│           ├── crash/              # 충돌 및 파쇄음
│           ├── env/                # 날씨/환경 앰비언스
│           ├── race/               # 카운트다운/체크포인트/피니시
│           ├── ui/                 # UI 인터랙션 사운드
│           └── vehicle/            # 엔진음/스키드마크
├── src/                            # Three.js 3D 레이싱 웹 애플리케이션 프론트엔드
│   ├── core/                       # 코어 엔진 시스템
│   │   ├── AudioManager.ts         # Web Audio API 기반 절차적 사운드 생성기
│   │   ├── CameraController.ts     # 다이내믹 체이스 카메라, 충돌 쉐이크, 완주 컷씬
│   │   ├── Game.ts                 # 메인 게임 루프, 씬, 조명, 환경 및 일시정지 제어
│   │   ├── InputManager.ts         # 키보드 입력 및 스티어링 제어
│   │   ├── MirrorRenderer.ts       # 좌/우 사이드 미러 Scissor 렌더러 및 후방 추격 차량 감지
│   │   ├── SpeedFX.ts              # 고속 방사형 줌 블러 및 포스트 프로세싱
│   │   └── StartCutsceneController.ts # 피트 출차 롤아웃 키네마틱스 컷씬 제어기
│   ├── data/                       # 모듈화된 게임 정적 데이터
│   │   ├── audio.ts                # BGM 트랙 목록 및 오디오 메타데이터 상수
│   │   ├── circuits.ts             # 3대 글로벌 공식 서킷 제어점(Catmull-Rom), 폭, 메타데이터
│   │   ├── gameConstants.ts        # 랜덤 드라이버명, 환경 라벨, 로딩 팁 문구
│   │   └── vehicles.ts             # 차량 모델 스펙(가속/최고속/에어로) 및 라이벌 머신 설정
│   ├── game/                       # 인게임 엔티티 및 게임플레이 물리/시뮬레이션 로직
│   │   ├── Circuit.ts              # 3D 튜브 리본 서킷 지오메트리, 고저차, 교량, 연석, 그리드 및 체크포인트
│   │   ├── CircuitDecorations.ts   # 그랜드스탠드, 방호벽, 관중석, 라이트 타워 절차적 장식물
│   │   ├── CollisionManager.ts     # 차량 간 탄성 물리 충돌, 반발 임펄스, 카메라 쉐이크 및 스파크
│   │   ├── EnvironmentManager.ts   # 시간대 및 날씨별 태양/안개/비/앰비언스 환경 시뮬레이션
│   │   ├── LapTimer.ts             # 랩 타임 및 섹터 기록 측정기
│   │   ├── MinimapRenderer.ts      # 2D 캔버스 실시간 미니맵 및 레이더 렌더러
│   │   ├── OpponentManager.ts      # 상대 레이서(Opponent) 차량 에이전트 및 경로 추종
│   │   ├── SkidMarkManager.ts      # 실시간 드리프트 타이어 스키드마크 쿼드 및 타이어 연기
│   │   ├── Vehicle.ts              # 레이싱 머신 3D 메시, 물리, 헤드라이트/조명 및 리버리 컬러
│   │   └── vehicleModels/          # 세부 차량 모델 지오메트리 빌더
│   ├── i18n/                       # 다국어(i18n) 시스템
│   │   ├── index.ts                # 언어 상태 관리 및 리스너 배선
│   │   └── locales/                # 한국어(ko) / 영어(en) 번역 사전
│   ├── storage/                    # 브라우저 영구 데이터베이스 (IndexedDB)
│   │   ├── AppDatabase.ts          # BGM 오디오 바이너리 캐시 및 매치 리플레이 로컬 저장소
│   │   └── schema.ts               # IndexedDB 데이터베이스 스키마 및 마이그레이션 핸들러
│   ├── ui/                         # DOM UI 컴포넌트, 모달 및 프리뷰 제어기
│   │   ├── BaseModal.ts            # 공통 모달 베이스 추상 클래스
│   │   ├── CircuitPreview.ts       # 게임 설정 Step 1용 2D SVG 서킷 맵 & 스펙 쇼케이스
│   │   ├── FinishModal.ts          # 레이스 완주 및 결과 요약 모달
│   │   ├── GameSetupWizard.ts      # 4단계 레이스 세팅 위저드 모달 (서킷/머신/환경/모드)
│   │   ├── HoneycombPicker.ts      # 127셀 헥사곤 허니콤 컬러 팔레트 컴포넌트
│   │   ├── HUDController.ts        # 속도계, 기어, 랩 타임 HUD 컨트롤러
│   │   ├── LoadingScreen.ts        # 초기화 및 인게임전 겸용 로딩 씬 제어기
│   │   ├── MatchHistoryModal.ts    # 전적 검색 및 리더보드 모달
│   │   ├── ModalManager.ts         # 모달 상태 관리 및 오케스트레이션
│   │   ├── PauseModal.ts           # 인게임 일시정지 메뉴 모달
│   │   ├── ReplayBarController.ts  # 리플레이 하단 재생바 컨트롤러
│   │   ├── SettingsModal.ts        # 그래픽/오디오/조작 환경설정 모달
│   │   └── VehiclePreview.ts       # 게임 설정 Step 2용 독립 3D 턴테이블 뷰어
│   ├── replay/                     # 30Hz 틱 레코딩 및 압축 코덱
│   │   ├── ReplayCodec.ts          # 양자화 및 Gzip/Deflate 압축 코덱
│   │   ├── ReplayPlayer.ts         # 고스트 차량 리플레이 플레이어
│   │   ├── ReplayRecorder.ts       # 30Hz 레이스 주행 데이터 레코더
│   │   └── ReplayTypes.ts          # 리플레이 데이터 타입 정의
│   ├── styles/                     # 모듈화된 CSS 스타일시트
│   │   ├── base.css                # 기본 레이아웃, 모달 카드 규격, 공통 버튼
│   │   ├── history.css             # 전적 검색 및 글로벌 리더보드 모달
│   │   ├── honeycomb-picker.css    # 허니콤 헥사곤 컬러 팔레트 스타일
│   │   ├── hud.css                 # HUD 계기판, 속도계, 미니맵, 카운트다운
│   │   ├── loading.css             # 로딩 씬 오버레이, 프로그레스바, 스크린샷 배경
│   │   ├── pause.css               # 인게임 일시정지 (Pause) 메뉴
│   │   ├── replay.css              # 완주 통계 모달 및 벤치마크 테이블
│   │   ├── settings.css            # 환경설정 (오디오/조작) 모달
│   │   ├── lobby.css               # 로비 씬 및 메인 메뉴 스크림
│   │   ├── variables.css           # 디자인 토큰, 테마 변수, 커스텀 스크롤바
│   │   └── wizard.css              # 4단계 게임 설정 위저드 모달
│   ├── main.ts                     # 애플리케이션 진입점 및 UI 이벤트 오케스트레이션
│   └── styles.css                  # 모듈별 스타일시트 매니페스트 (@import)
├── terraform/                      # 인프라 코드 (IaC - Cloudflare D1/R2)
│   ├── main.tf                     # Cloudflare D1, R2, Worker 리소스 정의
│   ├── outputs.tf                  # 리소스 출력값 정의
│   ├── terraform.tfvars            # 테라폼 변수 입력값
│   ├── terraform.tfvars.example    # 테라폼 변수 예시 템플릿
│   ├── variables.tf                # 입력 변수 선언
│   └── versions.tf                 # 공급자 버전 명시
├── .gitignore
├── DESIGN.md                       # UI/UX 및 디자인 시스템 가이드 문서
├── index.html                      # 메인 싱글 페이지 HTML 템플릿
├── package.json                    # 프로젝트 메타데이터 및 종속성
├── package-lock.json
├── RACING_GAME_SERVICE_ARCHITECTURE_PLAN.md # 아키텍처 및 서비스 플랜 문서
├── tsconfig.json                   # TypeScript 컴파일러 설정
└── vite.config.ts                  # Vite 빌드 도구 설정
```
