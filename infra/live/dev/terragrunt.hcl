include "root" {
  path = find_in_parent_folders("root.hcl")
}

locals {
  env_config = read_terragrunt_config("env.hcl")
}

terraform {
  source = "../../modules/firebase-auth"
}

inputs = merge(
  local.env_config.locals.inputs,
  {
    region                       = "us-east1"
    build_auth_api_image         = true
    auth_api_source_dir          = "${get_terragrunt_dir()}/../../../apps/auth-api"
    auth_api_image_tag           = get_env("AUTH_API_IMAGE_TAG", "dev")
    auth_api_service_name        = "todoapp-auth-api"
    auth_api_max_instance_count  = 3
    deploy_firebase_hosting      = true
    firebase_hosting_working_dir = "${get_terragrunt_dir()}/../../.."
    firebase_hosting_public_dir  = "${get_terragrunt_dir()}/../../../apps/auth-web/public"
    firebase_config_path         = "${get_terragrunt_dir()}/../../../firebase.json"
  }
)
