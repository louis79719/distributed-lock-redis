resource "aws_dynamodb_table" "accounts" {
  name         = "accounts"
  hash_key     = "id"
  billing_mode = "PAY_PER_REQUEST"

  attribute {
    name = "id"
    type = "S"
  }

  stream_enabled = false

  tags = local.tags
}