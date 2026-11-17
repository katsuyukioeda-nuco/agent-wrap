-- 0004_process_definitions.sql
-- エージェントが起動したプロセス。MCP ツールから一覧・ログ・停止を扱う。

CREATE TABLE process_definitions (
  id CHAR(36) NOT NULL,
  connected_app_id CHAR(36) NOT NULL,
  session_id VARCHAR(255) NOT NULL,
  name VARCHAR(255) NOT NULL,
  cwd VARCHAR(2048) NOT NULL,
  command TEXT NOT NULL,
  pid INT NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'starting',
  exit_code INT NULL,
  exit_signal VARCHAR(32) NULL,
  log_path VARCHAR(2048) NOT NULL,
  created_at DATETIME(3) NOT NULL,
  started_at DATETIME(3) NULL,
  ended_at DATETIME(3) NULL,
  updated_at DATETIME(3) NOT NULL,
  PRIMARY KEY (id),
  KEY process_definitions_session_idx (
    connected_app_id,
    session_id,
    created_at
  ),
  KEY process_definitions_status_idx (status),
  CONSTRAINT process_definitions_connected_app_id_fkey
    FOREIGN KEY (connected_app_id) REFERENCES connected_apps (id)
    ON DELETE CASCADE,
  CONSTRAINT process_definitions_status_check
    CHECK (status IN ('starting', 'running', 'exited', 'failed', 'killed'))
) ENGINE = InnoDB
  DEFAULT CHARSET = utf8mb4
  COLLATE = utf8mb4_0900_ai_ci;
