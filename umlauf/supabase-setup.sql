-- Umlauf: Bestenliste für timleonhardt.de/umlauf
-- Einmal im Supabase SQL Editor ausführen (New query → einfügen → Run).
-- Erneutes Ausführen schadet nicht.

create table if not exists public.umlauf_scores (
  player_id   uuid primary key,
  name        text not null check (char_length(name) between 1 and 14),
  score       integer not null check (score between 1 and 5000),
  achieved_at timestamptz not null default now()
);

-- Niemand liest oder schreibt die Tabelle direkt, nur über die zwei Funktionen unten.
alter table public.umlauf_scores enable row level security;
revoke all on table public.umlauf_scores from anon, authenticated;

-- Score eintragen: ein Eintrag pro Spieler-ID, der Score kann nur steigen, der Name darf sich ändern.
create or replace function public.umlauf_submit(p_player uuid, p_name text, p_score integer)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  clean text := left(btrim(regexp_replace(coalesce(p_name, ''), '[[:cntrl:]]', '', 'g')), 14);
begin
  if p_player is null or clean = '' then
    raise exception 'invalid name';
  end if;
  if p_score is null or p_score < 1 or p_score > 5000 then
    raise exception 'invalid score';
  end if;
  insert into public.umlauf_scores as s (player_id, name, score)
  values (p_player, clean, p_score)
  on conflict (player_id) do update
    set name        = excluded.name,
        achieved_at = case when excluded.score > s.score then now() else s.achieved_at end,
        score       = greatest(s.score, excluded.score);
end;
$$;

-- Top 10 plus der eigene Platz. Spieler-IDs verlassen die Datenbank nie.
create or replace function public.umlauf_board(p_player uuid default null)
returns json
language sql
stable
security definer
set search_path = public
as $$
  select json_build_object(
    'top', coalesce((
      select json_agg(json_build_object('name', t.name, 'score', t.score, 'me', t.me) order by t.pos)
      from (
        select name, score,
               coalesce(player_id = p_player, false) as me,
               row_number() over (order by score desc, achieved_at asc) as pos
        from public.umlauf_scores
        order by score desc, achieved_at asc
        limit 10
      ) t
    ), '[]'::json),
    'me', (
      select json_build_object(
        'name', s.name,
        'score', s.score,
        'rank', (select count(*) + 1 from public.umlauf_scores o where o.score > s.score)
      )
      from public.umlauf_scores s
      where s.player_id = p_player
    )
  );
$$;

revoke all on function public.umlauf_submit(uuid, text, integer) from public, anon, authenticated;
revoke all on function public.umlauf_board(uuid) from public, anon, authenticated;
grant execute on function public.umlauf_submit(uuid, text, integer) to anon, authenticated;
grant execute on function public.umlauf_board(uuid) to anon, authenticated;
