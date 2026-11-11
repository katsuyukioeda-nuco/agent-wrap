-- 0003_drop_connected_app_model.sql
-- モデルはハーネス側のデフォルトを使う。Connected App では指定しない。

ALTER TABLE connected_apps DROP COLUMN model;
