-- Strike Bowl: keep the validated roll sequence of each accepted run, and index daily reads.
-- Additive and retry-safe.
ALTER TABLE game_lb_runs
 ADD COLUMN IF NOT EXISTS rolls_json VARCHAR(96) NULL;
ALTER TABLE game_lb_runs
 ADD INDEX IF NOT EXISTS board_day (namespace,board_id,submitted_at);
