variable "cloudflare_api_token" {
  description = "Cloudflare API Token with Workers & R2 Edit permissions"
  type        = string
  sensitive   = true
}

variable "cloudflare_account_id" {
  description = "Cloudflare Account ID"
  type        = string
}

variable "r2_bucket_name" {
  description = "R2 bucket name for immutable match replay binary blobs"
  type        = string
  default     = "match-history-replays"
}

variable "r2_location" {
  description = "R2 storage bucket location hint (e.g. APAC, WNAM, ENAM, WEUR)"
  type        = string
  default     = "APAC"
}

variable "worker_name" {
  description = "Cloudflare Worker service name"
  type        = string
  default     = "match-history-api"
}

variable "environment" {
  description = "Deployment environment (production / staging)"
  type        = string
  default     = "production"
}
