-- =====================================================================
-- Cloudflare D1 (SQLite) 전적 검색 OLTP 스키마
-- Match History & Leaderboard Database
-- =====================================================================

-- 1. 서킷 마스터 테이블
CREATE TABLE IF NOT EXISTS circuits (
    circuit_id TEXT PRIMARY KEY,
    circuit_name TEXT NOT NULL,
    length_meters REAL NOT NULL,
    sector_count INTEGER NOT NULL DEFAULT 3,
    created_at TEXT NOT NULL DEFAULT (DATETIME('now'))
);

INSERT OR IGNORE INTO circuits (circuit_id, circuit_name, length_meters, sector_count)
VALUES 
    ('circuit_monaco', 'Apex Monaco Technical Circuit', 3337.00, 3),
    ('circuit_monza', 'Apex Monza Autodromo', 5793.00, 3),
    ('circuit_spa', 'Apex Circuit de Spa', 7004.00, 3);

-- 2. 레이서 유저 테이블
CREATE TABLE IF NOT EXISTS users (
    user_id TEXT PRIMARY KEY,
    nickname TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (DATETIME('now')),
    last_active_at TEXT NOT NULL DEFAULT (DATETIME('now'))
);

INSERT OR IGNORE INTO users (user_id, nickname)
VALUES ('user_demo_pilot', 'Apex Racer #1');

-- 3. 경기 완주 요약 메타데이터 (Matches)
-- * 고주파 틱 데이터는 Cloudflare R2에 .bin으로 불변 저장
-- * DB에는 전적 검색 및 랭킹 산출을 위한 집계 메타데이터만 1회 INSERT
CREATE TABLE IF NOT EXISTS matches (
    match_id TEXT PRIMARY KEY,                    -- UUID 문자열
    match_code TEXT NOT NULL UNIQUE,              -- M_20261013_A8F2
    user_id TEXT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    circuit_id TEXT NOT NULL REFERENCES circuits(circuit_id) ON DELETE RESTRICT,
    vehicle_id TEXT NOT NULL,                     -- apex_gt_red 등
    
    -- 레이스 핵심 성적 지표 (ms 단위)
    total_laps INTEGER NOT NULL,
    total_time_ms INTEGER NOT NULL,
    best_lap_ms INTEGER NOT NULL,
    top_speed_kmh REAL NOT NULL,
    avg_speed_kmh REAL NOT NULL,
    
    -- 유효성 검증 (1: true, 0: false)
    is_valid INTEGER NOT NULL DEFAULT 1,
    
    -- Cloudflare R2 불변 3D 리플레이 키 링크
    replay_r2_key TEXT NOT NULL,                  -- matches/M_20261013_A8F2.bin
    raw_json_bytes INTEGER NOT NULL,
    compressed_bytes INTEGER NOT NULL,
    compression_ratio REAL NOT NULL,
    
    created_at TEXT NOT NULL DEFAULT (DATETIME('now'))
);

-- 4. 랩별 세부 기록 및 섹터 분할 (Laps)
CREATE TABLE IF NOT EXISTS match_laps (
    match_id TEXT NOT NULL REFERENCES matches(match_id) ON DELETE CASCADE,
    lap_number INTEGER NOT NULL,
    lap_time_ms INTEGER NOT NULL,
    sector_1_ms INTEGER NOT NULL,
    sector_2_ms INTEGER NOT NULL,
    sector_3_ms INTEGER NOT NULL,
    is_best_lap INTEGER NOT NULL DEFAULT 0,
    
    PRIMARY KEY (match_id, lap_number)
);

-- =====================================================================
-- 고성능 B-tree 인덱스
-- =====================================================================

-- 리더보드 순위 전용 인덱스
CREATE INDEX IF NOT EXISTS idx_matches_leaderboard 
ON matches (circuit_id, best_lap_ms ASC, created_at ASC);

-- 유저별 최근 전적 이력 조회 최적화
CREATE INDEX IF NOT EXISTS idx_matches_user_history 
ON matches (user_id, created_at DESC);

-- 고속 매치코드 단건 조회
CREATE INDEX IF NOT EXISTS idx_matches_code 
ON matches (match_code);
