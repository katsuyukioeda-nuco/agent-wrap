-- 0002_claude.sql
-- Claude Code アプリの追加。

ALTER TABLE connected_apps
  DROP CHECK connected_apps_app_type_check,
  ADD CONSTRAINT connected_apps_app_type_check
    CHECK (app_type IN ('codex', 'opencode', 'claude'));

CREATE TABLE claude_connected_apps (
  id CHAR(36) NOT NULL,
  connected_app_id CHAR(36) NOT NULL,
  binary_path VARCHAR(255) NULL,
  permission_mode VARCHAR(32) NOT NULL,
  model VARCHAR(128) NULL,
  created_at DATETIME(3) NOT NULL,
  updated_at DATETIME(3) NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY claude_connected_apps_connected_app_id_unique (connected_app_id),
  CONSTRAINT claude_connected_apps_connected_app_id_fkey
    FOREIGN KEY (connected_app_id) REFERENCES connected_apps (id)
    ON DELETE CASCADE,
  CONSTRAINT claude_connected_apps_permission_mode_check
    CHECK (permission_mode IN ('default', 'acceptEdits', 'plan', 'bypassPermissions'))
) ENGINE = InnoDB
  DEFAULT CHARSET = utf8mb4
  COLLATE = utf8mb4_0900_ai_ci;
