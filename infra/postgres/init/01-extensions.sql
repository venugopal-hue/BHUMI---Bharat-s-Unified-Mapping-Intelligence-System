-- BHUMI · database bootstrap
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS postgis_topology;
CREATE EXTENSION IF NOT EXISTS pg_trgm;      -- fuzzy name search
CREATE EXTENSION IF NOT EXISTS unaccent;     -- diacritic-insensitive search
CREATE EXTENSION IF NOT EXISTS fuzzystrmatch;-- soundex / levenshtein for duplicates
CREATE EXTENSION IF NOT EXISTS btree_gin;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Multi-script search config: Indic scripts have no stemmer, so we lean on
-- trigram + unaccent rather than tsvector for owner-name matching.
CREATE TEXT SEARCH CONFIGURATION IF NOT EXISTS bhumi_simple ( COPY = simple );
