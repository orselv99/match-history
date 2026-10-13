# [엔지니어링 리포트 & 실전 구현 가이드]
# Three.js 레이싱 전적 검색(Match History) & 3D 리플레이 서비스

> **프로젝트 핵심 정의**  
> Three.js 기반의 경량 레이싱 게임을 직접 플레이하여 실제 주행 데이터를 생산하고, **30Hz 주행 기록 직렬화/초압축 파이프라인**, **불변(Immutable) CDN 캐싱 스토리지**, 그리고 **Astro 페이지를 위한 초경량 Web Component 임베드 플레이어**를 완성하는 전적 검색 & 3D 리플레이 서비스 플랫폼 구축.

---

## 📚 기술 블로그 연재 아티클 구성 (최종)

| 회차 | 타이틀 | 핵심 엔지니어링 주제 |
| :---: | :--- | :--- |
| **Part 1** | **30Hz 주행 기록의 144Hz 부드러운 복원: 큐빅 스플라인과 쿼터니언 Slerp** | Catmull-Rom 스플라인 보간, 지터링(Jitter) 제거, 카메라 트래킹 |
| **Part 2** | **고주파 주행 데이터 직렬화: Int16 양자화와 Brotli를 통한 99% 압축** | TypedArray 패킹, 고정소수점 양자화 트레이드오프, Delta 인코딩 |
| **Part 3** | **전적 검색(OLTP)과 3D 리플레이(Blob)의 CQRS 분리 모델링** | PostgreSQL 메타데이터 인덱싱 vs 불변 바이너리 스토리지 분리 |
| **Part 4** | **불변(Immutable) 데이터의 CDN 캐싱 전략과 Egress $0 인프라** | `Cache-Control: immutable`, Cloudflare R2 vs Supabase 비교 및 엣지 서빙 |
| **Part 5** | **Astro 아일랜드 환경을 위한 Shadow DOM 기반 3D 웹 컴포넌트 SDK** | Web Component (<racing-replay-player>), 스타일 격리, CustomEvent 통신 |

---

## 1. 아키텍처 다이어그램 (E2E 파이프라인)

```
[ Three.js 레이싱 게임 클라이언트 (직접 플레이) ]
  ├── 차량 물리 시뮬레이션 (아케이드 키네마틱 / 레이캐스트)
  ├── 스타트/체크포인트/피니시 랩타임 판정
  └── 30Hz 주행 레코더 (Transform, Speed, Inputs)
           │
           ▼ 경기 완주 (Lap Complete)
┌─────────────────────────────────────────────────────────────┐
│ Client-side 리플레이 데이터 인코더 (@racing/replay-codec)   │
│  - Int16 양자화 (X, Y, Z cm 단위) & Uint16 각도 정규화       │
│  - Delta 인코딩 + Brotli 압축 (3분 경기 기준 ~30KB)        │
└──────────────┬──────────────────────────────┬───────────────┘
               │                              │
     (1) 전적 메타데이터 POST         (2) 압축 바이너리 Blob 업로드
               ▼                              ▼
┌─────────────────────────────┐   ┌─────────────────────────────┐
│ 전적 DB (PostgreSQL)        │   │ 오브젝트 스토리지 (R2/S3)   │
│ - user_id, track_id         │   │ - 불변(Immutable) 영구 저장 │
│ - 랩타임, 섹터 기록, 순위    │   │ - CDN 엣지 무제한 캐싱      │
└──────────────┬──────────────┘   └──────────────┬──────────────┘
               │                                 │
               └───────────────┬─────────────────┘
                               ▼
[ Astro 기반 외부 웹페이지 / 전적 대시보드 ]
  ├── 전적 요약 카드 (SSR / Astro Component)
  └── <racing-replay-player> (Client-side Web Component)
       - Three.js 경량 뷰어 (물리 엔진 배제, 순수 보간 렌더러)
       - 144Hz Catmull-Rom 스플라인 보간 & 타임라인 컨트롤러
```

---

## 2. 주행 리플레이 데이터 명세 (바이너리 패킷 레이아웃)

### 2.1 틱당 20바이트 고정 레코드 (Tick Record)
30Hz(33.3ms 주기)로 기록되는 차량 상태 레코드 구조:

```
Offset  Bytes  Field        Type      Scale / Range           설명
-----------------------------------------------------------------------------
0       2      timeOffset   Uint16    1 = 10ms (최대 655초)   직전 틱 대비 경과 시간
2       2      posX         Int16     1 = 1cm (±327.67m)      월드 좌표 X
4       2      posY         Int16     1 = 1cm (±327.67m)      월드 좌표 Y (높이)
6       2      posZ         Int16     1 = 1cm (±327.67m)      월드 좌표 Z
8       2      yaw          Uint16    0 ~ 65535 (0~360도)     차량 주행 방향각
10      2      pitchRoll    Int16     Packed (-90~90도 각 8b) 차체 기울기
12      2      speedKmh     Uint16    1 = 0.1 km/h (최대 655) 계기판 시속
14      1      steerAngle   Int8      -127 ~ 127              스티어링 조향각
15      1      throttle     Uint8     0 ~ 255                 가속 페달
16      1      brake        Uint8     0 ~ 255                 브레이크 페달
17      1      flags        Uint8     Bitmask                 드리프트/충돌/기어
18      2      reserved     -         -                       패딩/예비 바이트
-----------------------------------------------------------------------------
총 20 Bytes / Tick (3분 경기 = 5,400 Ticks = 약 108KB ➡️ Brotli 적용 시 ~30KB)
```

---

## 3. Three.js 게임 제작 핵심 구성

### 3.1 기술 스택
- **런타임**: Vanilla TypeScript + Three.js
- **빌드 도구**: Vite (빠른 HMR 및 초경량 번들링)
- **에셋 파이프라인**: 저용량 Low-poly 트랙 및 차량 모델

### 3.2 게임 클라이언트 핵심 모듈 구성
1. `InputManager`: 키보드(WASD / 화살표) 및 게임패드 입력 추상화
2. `Vehicle`:
   - 전진 가속, 브레이킹, 역방향(후진)
   - 조향에 따른 선회 반경 및 드리프트 슬립(Slip) 계수
   - 트랙 노면 접지 및 가드레일 충돌 반사
3. `CircuitTrack`:
   - 체크포인트 및 결승선(Start/Finish Line) 콜라이더
   - 현재 랩수, 실시간 랩타임, 섹터 시간 측정
4. `ReplayRecorder`:
   - 33.3ms(30Hz) 타이머마다 차량 상태를 추출하여 링 버퍼/배열에 푸시
   - 완주 시 `ReplayCodec.encode()` 호출하여 바이너리 생성

