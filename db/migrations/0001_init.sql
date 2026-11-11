-- 0001_init.sql
-- Connected App とアプリ種別ごとの設定。

CREATE TABLE connected_apps (
  id CHAR(36) NOT NULL,
  app_type VARCHAR(32) NOT NULL,
  created_at DATETIME(3) NOT NULL,
  updated_at DATETIME(3) NOT NULL,
  PRIMARY KEY (id),
  CONSTRAINT connected_apps_app_type_check
    CHECK (app_type IN ('codex', 'opencode'))
) ENGINE = InnoDB
  DEFAULT CHARSET = utf8mb4
  COLLATE = utf8mb4_0900_ai_ci;

CREATE TABLE codex_connected_apps (
  id CHAR(36) NOT NULL,
  connected_app_id CHAR(36) NOT NULL,
  binary_path VARCHAR(255) NOT NULL,
  sandbox VARCHAR(32) NOT NULL,
  approval_policy VARCHAR(32) NOT NULL,
  app_server_url VARCHAR(1024) NULL,
  created_at DATETIME(3) NOT NULL,
  updated_at DATETIME(3) NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY codex_connected_apps_connected_app_id_unique (connected_app_id),
  CONSTRAINT codex_connected_apps_connected_app_id_fkey
    FOREIGN KEY (connected_app_id) REFERENCES connected_apps (id)
    ON DELETE CASCADE,
  CONSTRAINT codex_connected_apps_sandbox_check
    CHECK (sandbox IN ('read-only', 'workspace-write', 'danger-full-access')),
  CONSTRAINT codex_connected_apps_approval_policy_check
    CHECK (approval_policy IN ('never', 'on-request', 'untrusted'))
) ENGINE = InnoDB
  DEFAULT CHARSET = utf8mb4
  COLLATE = utf8mb4_0900_ai_ci;

CREATE TABLE opencode_connected_apps (
  id CHAR(36) NOT NULL,
  connected_app_id CHAR(36) NOT NULL,
  binary_path VARCHAR(255) NOT NULL,
  port INT UNSIGNED NOT NULL,
  created_at DATETIME(3) NOT NULL,
  updated_at DATETIME(3) NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY opencode_connected_apps_connected_app_id_unique (connected_app_id),
  CONSTRAINT opencode_connected_apps_connected_app_id_fkey
    FOREIGN KEY (connected_app_id) REFERENCES connected_apps (id)
    ON DELETE CASCADE
) ENGINE = InnoDB
  DEFAULT CHARSET = utf8mb4
  COLLATE = utf8mb4_0900_ai_ci;

CREATE TABLE app_state (
  id CHAR(36) NOT NULL,
  last_open_connected_app_id CHAR(36) NULL,
  created_at DATETIME(3) NOT NULL,
  updated_at DATETIME(3) NOT NULL,
  PRIMARY KEY (id),
  CONSTRAINT app_state_last_open_connected_app_id_fkey
    FOREIGN KEY (last_open_connected_app_id) REFERENCES connected_apps (id)
    ON DELETE SET NULL
) ENGINE = InnoDB
  DEFAULT CHARSET = utf8mb4
  COLLATE = utf8mb4_0900_ai_ci;
