locals {
  service_name = "distributed-lock-redis"
  tags = {
    Name               = local.service_name
    Application        = local.service_name
    ManagedBy          = "Terraform"
    Owner              = "louis79719@gmail.com"
  }
}