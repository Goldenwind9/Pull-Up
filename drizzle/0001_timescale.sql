-- Turns `activity` into a TimescaleDB hypertable and adds the crew_weekly
-- continuous aggregate (from the architecture doc, pages 5-6).
-- WITH NO DATA lets this run inside Drizzle's migration transaction.
-- materialized_only = false: stats include rows newer than the last refresh,
-- so a quest finished live on stage shows up immediately.
SELECT create_hypertable('activity', 'time');
--> statement-breakpoint
CREATE MATERIALIZED VIEW crew_weekly
WITH (timescaledb.continuous, timescaledb.materialized_only = false) AS
SELECT time_bucket('7 days', time) AS week,
       crew_id,
       count(*) FILTER (WHERE kind = 'quest_completed') AS quests_done,
       count(*) FILTER (WHERE kind = 'proof_submitted') AS photos,
       count(*) FILTER (WHERE kind = 'voted')           AS votes
FROM activity
GROUP BY week, crew_id
WITH NO DATA;
--> statement-breakpoint
SELECT add_continuous_aggregate_policy('crew_weekly',
  start_offset => INTERVAL '2 months',
  end_offset   => INTERVAL '1 hour',
  schedule_interval => INTERVAL '15 minutes');
