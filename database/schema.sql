-- ============================================================
-- Ban-Pick EFB  –  Database Schema (MySQL)
-- Run once to set up all tables.
-- To refresh player data run:  npm run scrape
-- ============================================================

DROP DATABASE IF EXISTS ban_pick_efb;
CREATE DATABASE IF NOT EXISTS ban_pick_efb
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE ban_pick_efb;

-- ------------------------------------------------------------
-- 0a. SCRAPE_LOGS  (one row per `npm run scrape` run)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS scrape_logs (
  id               INT UNSIGNED        NOT NULL AUTO_INCREMENT,
  scrape_type      ENUM('full','incremental') NOT NULL DEFAULT 'full',
  started_at       TIMESTAMP           NOT NULL DEFAULT CURRENT_TIMESTAMP,
  finished_at      TIMESTAMP           NULL,
  players_upserted INT UNSIGNED        NULL,
  -- highest pesdb_id seen in this run; used as the cutoff for the next run
  max_pesdb_id     BIGINT UNSIGNED     NULL,

  PRIMARY KEY (id)
) ENGINE=InnoDB;

-- ------------------------------------------------------------
-- 0b. PLAYERS_CATALOG  (scraped from pesdb.net via `npm run scrape`)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS players_catalog (
  id           INT UNSIGNED      NOT NULL AUTO_INCREMENT,
  -- pesdb.net uses 15-digit IDs for newer cards → requires BIGINT
  pesdb_id     BIGINT UNSIGNED   NOT NULL,
  name         VARCHAR(100)      NOT NULL,
  position     VARCHAR(15)       NULL,
  -- Dream Team – Level 1 overall (from player detail ?id=)
  overall      SMALLINT UNSIGNED NULL,
  -- Dream Team – Max Level overall (?id=&mode=max_level); NULL if unknown
  overall_max  SMALLINT UNSIGNED NULL,
  club         VARCHAR(100)      NULL,
  league       VARCHAR(120)      NULL,
  nationality  VARCHAR(100)      NULL,
  height       SMALLINT UNSIGNED NULL COMMENT 'cm',
  weight       SMALLINT UNSIGNED NULL COMMENT 'kg',
  age          TINYINT UNSIGNED  NULL,
  card_type    VARCHAR(120)      NULL COMMENT 'Standard, Highlight, featured pool, etc.',
  region       VARCHAR(80)       NULL,
  foot         VARCHAR(40)       NULL,
  playing_style VARCHAR(80)      NULL,

  PRIMARY KEY (id),
  UNIQUE KEY uq_catalog_pesdb_id (pesdb_id),
  KEY idx_catalog_overall (overall),
  KEY idx_catalog_overall_max (overall_max),
  KEY idx_catalog_league (league)
) ENGINE=InnoDB;

-- Existing DBs created before detail columns: run in mysql once (skip columns that already exist):
-- ALTER TABLE players_catalog
--   ADD COLUMN overall_max     SMALLINT UNSIGNED NULL COMMENT 'Dream Team overall at max level' AFTER overall,
--   ADD COLUMN league          VARCHAR(120)      NULL AFTER club,
--   ADD COLUMN card_type       VARCHAR(120)      NULL COMMENT 'Standard, Highlight, or featured pool name' AFTER age,
--   ADD COLUMN region          VARCHAR(80)       NULL AFTER card_type,
--   ADD COLUMN foot            VARCHAR(40)       NULL AFTER region,
--   ADD COLUMN playing_style   VARCHAR(80)       NULL AFTER foot,
--   ADD KEY idx_catalog_overall_max (overall_max),
--   ADD KEY idx_catalog_league (league);
--
-- If your DB still has card_label, rename once:
-- ALTER TABLE players_catalog CHANGE COLUMN card_label card_type VARCHAR(120) NULL COMMENT 'Standard, Highlight, featured pool, etc.';

-- ------------------------------------------------------------
-- 1. USERS
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  id           INT UNSIGNED    NOT NULL AUTO_INCREMENT,
  username     VARCHAR(50)     NOT NULL,
  email        VARCHAR(255)    NOT NULL,
  -- NULL when the account was created via Google OAuth
  password     VARCHAR(255)    NULL,
  -- grants the /console dashboard; the console still re-checks the password
  is_admin     TINYINT(1)      NOT NULL DEFAULT 0,
  created_at   TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,

  PRIMARY KEY (id),
  UNIQUE KEY uq_users_username (username),
  UNIQUE KEY uq_users_email    (email)
) ENGINE=InnoDB;

-- Existing DBs created before the console moved off the shared ADMIN_KEY:
--   ALTER TABLE users ADD COLUMN is_admin TINYINT(1) NOT NULL DEFAULT 0 AFTER password;
-- You do not have to set this by hand: the server seeds the first admin on boot
-- (src/features/admin/bootstrap.js) and every admin after that is granted from
-- the console's USERS tab. This still works as a last resort:
--   UPDATE users SET is_admin = 1 WHERE email = 'you@example.com';

-- ------------------------------------------------------------
-- 2. PLAYERS  (user's personal squad roster)
-- Migration for existing databases:
--   ALTER TABLE players
--     ADD COLUMN pesdb_id BIGINT UNSIGNED NULL AFTER overall,
--     ADD UNIQUE KEY uq_players_user_pesdb (user_id, pesdb_id);
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS players (
  id           INT UNSIGNED    NOT NULL AUTO_INCREMENT,
  user_id      INT UNSIGNED    NOT NULL,
  name         VARCHAR(100)    NOT NULL,
  -- e.g. GK | CB | LB | RB | CDM | CM | CAM | LW | RW | ST
  position     VARCHAR(10)     NOT NULL,
  club         VARCHAR(100)    NULL,
  overall      SMALLINT UNSIGNED NULL,   -- same range as players_catalog.overall
  -- links to players_catalog.pesdb_id (nullable for manually added players)
  pesdb_id     BIGINT UNSIGNED  NULL,
  created_at   TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,

  PRIMARY KEY (id),
  -- prevent adding the same catalog player twice per user
  UNIQUE KEY uq_players_user_pesdb (user_id, pesdb_id),
  CONSTRAINT fk_players_user
    FOREIGN KEY (user_id) REFERENCES users (id)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB;

-- ------------------------------------------------------------
-- 3. GAME_PLANS
--    A user may have at most 20 game plans (enforced in app).
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS game_plans (
  id           INT UNSIGNED    NOT NULL AUTO_INCREMENT,
  user_id      INT UNSIGNED    NOT NULL,
  name         VARCHAR(100)    NOT NULL,
  -- e.g. '4-3-3', '4-2-3-1', '3-5-2'
  formation    VARCHAR(20)     NULL,
  created_at   TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,

  PRIMARY KEY (id),
  CONSTRAINT fk_game_plans_user
    FOREIGN KEY (user_id) REFERENCES users (id)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB;

-- ------------------------------------------------------------
-- 4. GAME_PLAN_PLAYERS  (junction table)
--    slot 1–11  → LINEUP
--    slot 12–23 → SUB
--    Max 23 players per plan (enforced via slot range + unique key).
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS game_plan_players (
  id            INT UNSIGNED    NOT NULL AUTO_INCREMENT,
  game_plan_id  INT UNSIGNED    NOT NULL,
  player_id     INT UNSIGNED    NOT NULL,
  role          ENUM('LINEUP','SUB') NOT NULL,
  -- 1-11 for starters, 12-23 for substitutes
  slot          TINYINT UNSIGNED NOT NULL CHECK (slot BETWEEN 1 AND 23),

  PRIMARY KEY (id),
  -- one player per slot per plan
  UNIQUE KEY uq_gpp_plan_slot   (game_plan_id, slot),
  -- no duplicate players within the same plan
  UNIQUE KEY uq_gpp_plan_player (game_plan_id, player_id),

  CONSTRAINT fk_gpp_game_plan
    FOREIGN KEY (game_plan_id) REFERENCES game_plans (id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_gpp_player
    FOREIGN KEY (player_id) REFERENCES players (id)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB;
