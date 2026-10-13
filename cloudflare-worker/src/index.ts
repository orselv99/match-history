export interface Env {
  REPLAY_BUCKET: R2Bucket;
}

/**
 * 레이싱 리플레이 바이너리 검증 상수
 * 틱 헤더 매직 넘버: 'RACE' (0x52414345, Big-Endian)
 */
const MAGIC_RACE = 0x52414345;
const MAX_PAYLOAD_BYTES = 100 * 1024; // 최대 100 KB (스토리지 및 메모리 폭탄 방지)

/**
 * CORS 허용 도메인 화이트리스트 (타 사이트에서의 무단 API 도용 차단)
 */
const ALLOWED_ORIGINS = [
  'https://orselv99.github.io',
  'http://localhost:5173',
  'http://localhost:3000',
  'http://localhost:4321', // Astro 로컬 기본 포트
];

function getCorsHeaders(request: Request): HeadersInit {
  const origin = request.headers.get('Origin') || '';
  const isAllowed = ALLOWED_ORIGINS.includes(origin) || origin.endsWith('.github.io');
  const allowOrigin = isAllowed ? origin : ALLOWED_ORIGINS[0];

  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Methods': 'GET, PUT, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Track-Id, X-Match-Code',
    'Access-Control-Max-Age': '86400',
  };
}

/**
 * OpenAPI 3.0 명세서
 */
const OPENAPI_SPEC = {
  openapi: '3.0.0',
  info: {
    title: 'Match History 3D Replay Edge API',
    version: '1.0.0',
    description: 'Cloudflare Worker & R2 Edge Service for Immutable Racing Replays (Egress $0)',
  },
  paths: {
    '/health': {
      get: {
        summary: '서버 헬스 체크',
        responses: {
          '200': { description: '정상 가동 중' },
        },
      },
    },
    '/api/replays/{matchCode}': {
      put: {
        summary: '3D 리플레이 바이너리 업로드 (보안: 최대 100KB, RACE 매직넘버 검증, 덮어쓰기 방지)',
        parameters: [
          {
            name: 'matchCode',
            in: 'path',
            required: true,
            description: '경기 고유 코드 (예: M_20261013_A8F2)',
            schema: { type: 'string', example: 'M_20261013_A8F2' },
          },
        ],
        requestBody: {
          required: true,
          content: {
            'application/octet-stream': {
              schema: { type: 'string', format: 'binary' },
            },
          },
        },
        responses: {
          '200': { description: '업로드 및 R2 불변 저장 성공' },
          '400': { description: '잘못된 매치코드 또는 위조된 바이너리 (RACE 헤더 불일치)' },
          '403': { description: '허용되지 않은 Origin (CORS 차단)' },
          '409': { description: '이미 존재하는 경기 데이터 (불변 덮어쓰기 방지)' },
          '413': { description: '용량 초과 (최대 100KB 초과)' },
        },
      },
      get: {
        summary: '3D 리플레이 바이너리 다운로드 (Edge CDN 캐싱, Egress $0)',
        parameters: [
          {
            name: 'matchCode',
            in: 'path',
            required: true,
            schema: { type: 'string', example: 'M_20261013_A8F2' },
          },
        ],
        responses: {
          '200': { description: '바이너리 스트림 반환 (Cache-Control: immutable)' },
          '404': { description: '리플레이를 찾을 수 없음' },
        },
      },
    },
  },
};

/**
 * 대시보드 대용 내장 Swagger UI HTML
 */
const SWAGGER_HTML = `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Match History Replay API // Swagger Explorer</title>
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

    // 1. 프리플라이트 OPTIONS 처리
    if (method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    // 2. Swagger UI 웹 브라우저 뷰어: GET / 또는 GET /docs
    if (method === 'GET' && (url.pathname === '/' || url.pathname === '/docs')) {
      return new Response(SWAGGER_HTML, {
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      });
    }

    // 3. OpenAPI 3.0 명세서 반환: GET /openapi.json
    if (method === 'GET' && url.pathname === '/openapi.json') {
      return new Response(JSON.stringify(OPENAPI_SPEC), {
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }

    // 4. 헬스 체크 엔드포인트: GET /health
    if (method === 'GET' && url.pathname === '/health') {
      return new Response(
        JSON.stringify({
          service: 'Match History 3D Replay Cloudflare R2 Service',
          status: 'ONLINE',
          architecture: 'Part 4 - Immutable CDN Egress $0',
          swaggerUrl: `${url.origin}/docs`,
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // 5. 경기 리플레이 바이너리 업로드: PUT /api/replays/:matchCode
    const isUploadPath = url.pathname.startsWith('/api/replays/') || url.pathname.startsWith('/api/telemetry/');
    if (method === 'PUT' && isUploadPath) {
      const matchCode = url.pathname.replace(/^\/api\/(replays|telemetry)\//, '').trim();

      // [보안 1] MatchCode 포맷 정규식 검증 (디렉터리 조작 '..' 차단)
      if (!/^[A-Za-z0-9_-]{4,64}$/.test(matchCode)) {
        return new Response(
          JSON.stringify({ error: 'Invalid matchCode. Must be alphanumeric (4~64 chars).' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // [보안 2] Content-Length 헤더 1차 검사 (대용량 사전 차단)
      const contentLength = Number(request.headers.get('content-length') || '0');
      if (contentLength > MAX_PAYLOAD_BYTES) {
        return new Response(
          JSON.stringify({ error: `Payload too large. Max allowed is ${MAX_PAYLOAD_BYTES / 1024} KB.` }),
          { status: 413, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const key = `${matchCode}.bin`;

      // [보안 3] 덮어쓰기 차단 (Write-Once / 불변 원칙으로 Class A 쓰기 비용 소모 방지)
      const existing = await env.REPLAY_BUCKET.head(key);
      if (existing) {
        return new Response(
          JSON.stringify({ error: 'Replay already exists. Overwrite is prohibited.' }),
          { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // 바디 수신 및 크기 2차 검사
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

      // [보안 4] 위조 파일 차단: 헤더 매직 넘버 검증 ('RACE' 0x52414345)
      if (body.byteLength >= 4) {
        const view = new DataView(body);
        const magic = view.getUint32(0, false); // Big-Endian
        if (magic !== MAGIC_RACE) {
          return new Response(
            JSON.stringify({ error: 'Invalid replay packet magic. Must be RACE binary.' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
      }

      // 검증 통과 시 R2에 불변 영구 저장
      await env.REPLAY_BUCKET.put(key, body, {
        httpMetadata: {
          contentType: 'application/octet-stream',
          cacheControl: 'public, max-age=31536000, immutable',
        },
        customMetadata: {
          uploadedAt: new Date().toISOString(),
          byteLength: body.byteLength.toString(),
          trackId: request.headers.get('X-Track-Id') || 'circuit_monaco',
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

    // 6. 경기 리플레이 다운로드: GET /api/replays/:matchCode
    const isGetPath = url.pathname.startsWith('/api/replays/') || url.pathname.startsWith('/api/telemetry/');
    if (method === 'GET' && isGetPath) {
      const matchCode = url.pathname.replace(/^\/api\/(replays|telemetry)\//, '').trim();

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
      // 기술블로그 Part 4: 불변 캐싱 헤더 + Egress $0 엣지 서빙
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
