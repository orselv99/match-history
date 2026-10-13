-- =====================================================================
-- Apex Racing Telemetry - CQRS 전적 검색 OLTP 데이터베이스 스키마
-- PostgreSQL 14+ 호환
-- =====================================================================

-- 1. 마스터 테이블: 서킷 정보
CREATE TABLE IF NOT EXISTS tracks (
    track_id VARCHAR(32) PRIMARY KEY,
    track_name VARCHAR(64) NOT NULL,
    length_meters NUMERIC(8, 2) NOT NULL,
    sector_count SMALLINT NOT NULL DEFAULT 3,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 초기 트랙 마스터 시드 데이터
INSERT INTO tracks (track_id, track_name, length_meters, sector_count)
VALUES ('circuit_monaco', 'Apex Monaco Technical Circuit', 750.00, 3)
ON CONFLICT (track_id) DO NOTHING;

-- 2. 마스터 테이블: 레이서 유저 정보
CREATE TABLE IF NOT EXISTS users (
    user_id VARCHAR(64) PRIMARY KEY,
    nickname VARCHAR(32) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_active_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. 핵심 CQRS 테이블: 경기 완주 요약 메타데이터 (Matches)
-- * 주의: 고주파 틱 데이터(Tick Stream)는 DB에 적재하지 않고 Cloudflare R2에 .bin으로 불변 저장
-- * DB에는 전적 검색, 랭킹 산출, 통계 집계를 위한 집계 메타데이터만 1회 INSERT
CREATE TABLE IF NOT EXISTS matches (
    match_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    match_code VARCHAR(32) NOT NULL UNIQUE,       -- 예: M_20261013_A8F2 (클라이언트 생성 식별자)
    user_id VARCHAR(64) NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    track_id VARCHAR(32) NOT NULL REFERENCES tracks(track_id) ON DELETE RESTRICT,
    vehicle_id VARCHAR(32) NOT NULL,              -- e.g. apex_gt_red, ai_car_sky
    
    -- 레이스 핵심 성적 지표 (밀리초 단위 고정)
    total_laps SMALLINT NOT NULL,
    total_time_ms INTEGER NOT NULL CHECK (total_time_ms > 0),
    best_lap_ms INTEGER NOT NULL CHECK (best_lap_ms > 0),
    top_speed_kmh NUMERIC(5, 1) NOT NULL,
    avg_speed_kmh NUMERIC(5, 1) NOT NULL,
    
    -- 유효성 검증 (오프로드 치팅/트랙 이탈 여부)
    is_valid BOOLEAN NOT NULL DEFAULT TRUE,
    
    -- Cloudflare R2 오브젝트 스토리지 매핑 (불변 3D 리플레이 바이너리 링크)
    replay_r2_key VARCHAR(128) NOT NULL,          -- 예: matches/M_20261013_A8F2.bin
    raw_json_bytes INTEGER NOT NULL,              -- 압축 전 순수 JSON 바이트
    compressed_bytes INTEGER NOT NULL,            -- R2에 적재된 Int16 패킹 압축 바이너리 바이트
    compression_ratio NUMERIC(5, 2) NOT NULL,     -- 절감률 (예: 98.45)
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. 랩별 상세 타임 및 섹터 분할 테이블 (Laps)
CREATE TABLE IF NOT EXISTS match_laps (
    match_id UUID NOT NULL REFERENCES matches(match_id) ON DELETE CASCADE,
    lap_number SMALLINT NOT NULL,
    lap_time_ms INTEGER NOT NULL CHECK (lap_time_ms > 0),
    sector_1_ms INTEGER NOT NULL CHECK (sector_1_ms > 0),
    sector_2_ms INTEGER NOT NULL CHECK (sector_2_ms > 0),
    sector_3_ms INTEGER NOT NULL CHECK (sector_3_ms > 0),
    is_best_lap BOOLEAN NOT NULL DEFAULT FALSE,
    
    PRIMARY KEY (match_id, lap_number)
);

-- =====================================================================
-- 고성능 인덱스 설계 (High Performance Indexing Strategy)
-- =====================================================================

-- 1) 리더보드 최적화: 트랙별 최속 랩타임 순위 조회 (Partial Index + Index Only Scan)
-- 유효한 경기(is_valid = true)만 인덱싱하여 불필요한 인덱스 크기를 최소화
CREATE INDEX IF NOT EXISTS idx_matches_leaderboard 
ON matches (track_id, best_lap_ms ASC, created_at ASC) 
WHERE is_valid = TRUE;

-- 2) 유저 프로필/전적 이력 최적화: 특정 유저의 최근 경기 히스토리 조회
CREATE INDEX IF NOT EXISTS idx_matches_user_history 
ON matches (user_id, created_at DESC);

-- 3) 고속 단건 조회: match_code 기반 R2 키 및 메타데이터 룩업
CREATE INDEX IF NOT EXISTS idx_matches_match_code 
ON matches (match_code);

-- 4) 랩별 섹터 분석: 트랙 전체 섹터별 최단 기록(Theoretical Best) 추출용
CREATE INDEX IF NOT EXISTS idx_match_laps_sectors 
ON match_laps (sector_1_ms, sector_2_ms, sector_3_ms);

-- 5) 시계열 대용량 아카이빙 대비: created_at 기준 BRIN (Block Range Index)
CREATE INDEX IF NOT EXISTS idx_matches_created_brin 
ON matches USING BRIN (created_at);
