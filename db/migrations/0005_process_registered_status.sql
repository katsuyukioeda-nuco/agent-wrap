-- 0005_process_registered_status.sql
-- 登録だけ行ったプロセス定義を表す 'registered' を許可する。

ALTER TABLE process_definitions
  DROP CHECK process_definitions_status_check;

ALTER TABLE process_definitions
  ADD CONSTRAINT process_definitions_status_check
  CHECK (
    status IN ('registered', 'starting', 'running', 'exited', 'failed', 'killed')
  );
