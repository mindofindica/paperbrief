-- Fix tracks.min_score column type: smallint → numeric
-- Templates use float values like 0.65; smallint was rejecting them silently.
ALTER TABLE tracks ALTER COLUMN min_score TYPE numeric USING min_score::numeric;
