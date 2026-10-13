provider "cloudflare" {
  api_token = var.cloudflare_api_token
}

# 1. Cloudflare R2 오브젝트 스토리지 버킷 (Part 4: Egress $0 불변 바이너리 저장소)
resource "cloudflare_r2_bucket" "replay_bucket" {
  account_id = var.cloudflare_account_id
  name       = var.r2_bucket_name
  location   = var.r2_location
}

# 2. Cloudflare Worker 엣지 서빙 스크립트
resource "cloudflare_workers_script" "replay_api" {
  account_id         = var.cloudflare_account_id
  name               = var.worker_name
  content            = file("${path.module}/../cloudflare-worker/src/index.ts")
  module             = true
  compatibility_date = "2024-10-01"

  # R2 버킷 바인딩 (REPLAY_BUCKET 변수로 Worker에 주입)
  r2_bucket_binding {
    name        = "REPLAY_BUCKET"
    bucket_name = cloudflare_r2_bucket.replay_bucket.name
  }

  plain_text_binding {
    name = "ENVIRONMENT"
    text = var.environment
  }
}
