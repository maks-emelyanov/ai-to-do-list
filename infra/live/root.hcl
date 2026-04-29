remote_state {
  backend = "gcs"

  config = {
    bucket = "todoapp-terraform-state-maks"
    prefix = "todoapp/firebase-auth/${path_relative_to_include()}"
  }
}
