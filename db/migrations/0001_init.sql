-- 0001_init.sql
-- schema.ts の User / Todo に対応する初期スキーマ。

CREATE TABLE users (
  id CHAR(36) NOT NULL,
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255) NOT NULL,
  created_at DATETIME(3) NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY users_email_unique (email)
) ENGINE = InnoDB
  DEFAULT CHARSET = utf8mb4
  COLLATE = utf8mb4_0900_ai_ci;

CREATE TABLE todos (
  id CHAR(36) NOT NULL,
  title VARCHAR(255) NOT NULL,
  author_id CHAR(36) NOT NULL,
  created_at DATETIME(3) NOT NULL,
  updated_at DATETIME(3) NOT NULL,
  PRIMARY KEY (id),
  KEY todos_author_id_index (author_id),
  CONSTRAINT todos_author_id_fkey
    FOREIGN KEY (author_id) REFERENCES users (id)
    ON DELETE CASCADE
) ENGINE = InnoDB
  DEFAULT CHARSET = utf8mb4
  COLLATE = utf8mb4_0900_ai_ci;
