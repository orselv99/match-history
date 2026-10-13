output "r2_bucket_name" {
  description = "생성된 Cloudflare R2 버킷 이름"
  value       = cloudflare_r2_bucket.telemetry_bucket.name
}

output "worker_script_name" {
  description = "배포된 Cloudflare Worker 스크립트 명"
  value       = cloudflare_workers_script.telemetry_api.name
}

output "worker_endpoint_hint" {
  description = "Cloudflare Worker 기본 API 엔드포인트 형태"
  value       = "https://${cloudflare_workers_script.telemetry_api.name}.<your-subdomain>.workers.dev"
}
