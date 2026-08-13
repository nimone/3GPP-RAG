-- schema.sql — run once against Neon
create extension if not exists vector;

create table if not exists chunks (
  id      text primary key,
  text    text not null,
  spec    text not null,
  clause  text not null,
  title   text not null,
  embedding vector(1024) not null,
  tsv tsvector generated always as (to_tsvector('english', text)) stored
);

create index if not exists chunks_tsv_idx on chunks using gin (tsv);

-- No HNSW/IVFFlat index: at this corpus size a sequential scan is faster than
-- the index build. Add one past ~50k rows.
-- ponytail: sequential scan, add HNSW via CREATE INDEX CONCURRENTLY past 50k rows
