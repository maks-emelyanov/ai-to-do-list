variable "project_id" {
  description = "Google Cloud project ID to create or manage."
  type        = string
}

variable "project_name" {
  description = "Human-readable Google Cloud project name."
  type        = string
}

variable "create_project" {
  description = "Whether Terraform should create the Google Cloud project. Set false to enable Firebase/Auth on an existing project."
  type        = bool
  default     = true
}

variable "billing_account" {
  description = "Billing account ID to attach to the project. Required when create_project is true and for Identity Platform/Firebase Auth managed by Terraform."
  type        = string
  default     = null
}

variable "folder_id" {
  description = "Folder ID for a newly created project. Leave null if using org_id or an existing project."
  type        = string
  default     = null
}

variable "org_id" {
  description = "Organization ID for a newly created project. Leave null if using folder_id or an existing project."
  type        = string
  default     = null
}

variable "labels" {
  description = "Labels to apply to a newly created project."
  type        = map(string)
  default     = {}
}

variable "region" {
  description = "Google Cloud region for regional app infrastructure. This project standardizes on us-east1."
  type        = string
  default     = "us-east1"

  validation {
    condition     = var.region == "us-east1"
    error_message = "Only us-east1 is supported for regional resources."
  }
}

variable "firebase_web_app_display_name" {
  description = "Display name for the Firebase Web App used by Expo."
  type        = string
  default     = "Todo App"
}

variable "create_android_app" {
  description = "Whether to register a Firebase Android App."
  type        = bool
  default     = false
}

variable "android_app_display_name" {
  description = "Display name for the Firebase Android App."
  type        = string
  default     = "Todo App Android"
}

variable "android_package_name" {
  description = "Android package name for the Firebase Android App, for example com.example.todoapp."
  type        = string
  default     = null
}

variable "android_sha1_hashes" {
  description = "SHA-1 certificate hashes for the Firebase Android App. Values may include colons and uppercase letters; the module normalizes them."
  type        = list(string)
  default     = []
}

variable "android_sha256_hashes" {
  description = "SHA-256 certificate hashes for the Firebase Android App. Values may include colons and uppercase letters; the module normalizes them."
  type        = list(string)
  default     = []
}

variable "create_apple_app" {
  description = "Whether to register a Firebase Apple App."
  type        = bool
  default     = false
}

variable "apple_app_display_name" {
  description = "Display name for the Firebase Apple App."
  type        = string
  default     = "Todo App iOS"
}

variable "apple_bundle_id" {
  description = "Apple bundle ID for the Firebase Apple App, for example com.example.todoapp."
  type        = string
  default     = null
}

variable "autodelete_anonymous_users" {
  description = "Whether Firebase Auth should automatically delete anonymous users."
  type        = bool
  default     = true
}

variable "allow_duplicate_emails" {
  description = "Whether to allow multiple accounts to share an email address."
  type        = bool
  default     = false
}

variable "authorized_domains" {
  description = "Domains authorized for Firebase Auth redirects and email action links."
  type        = list(string)
  default     = ["localhost"]
}

variable "enable_email_sign_in" {
  description = "Whether to enable email sign-in."
  type        = bool
  default     = true
}

variable "email_password_required" {
  description = "When true, email sign-in requires a password. Set false for email link passwordless sign-in."
  type        = bool
  default     = true
}

variable "enable_anonymous_sign_in" {
  description = "Whether to enable anonymous sign-in."
  type        = bool
  default     = false
}

variable "enable_phone_sign_in" {
  description = "Whether to enable phone number sign-in."
  type        = bool
  default     = false
}

variable "phone_test_numbers" {
  description = "Map of phone numbers to verification codes for phone auth testing."
  type        = map(string)
  default     = {}
  sensitive   = true
}

variable "google_auth_provider" {
  description = "Google Firebase Auth provider configuration."
  type = object({
    enabled       = bool
    client_id     = string
    client_secret = string
  })
  default = {
    enabled       = false
    client_id     = ""
    client_secret = ""
  }
  sensitive = true

  validation {
    condition = (
      !var.google_auth_provider.enabled ||
      (
        length(trimspace(var.google_auth_provider.client_id)) > 0 &&
        length(trimspace(var.google_auth_provider.client_secret)) > 0 &&
        can(regex("^[0-9]+-[A-Za-z0-9_-]+\\.apps\\.googleusercontent\\.com$", trimspace(var.google_auth_provider.client_id)))
      )
    )
    error_message = "When google_auth_provider.enabled is true, client_id must be a Google OAuth web client ID ending in apps.googleusercontent.com, and client_secret is required."
  }
}

variable "apple_auth_provider" {
  description = "Apple Firebase Auth provider configuration."
  type = object({
    enabled       = bool
    client_id     = string
    client_secret = string
  })
  default = {
    enabled       = false
    client_id     = ""
    client_secret = ""
  }
  sensitive = true

  validation {
    condition = (
      !var.apple_auth_provider.enabled ||
      (
        length(trimspace(var.apple_auth_provider.client_id)) > 0 &&
        length(trimspace(var.apple_auth_provider.client_secret)) > 0
      )
    )
    error_message = "When apple_auth_provider.enabled is true, client_id and client_secret are required."
  }
}

variable "microsoft_auth_provider" {
  description = "Microsoft Firebase Auth provider configuration."
  type = object({
    enabled       = bool
    client_id     = string
    client_secret = string
  })
  default = {
    enabled       = false
    client_id     = ""
    client_secret = ""
  }
  sensitive = true

  validation {
    condition = (
      !var.microsoft_auth_provider.enabled ||
      (
        length(trimspace(var.microsoft_auth_provider.client_id)) > 0 &&
        length(trimspace(var.microsoft_auth_provider.client_secret)) > 0
      )
    )
    error_message = "When microsoft_auth_provider.enabled is true, client_id and client_secret are required."
  }
}

variable "auth_api_service_name" {
  description = "Cloud Run service name for the auth token exchange API."
  type        = string
  default     = "todoapp-auth-api"
}

variable "auth_api_service_account_id" {
  description = "Service account ID for the Cloud Run auth API runtime."
  type        = string
  default     = "todoapp-auth-api"
}

variable "auth_api_artifact_registry_repository_id" {
  description = "Artifact Registry Docker repository ID for auth API images."
  type        = string
  default     = "todoapp"
}

variable "auth_api_image_name" {
  description = "Docker image name within the auth API Artifact Registry repository."
  type        = string
  default     = "auth-api"
}

variable "auth_api_image_tag" {
  description = "Docker image tag for the auth API image built by Terragrunt/Terraform."
  type        = string
  default     = "latest"
}

variable "auth_api_container_image" {
  description = "Prebuilt auth API container image URI. Required when build_auth_api_image is false."
  type        = string
  default     = ""
}

variable "build_auth_api_image" {
  description = "Whether Terraform should build and push the auth API image with Cloud Build before deploying Cloud Run."
  type        = bool
  default     = false
}

variable "auth_api_source_dir" {
  description = "Local path to apps/auth-api. Required when build_auth_api_image is true."
  type        = string
  default     = null
}

variable "auth_api_min_instance_count" {
  description = "Minimum Cloud Run instances for the auth API. Keep 0 for free-tier-friendly idle behavior."
  type        = number
  default     = 0
}

variable "auth_api_max_instance_count" {
  description = "Maximum Cloud Run instances for the auth API."
  type        = number
  default     = 10
}

variable "auth_api_cpu_limit" {
  description = "Cloud Run CPU limit for the auth API container."
  type        = string
  default     = "1"
}

variable "auth_api_memory_limit" {
  description = "Cloud Run memory limit for the auth API container."
  type        = string
  default     = "512Mi"
}

variable "auth_api_cors_origins" {
  description = "Optional CORS origins for direct auth API calls. Same-origin Firebase Hosting rewrites do not require CORS."
  type        = list(string)
  default     = []
}

variable "auth_api_allow_unauthenticated" {
  description = "Whether to grant allUsers Cloud Run invoker. Firebase Hosting rewrites require the service to be publicly invokable."
  type        = bool
  default     = true
}

variable "deploy_firebase_hosting" {
  description = "Whether Terraform should deploy Firebase Hosting after Cloud Run is ready."
  type        = bool
  default     = false
}

variable "firebase_hosting_working_dir" {
  description = "Directory where firebase.json lives. Required when deploy_firebase_hosting is true."
  type        = string
  default     = null
}

variable "firebase_hosting_public_dir" {
  description = "Directory containing Firebase Hosting static files. Required when deploy_firebase_hosting is true."
  type        = string
  default     = null
}

variable "firebase_config_path" {
  description = "Path to firebase.json. Required when deploy_firebase_hosting is true."
  type        = string
  default     = null
}
