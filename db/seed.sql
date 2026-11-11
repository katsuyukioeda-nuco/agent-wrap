-- 開発用のサンプルユーザー。db:seed で適用する。
INSERT IGNORE INTO users (id, name, email, created_at) VALUES
  ('0190a000-0000-7000-8000-000000000001', 'Alice', 'alice@example.com', UTC_TIMESTAMP(3)),
  ('0190a000-0000-7000-8000-000000000002', 'Bob', 'bob@example.com', UTC_TIMESTAMP(3));
