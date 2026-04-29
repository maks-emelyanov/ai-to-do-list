locals {
  project_labels = merge(
    var.labels,
    {
      firebase = "enabled"
    }
  )

  target_project_id = var.create_project ? google_project.this[0].project_id : var.project_id

  required_services = toset([
    "artifactregistry.googleapis.com",
    "cloudbuild.googleapis.com",
    "cloudbilling.googleapis.com",
    "cloudresourcemanager.googleapis.com",
    "firebase.googleapis.com",
    "iam.googleapis.com",
    "iamcredentials.googleapis.com",
    "identitytoolkit.googleapis.com",
    "run.googleapis.com",
    "serviceusage.googleapis.com",
  ])

  android_sha1_hashes = distinct([
    for hash in var.android_sha1_hashes : lower(replace(trimspace(hash), ":", ""))
    if trimspace(hash) != ""
  ])

  android_sha256_hashes = distinct([
    for hash in var.android_sha256_hashes : lower(replace(trimspace(hash), ":", ""))
    if trimspace(hash) != ""
  ])

  auth_api_cors_origins = length(var.auth_api_cors_origins) > 0 ? var.auth_api_cors_origins : [
    for domain in var.authorized_domains : "https://${domain}"
    if !contains(["localhost", "127.0.0.1"], domain)
  ]

  auth_api_source_files = var.auth_api_source_dir == null ? [] : sort([
    for file in fileset(var.auth_api_source_dir, "**") : file
    if !startswith(file, "node_modules/") &&
    !startswith(file, ".git/") &&
    file != ".env" &&
    !startswith(file, ".env.")
  ])

  auth_api_source_hash = sha256(join("", [
    for file in local.auth_api_source_files : filesha256("${var.auth_api_source_dir}/${file}")
  ]))

  auth_api_built_container_image = "${var.region}-docker.pkg.dev/${local.target_project_id}/${var.auth_api_artifact_registry_repository_id}/${var.auth_api_image_name}:${var.auth_api_image_tag}"
  auth_api_container_image       = var.build_auth_api_image ? local.auth_api_built_container_image : var.auth_api_container_image

  firebase_hosting_public_files = var.firebase_hosting_public_dir == null ? [] : sort([
    for file in fileset(var.firebase_hosting_public_dir, "**") : file
    if !startswith(file, "node_modules/") &&
    !startswith(file, ".git/") &&
    file != ".env" &&
    !startswith(file, ".env.")
  ])

  firebase_hosting_hash = sha256(join("", concat(
    [
      for file in local.firebase_hosting_public_files : filesha256("${var.firebase_hosting_public_dir}/${file}")
    ],
    var.firebase_config_path == null ? [] : [filesha256(var.firebase_config_path)]
  )))

  cloud_build_service_account_emails = toset([
    "${data.google_project.target.number}@cloudbuild.gserviceaccount.com",
    "${data.google_project.target.number}-compute@developer.gserviceaccount.com",
  ])
}

resource "google_project" "this" {
  count = var.create_project ? 1 : 0

  provider = google-beta.no_user_project_override

  name            = var.project_name
  project_id      = var.project_id
  billing_account = var.billing_account
  folder_id       = var.folder_id
  org_id          = var.org_id
  labels          = local.project_labels
}

resource "google_project_service" "required" {
  for_each = local.required_services

  provider = google-beta.no_user_project_override

  project = local.target_project_id
  service = each.key

  disable_on_destroy = false

  depends_on = [
    google_project.this,
  ]
}

data "google_project" "target" {
  provider = google-beta.no_user_project_override

  project_id = local.target_project_id

  depends_on = [
    google_project_service.required,
  ]
}

resource "google_firebase_project" "this" {
  provider = google-beta

  project = local.target_project_id

  depends_on = [
    google_project_service.required,
  ]
}

resource "google_identity_platform_config" "auth" {
  provider = google-beta

  project = google_firebase_project.this.project

  autodelete_anonymous_users = var.autodelete_anonymous_users
  authorized_domains         = var.authorized_domains

  sign_in {
    allow_duplicate_emails = var.allow_duplicate_emails

    anonymous {
      enabled = var.enable_anonymous_sign_in
    }

    email {
      enabled           = var.enable_email_sign_in
      password_required = var.email_password_required
    }

    phone_number {
      enabled            = var.enable_phone_sign_in
      test_phone_numbers = var.phone_test_numbers
    }
  }

  multi_tenant {
    allow_tenants = false
  }

  depends_on = [
    google_project_service.required,
  ]
}

resource "google_identity_platform_default_supported_idp_config" "google" {
  count = var.google_auth_provider.enabled ? 1 : 0

  provider = google-beta

  project       = google_firebase_project.this.project
  enabled       = true
  idp_id        = "google.com"
  client_id     = var.google_auth_provider.client_id
  client_secret = var.google_auth_provider.client_secret

  depends_on = [
    google_identity_platform_config.auth,
  ]
}

resource "google_identity_platform_default_supported_idp_config" "apple" {
  count = var.apple_auth_provider.enabled ? 1 : 0

  provider = google-beta

  project       = google_firebase_project.this.project
  enabled       = true
  idp_id        = "apple.com"
  client_id     = var.apple_auth_provider.client_id
  client_secret = var.apple_auth_provider.client_secret

  depends_on = [
    google_identity_platform_config.auth,
  ]
}

resource "google_identity_platform_default_supported_idp_config" "microsoft" {
  count = var.microsoft_auth_provider.enabled ? 1 : 0

  provider = google-beta

  project       = google_firebase_project.this.project
  enabled       = true
  idp_id        = "microsoft.com"
  client_id     = var.microsoft_auth_provider.client_id
  client_secret = var.microsoft_auth_provider.client_secret

  depends_on = [
    google_identity_platform_config.auth,
  ]
}

resource "google_firebase_web_app" "web" {
  provider = google-beta

  project      = google_firebase_project.this.project
  display_name = var.firebase_web_app_display_name

  depends_on = [
    google_identity_platform_config.auth,
  ]
}

data "google_firebase_web_app_config" "web" {
  provider = google-beta

  project    = google_firebase_project.this.project
  web_app_id = google_firebase_web_app.web.app_id
}

resource "google_firebase_android_app" "android" {
  count = var.create_android_app ? 1 : 0

  provider = google-beta

  project       = google_firebase_project.this.project
  display_name  = var.android_app_display_name
  package_name  = var.android_package_name
  sha1_hashes   = local.android_sha1_hashes
  sha256_hashes = local.android_sha256_hashes

  depends_on = [
    google_identity_platform_config.auth,
  ]
}

data "google_firebase_android_app_config" "android" {
  count = var.create_android_app ? 1 : 0

  provider = google-beta

  project = google_firebase_project.this.project
  app_id  = google_firebase_android_app.android[0].app_id
}

resource "google_firebase_apple_app" "apple" {
  count = var.create_apple_app ? 1 : 0

  provider = google-beta

  project      = google_firebase_project.this.project
  display_name = var.apple_app_display_name
  bundle_id    = var.apple_bundle_id

  depends_on = [
    google_identity_platform_config.auth,
  ]
}

data "google_firebase_apple_app_config" "apple" {
  count = var.create_apple_app ? 1 : 0

  provider = google-beta

  project = google_firebase_project.this.project
  app_id  = google_firebase_apple_app.apple[0].app_id
}

resource "google_artifact_registry_repository" "auth_api" {
  provider = google-beta

  project       = google_firebase_project.this.project
  location      = var.region
  repository_id = var.auth_api_artifact_registry_repository_id
  format        = "DOCKER"
  description   = "Docker images for the Todo App auth API."

  depends_on = [
    google_project_service.required,
  ]
}

resource "google_project_iam_member" "cloud_build_builder" {
  for_each = local.cloud_build_service_account_emails

  provider = google-beta

  project = google_firebase_project.this.project
  role    = "roles/cloudbuild.builds.builder"
  member  = "serviceAccount:${each.value}"

  depends_on = [
    google_project_service.required,
  ]
}

resource "google_project_iam_member" "cloud_build_source_object_viewer" {
  for_each = local.cloud_build_service_account_emails

  provider = google-beta

  project = google_firebase_project.this.project
  role    = "roles/storage.objectViewer"
  member  = "serviceAccount:${each.value}"

  depends_on = [
    google_project_service.required,
  ]
}

resource "google_artifact_registry_repository_iam_member" "auth_api_cloud_build_writer" {
  for_each = local.cloud_build_service_account_emails

  provider = google-beta

  project    = google_firebase_project.this.project
  location   = google_artifact_registry_repository.auth_api.location
  repository = google_artifact_registry_repository.auth_api.name
  role       = "roles/artifactregistry.writer"
  member     = "serviceAccount:${each.value}"
}

resource "terraform_data" "auth_api_image" {
  count = var.build_auth_api_image ? 1 : 0

  triggers_replace = {
    image       = local.auth_api_built_container_image
    source_hash = local.auth_api_source_hash
  }

  provisioner "local-exec" {
    command = "gcloud builds submit \"$AUTH_API_SOURCE_DIR\" --project \"$GOOGLE_CLOUD_PROJECT\" --region \"$GOOGLE_CLOUD_REGION\" --tag \"$AUTH_API_IMAGE\""

    environment = {
      AUTH_API_IMAGE       = local.auth_api_built_container_image
      AUTH_API_SOURCE_DIR  = var.auth_api_source_dir
      GOOGLE_CLOUD_PROJECT = google_firebase_project.this.project
      GOOGLE_CLOUD_REGION  = var.region
    }
  }

  depends_on = [
    google_artifact_registry_repository_iam_member.auth_api_cloud_build_writer,
    google_project_iam_member.cloud_build_builder,
    google_project_iam_member.cloud_build_source_object_viewer,
  ]
}

resource "google_service_account" "auth_api" {
  provider = google-beta

  project      = google_firebase_project.this.project
  account_id   = var.auth_api_service_account_id
  display_name = "Todo App Auth API"

  depends_on = [
    google_project_service.required,
  ]
}

resource "google_project_iam_member" "auth_api_firebase_auth_admin" {
  provider = google-beta

  project = google_firebase_project.this.project
  role    = "roles/firebaseauth.admin"
  member  = "serviceAccount:${google_service_account.auth_api.email}"
}

resource "google_service_account_iam_member" "auth_api_token_creator" {
  provider = google-beta

  service_account_id = google_service_account.auth_api.name
  role               = "roles/iam.serviceAccountTokenCreator"
  member             = "serviceAccount:${google_service_account.auth_api.email}"
}

resource "google_cloud_run_v2_service" "auth_api" {
  provider = google-beta

  project             = google_firebase_project.this.project
  name                = var.auth_api_service_name
  location            = var.region
  deletion_protection = false

  template {
    service_account = google_service_account.auth_api.email

    scaling {
      min_instance_count = var.auth_api_min_instance_count
      max_instance_count = var.auth_api_max_instance_count
    }

    containers {
      image = local.auth_api_container_image

      ports {
        container_port = 8080
      }

      env {
        name  = "FIREBASE_PROJECT_ID"
        value = google_firebase_project.this.project
      }

      env {
        name  = "AUTH_WEB_ORIGINS"
        value = join(",", local.auth_api_cors_origins)
      }

      resources {
        limits = {
          cpu    = var.auth_api_cpu_limit
          memory = var.auth_api_memory_limit
        }
      }
    }
  }

  lifecycle {
    precondition {
      condition     = var.build_auth_api_image || length(trimspace(var.auth_api_container_image)) > 0
      error_message = "auth_api_container_image is required when build_auth_api_image is false."
    }

    precondition {
      condition     = !var.build_auth_api_image || var.auth_api_source_dir != null
      error_message = "auth_api_source_dir is required when build_auth_api_image is true."
    }
  }

  depends_on = [
    google_project_iam_member.auth_api_firebase_auth_admin,
    google_service_account_iam_member.auth_api_token_creator,
    terraform_data.auth_api_image,
  ]
}

resource "google_cloud_run_v2_service_iam_member" "auth_api_public" {
  count = var.auth_api_allow_unauthenticated ? 1 : 0

  provider = google-beta

  project  = google_firebase_project.this.project
  location = google_cloud_run_v2_service.auth_api.location
  name     = google_cloud_run_v2_service.auth_api.name
  role     = "roles/run.invoker"
  member   = "allUsers"
}

resource "terraform_data" "firebase_hosting_deploy" {
  count = var.deploy_firebase_hosting ? 1 : 0

  triggers_replace = {
    config_hash  = local.firebase_hosting_hash
    project      = google_firebase_project.this.project
    service_name = google_cloud_run_v2_service.auth_api.name
    service_uri  = google_cloud_run_v2_service.auth_api.uri
  }

  provisioner "local-exec" {
    command     = "npx --yes firebase-tools deploy --only hosting --project \"$FIREBASE_PROJECT_ID\" --non-interactive"
    working_dir = var.firebase_hosting_working_dir

    environment = {
      FIREBASE_PROJECT_ID = google_firebase_project.this.project
    }
  }

  lifecycle {
    precondition {
      condition     = !var.deploy_firebase_hosting || var.firebase_hosting_working_dir != null
      error_message = "firebase_hosting_working_dir is required when deploy_firebase_hosting is true."
    }

    precondition {
      condition     = !var.deploy_firebase_hosting || var.firebase_hosting_public_dir != null
      error_message = "firebase_hosting_public_dir is required when deploy_firebase_hosting is true."
    }

    precondition {
      condition     = !var.deploy_firebase_hosting || var.firebase_config_path != null
      error_message = "firebase_config_path is required when deploy_firebase_hosting is true."
    }
  }

  depends_on = [
    google_cloud_run_v2_service.auth_api,
    google_cloud_run_v2_service_iam_member.auth_api_public,
  ]
}
