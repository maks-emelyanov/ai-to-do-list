output "project_id" {
  description = "Google Cloud project ID."
  value       = google_firebase_project.this.project
}

output "firebase_web_app_id" {
  description = "Firebase Web App ID."
  value       = google_firebase_web_app.web.app_id
}

output "firebase_web_config" {
  description = "Firebase client config values for the Expo app."
  value = {
    api_key             = data.google_firebase_web_app_config.web.api_key
    app_id              = google_firebase_web_app.web.app_id
    auth_domain         = data.google_firebase_web_app_config.web.auth_domain
    database_url        = lookup(data.google_firebase_web_app_config.web, "database_url", "")
    measurement_id      = lookup(data.google_firebase_web_app_config.web, "measurement_id", "")
    messaging_sender_id = lookup(data.google_firebase_web_app_config.web, "messaging_sender_id", "")
    project_id          = google_firebase_project.this.project
    storage_bucket      = lookup(data.google_firebase_web_app_config.web, "storage_bucket", "")
  }
}

output "google_auth_provider_enabled" {
  description = "Whether the Google Firebase Auth provider is managed and enabled."
  value       = try(google_identity_platform_default_supported_idp_config.google[0].enabled, false)
}

output "apple_auth_provider_enabled" {
  description = "Whether the Apple Firebase Auth provider is managed and enabled."
  value       = try(google_identity_platform_default_supported_idp_config.apple[0].enabled, false)
}

output "microsoft_auth_provider_enabled" {
  description = "Whether the Microsoft Firebase Auth provider is managed and enabled."
  value       = try(google_identity_platform_default_supported_idp_config.microsoft[0].enabled, false)
}

output "android_app_id" {
  description = "Firebase Android App ID, if created."
  value       = try(google_firebase_android_app.android[0].app_id, null)
}

output "apple_app_id" {
  description = "Firebase Apple App ID, if created."
  value       = try(google_firebase_apple_app.apple[0].app_id, null)
}

output "region" {
  description = "Region used for regional app infrastructure."
  value       = var.region
}

output "auth_api_service_name" {
  description = "Cloud Run auth API service name."
  value       = google_cloud_run_v2_service.auth_api.name
}

output "auth_api_service_url" {
  description = "Cloud Run auth API service URL."
  value       = google_cloud_run_v2_service.auth_api.uri
}

output "auth_api_container_image" {
  description = "Container image deployed to the auth API service."
  value       = local.auth_api_container_image
}

output "auth_api_artifact_registry_repository" {
  description = "Artifact Registry repository for auth API images."
  value       = google_artifact_registry_repository.auth_api.name
}
