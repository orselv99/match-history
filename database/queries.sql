-- =====================================================================
-- Apex Racing Telemetry - 실무 전적 검색 및 분석 SQL 쿼리 세트
-- =====================================================================

-- ---------------------------------------------------------------------
-- [Query 1] 트랙별 글로벌 랩타임 리더보드 (Top 100 랭킹)
-- 목적: Astro 블로그 또는 전적 대시보드 메인 랭킹 노출
-- 특징: 유저당 개인 최고 기록(Personal Best)만 1건씩 추출하여 DENSE_RANK() 부여,
--       Cloudflare R2 텔레메트리 리플레이 링크를 즉시 바인딩.
-- ---------------------------------------------------------------------
WITH user_best_per_track AS (
    SELECT 
        m.match_id,
        m.match_code,
        m.user_id,
        m.track_id,
        m.vehicle_id,
        m.best_lap_ms,
        m.top_speed_kmh,
        m.replay_r2_key,
        m.created_at,
        ROW_NUMBER() OVER (
            PARTITION BY m.user_id, m.track_id 
            ORDER BY m.best_lap_ms ASC, m.created_at ASC
        ) as rn
    FROM matches m
    WHERE m.track_id = 'circuit_monaco'
      AND m.is_valid = TRUE
)
SELECT 
    DENSE_RANK() OVER (ORDER BY ub.best_lap_ms ASC) AS rank,
    u.nickname,
    ub.vehicle_id,
    -- 00:00.000 형식 포맷팅
    TO_CHAR(INTERVAL '1 millisecond' * ub.best_lap_ms, 'MI:SS.MS') AS formatted_lap_time,
    ub.best_lap_ms,
    ub.top_speed_kmh,
    -- Cloudflare Worker / R2 CDN 리플레이 다운로드 URL 생성
    'https://match-history-api.orsel.workers.dev/api/replays/' || ub.match_code AS replay_url,
    ub.created_at
FROM user_best_per_track ub
JOIN users u ON ub.user_id = u.user_id
WHERE ub.rn = 1
ORDER BY rank ASC
LIMIT 100;


-- ---------------------------------------------------------------------
-- [Query 2] 유저 최근 전적 히스토리 및 통계 (Astro 블로그 포스트 임베딩용)
-- 목적: 특정 유저의 최근 10경기 추이, 평균 기록, 텔레메트리 크기 확인
-- ---------------------------------------------------------------------
SELECT 
    m.match_code,
    t.track_name,
    m.vehicle_id,
    m.total_laps,
    TO_CHAR(INTERVAL '1 millisecond' * m.total_time_ms, 'MI:SS.MS') AS total_time,
    TO_CHAR(INTERVAL '1 millisecond' * m.best_lap_ms, 'MI:SS.MS') AS best_lap,
    m.top_speed_kmh,
    m.avg_speed_kmh,
    ROUND(m.raw_json_bytes / 1024.0, 1) AS raw_json_kb,
    ROUND(m.compressed_bytes / 1024.0, 1) AS compressed_kb,
    m.compression_ratio AS saved_percent,
    'https://match-history-api.orsel.workers.dev/api/replays/' || m.match_code AS replay_url,
    m.created_at
FROM matches m
JOIN tracks t ON m.track_id = t.track_id
WHERE m.user_id = 'user_demo_pilot'
  AND m.is_valid = TRUE
ORDER BY m.created_at DESC
LIMIT 10;


-- ---------------------------------------------------------------------
-- [Query 3] 이론상 최적 랩타임 (Ideal / Theoretical Best Lap) 산출
-- 목적: 전체 경기 중 각 섹터(S1, S2, S3)의 최단 구간 기록을 조합하여 
--       해당 트랙의 인간 한계 최단 가능 랩타임 산출
-- ---------------------------------------------------------------------
SELECT 
    m.track_id,
    MIN(l.sector_1_ms) AS best_s1_ms,
    MIN(l.sector_2_ms) AS best_s2_ms,
    MIN(l.sector_3_ms) AS best_s3_ms,
    -- 섹터 최솟값의 합 = 이론상 최고 랩타임
    (MIN(l.sector_1_ms) + MIN(l.sector_2_ms) + MIN(l.sector_3_ms)) AS ideal_lap_ms,
    TO_CHAR(
        INTERVAL '1 millisecond' * (MIN(l.sector_1_ms) + MIN(l.sector_2_ms) + MIN(l.sector_3_ms)),
        'MI:SS.MS'
    ) AS ideal_lap_formatted,
    -- 실제 기록된 최고 랩타임과 이론상 랩타임의 격차 (델타)
    (MIN(m.best_lap_ms) - (MIN(l.sector_1_ms) + MIN(l.sector_2_ms) + MIN(l.sector_3_ms))) AS potential_gain_ms
FROM match_laps l
JOIN matches m ON l.match_id = m.match_id
WHERE m.track_id = 'circuit_monaco'
  AND m.is_valid = TRUE
GROUP BY m.track_id;


-- ---------------------------------------------------------------------
-- [Query 4] CQRS 아키텍처 인프라 비용 절감 리포트 (Part 4 블로그 검증 쿼리)
-- 목적: Naive JSON DB 저장 대비 R2 Int16 압축 바이너리 저장의 
--       실제 스토리지 용량 절감액 및 AWS S3 Egress 대비 절감 비용 계산
-- ---------------------------------------------------------------------
SELECT 
    COUNT(*) AS total_matches_recorded,
    -- 원본 JSON으로 DB에 쌓았을 경우의 가상 총 용량 (GB)
    ROUND(SUM(raw_json_bytes)::NUMERIC / (1024 * 1024 * 1024), 3) AS naive_json_storage_gb,
    -- 실제 Cloudflare R2에 저장된 바이너리 총 용량 (GB)
    ROUND(SUM(compressed_bytes)::NUMERIC / (1024 * 1024 * 1024), 3) AS actual_r2_storage_gb,
    -- 전체 압축 절감률 (%)
    ROUND(
        (1.0 - (SUM(compressed_bytes)::NUMERIC / SUM(raw_json_bytes)::NUMERIC)) * 100,
        2
    ) AS global_storage_saved_percent,
    -- AWS S3 대비 Egress $0 달성 예상 절감액 (가정: 경기당 50회 리플레이 다운로드, AWS $0.09/GB)
    ROUND(
        (SUM(compressed_bytes)::NUMERIC * 50 / (1024 * 1024 * 1024)) * 0.09,
        2
    ) AS estimated_monthly_egress_savings_usd
FROM matches;
