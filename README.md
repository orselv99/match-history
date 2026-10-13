# Project Directory Structure

```
match-history/
├── .github/
│   └── workflows/
│       └── deploy.yml              # GitHub Pages CI/CD 배포 워크플로우
├── cloudflare-worker/              # Cloudflare Worker 백엔드 API (D1 & R2)
│   ├── src/
│   │   └── index.ts                # Worker API 라우트 (리더보드, 전적 업로드/조회)
│   ├── package.json
│   ├── tsconfig.json
│   └── wrangler.toml               # Cloudflare Worker 설정 (D1 & R2 바인딩)
├── database/                       # 데이터베이스 SQL 스크립트
│   ├── queries.sql                 # 전적 조회 및 리더보드 쿼리
│   └── schema.sql                  # D1 SQLite 테이블 스키마
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
│   │   ├── Game.ts                 # 메인 게임 루프, 씬, 조명, 환경 및 일시정지 제어
│   │   └── InputManager.ts         # 키보드 입력 및 스티어링 제어
│   ├── data/                       # 모듈화된 게임 정적 데이터
│   │   ├── audio.ts                # BGM 트랙 목록 및 오디오 메타데이터 상수
│   │   ├── gameConstants.ts        # 랜덤 드라이버명, 환경 라벨, 로딩 팁 문구
│   │   ├── tracks.ts               # 서킷별 제어점(Catmull-Rom), 폭, 메타데이터
│   │   └── vehicles.ts             # 차량 모델 스펙(가속/최고속/에어로) 및 AI 머신 설정
│   ├── game/                       # 인게임 엔티티 및 게임플레이 로직
│   │   ├── AICarManager.ts         # 자율주행 AI 차량 에이전트 및 경로 추종
│   │   ├── CircuitTrack.ts         # 동적 서킷 트랙 지오메트리, 연석, 그리드 및 체크포인트
│   │   ├── CollisionManager.ts     # 차량 간 탄성 물리 충돌, 반발 임펄스, 카메라 쉐이크 및 스파크
│   │   ├── HoneycombPicker.ts      # 127셀 헥사곤 허니콤 컬러 팔레트 컴포넌트
│   │   ├── LapTimer.ts             # 랩 타임 및 섹터 기록 측정기
│   │   ├── LoadingScreen.ts        # 초기화 및 인게임전 겸용 로딩 씬 제어기
│   │   ├── SkidMarkManager.ts      # 실시간 드리프트 타이어 스키드마크 쿼드 및 타이어 연기
│   │   ├── Vehicle.ts              # 레이싱 머신 3D 메시, 물리, 헤드라이트/조명 및 리버리 컬러
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
│   │   ├── title.css               # 타이틀 씬 및 메인 메뉴 스크림
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
