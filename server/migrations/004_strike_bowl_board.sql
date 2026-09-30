-- Strike Bowl immutable board: 5-frame game, 0..150 points. A full game needs 6..11 balls,
-- each ball takes at least ~2 s of real rolling time, so the fastest honest game is > 12 s.
INSERT IGNORE INTO game_lb_boards
(namespace,id,rules_version,direction,min_score,max_score,min_duration_ms,max_duration_ms,`open`)
VALUES
('production','strike5-v1','v1','desc',0,150,12000,1800000,TRUE);
