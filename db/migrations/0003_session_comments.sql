-- 0003_session_comments.sql
-- セッションに保存されたコメント。MCP ツールから未読分を取得する。

CREATE TABLE session_comments (
  id CHAR(36) NOT NULL,
  connected_app_id CHAR(36) NOT NULL,
  session_id VARCHAR(255) NOT NULL,
  kind VARCHAR(16) NOT NULL,
  path VARCHAR(2048) NOT NULL,
  repo_path VARCHAR(2048) NOT NULL DEFAULT '.',
  start_line INT NULL,
  end_line INT NULL,
  side VARCHAR(16) NULL,
  selection MEDIUMTEXT NOT NULL,
  comment TEXT NOT NULL,
  attachment_path VARCHAR(2048) NULL,
  created_at DATETIME(3) NOT NULL,
  done_at DATETIME(3) NULL,
  PRIMARY KEY (id),
  KEY session_comments_pending_idx (
    connected_app_id,
    session_id,
    done_at,
    created_at
  ),
  CONSTRAINT session_comments_connected_app_id_fkey
    FOREIGN KEY (connected_app_id) REFERENCES connected_apps (id)
    ON DELETE CASCADE,
  CONSTRAINT session_comments_kind_check
    CHECK (kind IN ('file', 'diff')),
  CONSTRAINT session_comments_side_check
    CHECK (side IS NULL OR side IN ('old', 'new', 'both'))
) ENGINE = InnoDB
  DEFAULT CHARSET = utf8mb4
  COLLATE = utf8mb4_0900_ai_ci;
