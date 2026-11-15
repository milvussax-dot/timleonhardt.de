-- Gemeinsame Bestenlisten für alle Spiele auf timleonhardt.de
-- Einmal im Supabase SQL Editor ausführen (New query → einfügen → Run). Erneutes Ausführen schadet nicht.
--
-- Jede Liste heißt "board" (z. B. "spinward", "plot-twist:day:2026-11-15", "peak-rush:race3:edelweiss").
-- Pro Liste und Gerät gibt es einen Eintrag, der nur besser werden kann. Geräte-IDs verlassen die Datenbank nie.

-- Welche Listen es gibt, ob mehr oder weniger besser ist und welche Werte erlaubt sind.
-- Ein Eintrag gilt für die Liste selbst und alle Listen darunter ("plot-twist:day" gilt für "plot-twist:day:2026-11-15").
create table if not exists public.lb_boards (
  prefix        text primary key,
  higher_better boolean not null,
  min_score     numeric not null,
  max_score     numeric not null
);

create table if not exists public.lb_scores (
  board       text not null check (board ~ '^[a-z0-9][a-z0-9:_.-]{0,63}$'),
  player_id   uuid not null,
  name        text not null check (char_length(name) between 1 and 16),
  score       numeric not null,
  tiebreak    numeric not null default 0,   -- kleiner ist besser, bei gleichem Score
  achieved_at timestamptz not null default now(),
  primary key (board, player_id)
);
create index if not exists lb_scores_board_score on public.lb_scores (board, score);

-- Niemand liest oder schreibt die Tabellen direkt, nur über lb_board und lb_submit.
alter table public.lb_boards enable row level security;
alter table public.lb_scores enable row level security;
revoke all on table public.lb_boards, public.lb_scores from anon, authenticated;

insert into public.lb_boards (prefix, higher_better, min_score, max_score) values
  ('spinward',                true,  1,    5000),      -- Funken
  ('stone-cold',              true,  1,    90),        -- Sterne, tiebreak = Züge über Ideal
  ('plot-twist',              true,  1,    1000),      -- Punkte, beste Tagespartie aller Zeiten
  ('plot-twist:day',          true,  1,    1000),      -- Punkte pro Tag
  ('peak-rush:race3',         false, 5000, 1800000),   -- Millisekunden
  ('peak-rush:slalom3',       false, 5000, 1800000),   -- Millisekunden
  ('peak-rush:freestyle3',    true,  1,    10000000),  -- Punkte
  ('peak-rush:lawine',        true,  1,    1000000)    -- Meter
on conflict (prefix) do update
  set higher_better = excluded.higher_better, min_score = excluded.min_score, max_score = excluded.max_score;

-- Score eintragen. Bessere Werte ersetzen den alten Eintrag, der Name darf sich immer ändern.
create or replace function public.lb_submit(p_board text, p_player uuid, p_name text, p_score numeric, p_tiebreak numeric default 0)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  cfg   public.lb_boards;
  old   public.lb_scores;
  clean text := left(btrim(regexp_replace(coalesce(p_name, ''), '[[:cntrl:]]', '', 'g')), 16);
  tb    numeric := coalesce(p_tiebreak, 0);
  better boolean;
begin
  if p_board is null or p_board !~ '^[a-z0-9][a-z0-9:_.-]{0,63}$' then
    raise exception 'invalid board';
  end if;
  select * into cfg from public.lb_boards
   where p_board = prefix or p_board like prefix || ':%'
   order by length(prefix) desc limit 1;
  if not found then
    raise exception 'unknown board';
  end if;
  if p_player is null or clean = '' then
    raise exception 'invalid name';
  end if;
  if p_score is null or p_score < cfg.min_score or p_score > cfg.max_score or abs(tb) > 1000000000 then
    raise exception 'invalid score';
  end if;

  insert into public.lb_scores (board, player_id, name, score, tiebreak)
  values (p_board, p_player, clean, p_score, tb)
  on conflict (board, player_id) do nothing;
  if found then
    return;
  end if;

  select * into old from public.lb_scores where board = p_board and player_id = p_player for update;
  better := case when cfg.higher_better
                 then p_score > old.score or (p_score = old.score and tb < old.tiebreak)
                 else p_score < old.score or (p_score = old.score and tb < old.tiebreak) end;
  if better then
    update public.lb_scores
       set name = clean, score = p_score, tiebreak = tb, achieved_at = now()
     where board = p_board and player_id = p_player;
  else
    update public.lb_scores set name = clean where board = p_board and player_id = p_player;
  end if;
end;
$$;

-- Top-Liste plus eigener Platz.
create or replace function public.lb_board(p_board text, p_player uuid default null, p_limit integer default 10)
returns json
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  cfg public.lb_boards;
  lim integer := least(greatest(coalesce(p_limit, 10), 1), 50);
  result json;
begin
  select * into cfg from public.lb_boards
   where p_board = prefix or p_board like prefix || ':%'
   order by length(prefix) desc limit 1;
  if not found then
    raise exception 'unknown board';
  end if;

  with ranked as (
    select name, score, tiebreak, player_id, achieved_at,
           case when cfg.higher_better then -score else score end as k
      from public.lb_scores
     where board = p_board
  )
  select json_build_object(
    'higher_better', cfg.higher_better,
    'total', (select count(*) from ranked),
    'top', coalesce((
      select json_agg(json_build_object('name', t.name, 'score', t.score, 'tiebreak', t.tiebreak, 'me', t.me)
                      order by t.k, t.tiebreak, t.achieved_at)
        from (select name, score, tiebreak, achieved_at, k, coalesce(player_id = p_player, false) as me
                from ranked order by k, tiebreak, achieved_at limit lim) t
    ), '[]'::json),
    'me', (
      select json_build_object('name', r.name, 'score', r.score, 'tiebreak', r.tiebreak,
               'rank', (select count(*) + 1 from ranked o where o.k < r.k or (o.k = r.k and o.tiebreak < r.tiebreak)))
        from ranked r
       where r.player_id = p_player
    )
  ) into result;
  return result;
end;
$$;

revoke all on function public.lb_submit(text, uuid, text, numeric, numeric) from public, anon, authenticated;
revoke all on function public.lb_board(text, uuid, integer) from public, anon, authenticated;
grant execute on function public.lb_submit(text, uuid, text, numeric, numeric) to anon, authenticated;
grant execute on function public.lb_board(text, uuid, integer) to anon, authenticated;
