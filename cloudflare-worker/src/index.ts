export interface Env {
  REPLAY_BUCKET: R2Bucket;
  DB: D1Database;
}

/**
 * 레이싱 리플레이 바이너리 검증 상수
 * 틱 헤더 매직 넘버: 'RACE' (0x52414345, Big-Endian)
 */
const MAGIC_RACE = 0x52414345;
const MAX_PAYLOAD_BYTES = 100 * 1024; // 최대 100 KB

/**
 * CORS 허용 도메인 화이트리스트
 */
const ALLOWED_ORIGINS = [
  'https://orselv99.github.io',
  'http://localhost:5173',
  'http://localhost:3000',
  'http://localhost:4321', // Astro 기본 포트
];

/**
 * Referer 서브패스 허용 접두사 화이트리스트
 * - GitHub Pages 서브패스(/match-history) 및 개발 로컬 포트 검증
 */
const ALLOWED_REFERER_PREFIXES = [
  'https://orselv99.github.io/match-history',
  'https://match-history-api.orsel.workers.dev',
  'http://localhost:5173',
  'http://localhost:3000',
  'http://localhost:4321',
];

function isRefererAllowed(referer: string | null): boolean {
  if (!referer) return true; // 직접 호출(curl 등) 또는 브라우저 strict-origin-when-cross-origin 정책 시 허용
  return ALLOWED_REFERER_PREFIXES.some(prefix => referer.startsWith(prefix)) || referer.includes('.github.io/match-history');
}

function getCorsHeaders(request: Request): HeadersInit {
  const origin = request.headers.get('Origin') || '';
  const isAllowed = ALLOWED_ORIGINS.includes(origin) || origin.endsWith('.github.io');
  const allowOrigin = isAllowed ? origin : ALLOWED_ORIGINS[0];

  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Circuit-Id, X-Match-Code',
    'Access-Control-Max-Age': '86400',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'SAMEORIGIN',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
  };
}

/**
 * 웹 취약점 자동화 스캐너 및 악성 봇 탐지 블랙리스트 패턴
 */
const SUSPICIOUS_PATH_PATTERNS = [
  /\.(env|git|svn|htaccess|htpasswd|ini|conf|bak|sql|old|backup)$/i,
  /^\/(wp-|wordpress|admin|phpmyadmin|pma|setup|cgi-bin|etc|xmlrpc|actuator|\.aws|\.well-known)/i,
  /\.(php|jsp|asp|aspx|action|do|cgi)$/i,
  /\/(eval-stdin|console|shell|cmd|root|config\.json|boaform)/i,
];

const MALICIOUS_USER_AGENTS = [
  'sqlmap', 'nikto', 'nmap', 'masscan', 'zgrab', 'gobuster', 'dirbuster',
  'nuclei', 'wprecon', 'acunetix', 'nessus', 'censys', 'shodan', 'openvas'
];

/**
 * 스마트 봇 및 보안 검증 함수 (비인가 해외 봇 차단 및 정상 유저 보호)
 */
function checkBotSecurity(request: Request, url: URL): { blocked: boolean; reason?: string } {
  const userAgent = (request.headers.get('User-Agent') || '').toLowerCase();
  const path = url.pathname.toLowerCase();

  // 1. 악성 스캐너 툴 User-Agent 차단
  if (MALICIOUS_USER_AGENTS.some(agent => userAgent.includes(agent))) {
    return { blocked: true, reason: 'Suspicious scanner User-Agent blocked' };
  }

  // 2. 웹 취약점 무작위 탐색 경로 차단 (.env, /wp-*, php 등)
  if (SUSPICIOUS_PATH_PATTERNS.some(pattern => pattern.test(path))) {
    return { blocked: true, reason: 'Unauthorized security probe pattern blocked' };
  }

  // 3. 해외(대한민국 외) 접근 스마트 필터링:
  // - 한국(KR) 접속이거나 로컬 개발(country 없음)은 모두 정상 통과
  // - 해외 접속의 경우:
  //   - 유효한 게임 서비스 경로(/, /docs, /openapi.json, /health, /api/*)가 아닌 무작위 경로는 즉시 403 차단
  //   - /api/* 에 대해 데이터 쓰기(POST/PUT) 시도시 출처(Origin/Referer) 검증 (위조 봇 차단)
  const country = (request as any).cf?.country;
  if (country && country !== 'KR') {
    const isStandardPath =
      path === '/' ||
      path === '/docs' ||
      path === '/openapi.json' ||
      path === '/health' ||
      path.startsWith('/api/');

    if (!isStandardPath) {
      return { blocked: true, reason: 'Overseas request to unmapped path rejected' };
    }

    if (request.method === 'POST' || request.method === 'PUT') {
      const origin = request.headers.get('Origin') || '';
      const referer = request.headers.get('Referer') || '';
      const isAuthorizedOrigin = ALLOWED_ORIGINS.includes(origin) || origin.endsWith('.github.io') || referer.includes('.github.io');
      if (!isAuthorizedOrigin) {
        return { blocked: true, reason: 'Overseas mutation request requires authorized game origin' };
      }
    }
  }

  return { blocked: false };
}


/**
 * OpenAPI 3.0 명세서
 */
const OPENAPI_SPEC = {
  openapi: '3.0.0',
  info: {
    title: 'Match History 3D Replay & Stats Edge API',
    version: '1.1.0',
    description: 'Cloudflare Worker, R2 & D1 Database Edge Service for Racing Match History (CQRS Architecture)',
  },
  paths: {
    '/health': {
      get: {
        summary: '서버 헬스 체크',
        responses: { '200': { description: '정상 가동 중' } },
      },
    },
    '/api/leaderboard': {
      get: {
        summary: '서킷별 랩타임 순위 리더보드 (Top 100 랭킹 & D1 쿼리)',
        parameters: [
          { name: 'circuitId', in: 'query', schema: { type: 'string', default: 'circuit_monaco' } },
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 50 } },
        ],
        responses: { '200': { description: '리더보드 목록 반환' } },
      },
    },
    '/api/matches': {
      get: {
        summary: '유저별 전적 히스토리 검색',
        parameters: [
          { name: 'userId', in: 'query', required: true, schema: { type: 'string' } },
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 10 } },
        ],
        responses: { '200': { description: '전적 목록 반환' } },
      },
      post: {
        summary: '경기 완주 전적 메타데이터 저장 (D1 Database)',
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { type: 'object' } } },
        },
        responses: {
          '201': { description: '전적 저장 성공' },
          '400': { description: '잘못된 입력값' },
          '409': { description: '이미 등록된 매치코드' },
        },
      },
    },
    '/api/replays/{matchCode}': {
      put: {
        summary: '3D 리플레이 바이너리 업로드 (R2 Storage: 최대 100KB, 불변 저장)',
        parameters: [
          { name: 'matchCode', in: 'path', required: true, schema: { type: 'string' } },
        ],
        requestBody: {
          required: true,
          content: { 'application/octet-stream': { schema: { type: 'string', format: 'binary' } } },
        },
        responses: {
          '200': { description: 'R2 업로드 성공' },
          '400': { description: '위조된 바이너리' },
          '409': { description: '이미 존재하는 데이터' },
          '413': { description: '100KB 초과' },
        },
      },
      get: {
        summary: '3D 리플레이 바이너리 다운로드 (R2 Edge CDN 서빙, Egress $0)',
        parameters: [
          { name: 'matchCode', in: 'path', required: true, schema: { type: 'string' } },
        ],
        responses: {
          '200': { description: '바이너리 반환' },
          '404': { description: '파일 없음' },
        },
      },
    },
  },
};

/**
 * 내장 Swagger UI HTML
 */
const SWAGGER_HTML = `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Match History API // Swagger Explorer</title>
  <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css" />
  <style>
    body { margin: 0; background: #121316; }
    .swagger-ui .topbar { display: none; }
    .swagger-ui { filter: invert(88%) hue-rotate(180deg); }
    .swagger-ui .information-container { padding: 20px 0; }
  </style>
</head>
<body>
  <div id="swagger-ui"></div>
  <script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
  <script>
    window.ui = SwaggerUIBundle({
      url: '/openapi.json',
      dom_id: '#swagger-ui',
      deepLinking: true,
      presets: [
        SwaggerUIBundle.presets.apis,
        SwaggerUIBundle.SwaggerUIStandalonePreset
      ],
      layout: "BaseLayout"
    });
  </script>
</body>
</html>`;

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const method = request.method;
    const corsHeaders = getCorsHeaders(request);

    // 1. 프리플라이트 OPTIONS
    if (method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    // 2. 보안 & 스마트 봇 필터링 (취약점 스캐너 및 해외 비인가 위조 탐색 차단)
    const securityCheck = checkBotSecurity(request, url);
    if (securityCheck.blocked) {
      return new Response(
        JSON.stringify({
          error: 'Forbidden',
          message: securityCheck.reason,
          timestamp: new Date().toISOString(),
        }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 2. Swagger UI 웹 뷰어: GET / 또는 GET /docs
    if (method === 'GET' && (url.pathname === '/' || url.pathname === '/docs')) {
      return new Response(SWAGGER_HTML, {
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      });
    }

    // 3. OpenAPI 3.0 스펙 반환
    if (method === 'GET' && url.pathname === '/openapi.json') {
      return new Response(JSON.stringify(OPENAPI_SPEC), {
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }

    // 4. 헬스 체크 엔드포인트
    if (method === 'GET' && url.pathname === '/health') {
      return new Response(
        JSON.stringify({
          service: 'Match History 3D Replay & Stats Service',
          status: 'ONLINE',
          storage: 'Cloudflare R2 (match-history-replays)',
          database: 'Cloudflare D1 (match-history-db)',
          architecture: 'CQRS Egress $0',
          swaggerUrl: `${url.origin}/docs`,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 5. Referer 헤더 검증 (비인가 외부 도메인/경로에서의 API 남용 방지)
    const referer = request.headers.get('Referer');
    if (url.pathname.startsWith('/api/') && !isRefererAllowed(referer)) {
      return new Response(
        JSON.stringify({
          error: 'Forbidden: Unauthorized Referer path',
          message: 'API access is restricted to authorized match-history origins and subpaths.',
          referer: referer || null,
        }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }


    // -----------------------------------------------------------------
    // [API 1] 트랙별 리더보드 순위 조회: GET /api/leaderboard
    // -----------------------------------------------------------------
    if (method === 'GET' && url.pathname === '/api/leaderboard') {
      const circuitId = url.searchParams.get('circuitId') || 'circuit_monaco';
      const limit = Math.min(100, Math.max(1, Number(url.searchParams.get('limit') || '50')));

      try {
        const query = `
          WITH user_best AS (
            SELECT 
              m.match_id, m.match_code, m.user_id, m.circuit_id, m.vehicle_id, 
              m.best_lap_ms, m.top_speed_kmh, m.replay_r2_key, m.created_at,
              ROW_NUMBER() OVER (PARTITION BY m.user_id ORDER BY m.best_lap_ms ASC) as rn
            FROM matches m
            WHERE m.circuit_id = ? AND m.is_valid = 1
          )
          SELECT 
            DENSE_RANK() OVER (ORDER BY ub.best_lap_ms ASC) as rank,
            u.nickname, ub.vehicle_id, ub.best_lap_ms, ub.top_speed_kmh,
            ub.match_code, ub.created_at
          FROM user_best ub
          JOIN users u ON ub.user_id = u.user_id
          WHERE ub.rn = 1
          ORDER BY rank ASC
          LIMIT ?;
        `;
        const { results } = await env.DB.prepare(query).bind(circuitId, limit).all();

        const leaderboard = (results || []).map((row: any) => ({
          rank: row.rank,
          nickname: row.nickname,
          vehicleId: row.vehicle_id,
          bestLapMs: row.best_lap_ms,
          formattedLapTime: formatMs(row.best_lap_ms),
          topSpeedKmh: row.top_speed_kmh,
          matchCode: row.match_code,
          replayUrl: `${url.origin}/api/replays/${row.match_code}`,
          createdAt: row.created_at,
        }));

        return new Response(JSON.stringify({ circuitId, total: leaderboard.length, leaderboard }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      } catch (err: any) {
        return new Response(JSON.stringify({ error: 'Failed to fetch leaderboard', message: err.message }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    // -----------------------------------------------------------------
    // [API 2] 유저별 최근 전적 히스토리 검색: GET /api/matches
    // -----------------------------------------------------------------
    if (method === 'GET' && url.pathname === '/api/matches') {
      const userId = url.searchParams.get('userId');
      if (!userId) {
        return new Response(JSON.stringify({ error: 'Missing userId parameter' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      const limit = Math.min(50, Math.max(1, Number(url.searchParams.get('limit') || '10')));

      try {
        const query = `
          SELECT 
            m.match_code, m.circuit_id, c.circuit_name, m.vehicle_id, m.total_laps,
            m.total_time_ms, m.best_lap_ms, m.top_speed_kmh, m.avg_speed_kmh,
            m.raw_json_bytes, m.compressed_bytes, m.compression_ratio, m.created_at
          FROM matches m
          JOIN circuits c ON m.circuit_id = c.circuit_id
          WHERE m.user_id = ? AND m.is_valid = 1
          ORDER BY m.created_at DESC
          LIMIT ?;
        `;
        const { results } = await env.DB.prepare(query).bind(userId, limit).all();

        const matches = (results || []).map((m: any) => ({
          matchCode: m.match_code,
          circuitId: m.circuit_id,
          circuitName: m.circuit_name,
          vehicleId: m.vehicle_id,
          totalLaps: m.total_laps,
          totalTimeMs: m.total_time_ms,
          totalTimeFormatted: formatMs(m.total_time_ms),
          bestLapMs: m.best_lap_ms,
          bestLapFormatted: formatMs(m.best_lap_ms),
          topSpeedKmh: m.top_speed_kmh,
          avgSpeedKmh: m.avg_speed_kmh,
          rawJsonKb: Math.round(m.raw_json_bytes / 1024),
          compressedKb: Math.round(m.compressed_bytes / 1024),
          compressionRatio: m.compression_ratio,
          replayUrl: `${url.origin}/api/replays/${m.match_code}`,
          createdAt: m.created_at,
        }));

        return new Response(JSON.stringify({ userId, count: matches.length, matches }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      } catch (err: any) {
        return new Response(JSON.stringify({ error: 'Failed to fetch matches', message: err.message }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    // -----------------------------------------------------------------
    // [API 3] 경기 완주 전적 메타데이터 저장: POST /api/matches
    // -----------------------------------------------------------------
    if (method === 'POST' && url.pathname === '/api/matches') {
      try {
        const meta = await request.json() as any;
        const circuitId = meta.circuitId;
        if (!meta.matchCode || !meta.userId || !circuitId) {
          return new Response(JSON.stringify({ error: 'Missing required match fields' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        const matchId = crypto.randomUUID();
        const replayKey = `matches/${meta.matchCode}.bin`;

        // 1) 유저 자동 업서트 (없으면 생성)
        const driverName = meta.driverName || meta.userNickname || 'Racer';
        await env.DB.prepare(`
          INSERT INTO users (user_id, nickname, last_active_at)
          VALUES (?, ?, DATETIME('now'))
          ON CONFLICT (user_id) DO UPDATE SET nickname = ?, last_active_at = DATETIME('now');
        `).bind(meta.userId, driverName, driverName).run();

        // 2) 매치 메타데이터 INSERT
        await env.DB.prepare(`
          INSERT INTO matches (
            match_id, match_code, user_id, circuit_id, vehicle_id,
            total_laps, total_time_ms, best_lap_ms, top_speed_kmh, avg_speed_kmh,
            is_valid, replay_r2_key, raw_json_bytes, compressed_bytes, compression_ratio
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?);
        `).bind(
          matchId,
          meta.matchCode,
          meta.userId,
          circuitId,
          meta.vehicleModelId || meta.vehicleId || 'gt_turbo',
          meta.totalLaps || 3,
          meta.totalTimeMs || 0,
          meta.bestLapMs || 0,
          meta.topSpeedKmh || 0,
          meta.avgSpeedKmh || 0,
          replayKey,
          meta.rawJsonBytes || 0,
          meta.compressedBytes || 0,
          meta.compressionRatioPercent || 0
        ).run();

        // 3) 랩별 상세 타임 batch INSERT (옵션)
        if (Array.isArray(meta.lapTimesMs) && meta.lapTimesMs.length > 0) {
          const lapInserts = meta.lapTimesMs.map((lapMs: number, idx: number) => {
            const lapNumber = idx + 1;
            const isBest = lapMs === meta.bestLapMs ? 1 : 0;
            const sectors = (meta.sectorTimesMs && meta.sectorTimesMs[idx]) || [0, 0, 0];
            return env.DB.prepare(`
              INSERT INTO match_laps (match_id, lap_number, lap_time_ms, sector_1_ms, sector_2_ms, sector_3_ms, is_best_lap)
              VALUES (?, ?, ?, ?, ?, ?, ?);
            `).bind(matchId, lapNumber, lapMs, sectors[0] || 0, sectors[1] || 0, sectors[2] || 0, isBest);
          });
          await env.DB.batch(lapInserts);
        }

        return new Response(JSON.stringify({ success: true, matchId, matchCode: meta.matchCode }), {
          status: 201,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      } catch (err: any) {
        if (err.message && err.message.includes('UNIQUE constraint failed')) {
          return new Response(JSON.stringify({ error: 'Match code already exists' }), {
            status: 409,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
        return new Response(JSON.stringify({ error: 'Failed to save match stats', message: err.message }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    // -----------------------------------------------------------------
    // [API 4] 3D 리플레이 바이너리 업로드: PUT /api/replays/:matchCode
    // -----------------------------------------------------------------
    const isUploadPath = url.pathname.startsWith('/api/replays/');
    if (method === 'PUT' && isUploadPath) {
      const matchCode = url.pathname.replace(/^\/api\/replays\//, '').trim();

      if (!/^[A-Za-z0-9_-]{4,64}$/.test(matchCode)) {
        return new Response(
          JSON.stringify({ error: 'Invalid matchCode. Must be alphanumeric (4~64 chars).' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const contentLength = Number(request.headers.get('content-length') || '0');
      if (contentLength > MAX_PAYLOAD_BYTES) {
        return new Response(
          JSON.stringify({ error: `Payload too large. Max allowed is ${MAX_PAYLOAD_BYTES / 1024} KB.` }),
          { status: 413, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const key = `${matchCode}.bin`;
      const existing = await env.REPLAY_BUCKET.head(key);
      if (existing) {
        return new Response(
          JSON.stringify({ error: 'Replay already exists. Overwrite is prohibited.' }),
          { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const body = await request.arrayBuffer();
      if (!body || body.byteLength === 0) {
        return new Response(JSON.stringify({ error: 'Empty replay body' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      if (body.byteLength > MAX_PAYLOAD_BYTES) {
        return new Response(
          JSON.stringify({ error: `Payload too large. Max allowed is ${MAX_PAYLOAD_BYTES / 1024} KB.` }),
          { status: 413, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // 'RACE' 매직 넘버 검증
      if (body.byteLength >= 4) {
        const view = new DataView(body);
        const magic = view.getUint32(0, false);
        if (magic !== MAGIC_RACE) {
          return new Response(
            JSON.stringify({ error: 'Invalid replay packet magic. Must be RACE binary.' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
      }

      await env.REPLAY_BUCKET.put(key, body, {
        httpMetadata: {
          contentType: 'application/octet-stream',
          cacheControl: 'public, max-age=31536000, immutable',
        },
        customMetadata: {
          uploadedAt: new Date().toISOString(),
          byteLength: body.byteLength.toString(),
          circuitId: request.headers.get('X-Circuit-Id') || 'circuit_monaco',
        },
      });

      return new Response(
        JSON.stringify({
          success: true,
          matchCode,
          key,
          byteLength: body.byteLength,
          publicUrl: `${url.origin}/api/replays/${matchCode}`,
        }),
        {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // -----------------------------------------------------------------
    // [API 5] 3D 리플레이 바이너리 다운로드: GET /api/replays/:matchCode
    // -----------------------------------------------------------------
    const isGetPath = url.pathname.startsWith('/api/replays/');
    if (method === 'GET' && isGetPath) {
      const matchCode = url.pathname.replace(/^\/api\/replays\//, '').trim();

      if (!/^[A-Za-z0-9_-]{4,64}$/.test(matchCode)) {
        return new Response('Invalid matchCode format', { status: 400, headers: corsHeaders });
      }

      const key = `${matchCode}.bin`;
      const object = await env.REPLAY_BUCKET.get(key);
      if (!object) {
        return new Response(JSON.stringify({ error: 'Replay data not found' }), {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const headers = new Headers();
      headers.set('Content-Type', 'application/octet-stream');
      headers.set('Cache-Control', 'public, max-age=31536000, immutable');
      if (object.httpEtag) {
        headers.set('ETag', object.httpEtag);
      }
      headers.set('Access-Control-Allow-Origin', '*');

      return new Response(object.body, { headers });
    }

    return new Response('Not Found', { status: 404, headers: corsHeaders });
  },
};

function formatMs(ms: number): string {
  if (!ms || ms <= 0) return '--:--.---';
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const millis = ms % 1000;
  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}.${millis.toString().padStart(3, '0')}`;
}
