export interface Env {
  REPLAY_BUCKET: R2Bucket;
}

/**
 * Cloudflare Worker for Match History 3D Replay Service
 * - 불변(Immutable) 경기 3D 리플레이 바이너리 저장소 (Cloudflare R2)
 * - Cache-Control: public, max-age=31536000, immutable
 * - Cloudflare 글로벌 엣지 무제한 캐싱 & Egress $0 달성
 */
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const method = request.method;

    // CORS 기본 헤더 (GitHub Pages 및 Astro 블로그 임베딩 도메인 대응)
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, PUT, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, X-Track-Id, X-Match-Code',
      'Access-Control-Max-Age': '86400',
    };

    if (method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    // 1. 경기 리플레이 바이너리 업로드: PUT /api/replays/:matchCode
    const isUploadPath = url.pathname.startsWith('/api/replays/') || url.pathname.startsWith('/api/telemetry/');
    if (method === 'PUT' && isUploadPath) {
      const matchCode = url.pathname.replace(/^\/api\/(replays|telemetry)\//, '').trim();
      if (!matchCode) {
        return new Response(JSON.stringify({ error: 'Missing matchCode' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const body = await request.arrayBuffer();
      if (!body || body.byteLength === 0) {
        return new Response(JSON.stringify({ error: 'Empty replay body' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // R2 오브젝트 스토리지에 불변 영구 저장
      const key = `${matchCode}.bin`;
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

    // 2. 경기 리플레이 다운로드/엣지 서빙: GET /api/replays/:matchCode
    const isGetPath = url.pathname.startsWith('/api/replays/') || url.pathname.startsWith('/api/telemetry/');
    if (method === 'GET' && isGetPath) {
      const matchCode = url.pathname.replace(/^\/api\/(replays|telemetry)\//, '').trim();
      const key = `${matchCode}.bin`;

      const object = await env.REPLAY_BUCKET.get(key);
      if (!object) {
        return new Response(JSON.stringify({ error: 'Replay data not found' }), {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const headers = new Headers();
      // 기술블로그 Part 4 핵심: 불변 캐싱 헤더 + Egress $0 엣지 서빙
      headers.set('Content-Type', 'application/octet-stream');
      headers.set('Cache-Control', 'public, max-age=31536000, immutable');
      if (object.httpEtag) {
        headers.set('ETag', object.httpEtag);
      }
      headers.set('Access-Control-Allow-Origin', '*');

      return new Response(object.body, { headers });
    }

    // 3. 헬스 체크
    if (url.pathname === '/' || url.pathname === '/health') {
      return new Response(
        JSON.stringify({
          service: 'Match History 3D Replay Cloudflare R2 Service',
          status: 'ONLINE',
          architecture: 'Part 4 - Immutable CDN Egress $0',
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    return new Response('Not Found', { status: 404, headers: corsHeaders });
  },
};
