/**
 * `matches` is the raw ingest and doubles as the P2 backtest set: ten hero ids
 * plus who won is exactly a backtest row, so the engine needs no separate pull.
 *
 * `advantage` and `confidence` are stored computed rather than derived at query
 * time because the mobile app scores offline from a snapshot and cannot run SQL.
 */
export const SCHEMA = `
CREATE TABLE IF NOT EXISTS matches (
  match_id      BIGINT PRIMARY KEY,
  start_time    BIGINT  NOT NULL,
  avg_rank_tier SMALLINT,
  bracket       SMALLINT,              -- 1 Herald .. 7 Divine (Immortal folds into 7)
  radiant_win   BOOLEAN NOT NULL,
  radiant_team  SMALLINT[] NOT NULL,
  dire_team     SMALLINT[] NOT NULL
);
CREATE INDEX IF NOT EXISTS matches_start_time ON matches (start_time);
CREATE INDEX IF NOT EXISTS matches_bracket ON matches (bracket);

CREATE TABLE IF NOT EXISTS hero_stats (
  hero_id   SMALLINT NOT NULL,
  bracket   SMALLINT NOT NULL,
  patch     TEXT     NOT NULL,
  games     INTEGER  NOT NULL,
  wins      INTEGER  NOT NULL,
  win_rate  REAL     NOT NULL,
  PRIMARY KEY (hero_id, bracket, patch)
);

CREATE TABLE IF NOT EXISTS matchups (
  hero_id    SMALLINT NOT NULL,
  vs_hero_id SMALLINT NOT NULL,
  bracket    SMALLINT NOT NULL,
  patch      TEXT     NOT NULL,
  games      INTEGER  NOT NULL,
  wins       INTEGER  NOT NULL,
  advantage  REAL     NOT NULL,        -- adjustedWR(A|B) - WR(A), shrunk
  confidence REAL     NOT NULL,        -- games / (games + k)
  PRIMARY KEY (hero_id, vs_hero_id, bracket, patch)
);

CREATE TABLE IF NOT EXISTS synergies (
  hero_id      SMALLINT NOT NULL,
  with_hero_id SMALLINT NOT NULL,
  bracket      SMALLINT NOT NULL,
  patch        TEXT     NOT NULL,
  games        INTEGER  NOT NULL,
  wins         INTEGER  NOT NULL,
  synergy      REAL     NOT NULL,
  confidence   REAL     NOT NULL,
  PRIMARY KEY (hero_id, with_hero_id, bracket, patch)
);

CREATE TABLE IF NOT EXISTS ingest_runs (
  id            SERIAL PRIMARY KEY,
  started_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at   TIMESTAMPTZ,
  from_match_id BIGINT,
  to_match_id   BIGINT,
  matches_added INTEGER
);
`;
