-- ===========================================================================
-- 0172 — A USER MAY SAVE THEIR SIGNATURE.
--
-- The user's ask (2026-09-12): "Add a Provision for users to Save their
-- signatures." The documents that leave this system all end in a signature
-- block somebody signs by hand after printing — the Delivery Challan's two
-- blocks, the Declaration, the Field Failure Report's "Signature:" line. A
-- saved signature is what lets the document carry it already.
--
-- WHY A TABLE OF ITS OWN RATHER THAN A COLUMN ON `profiles`.
--
-- Two reasons, and the second is the important one.
--
--  1. `profiles` cannot be written by its owner. Its only write policy is
--     `profiles_admin_write` — `has_perm('users.manage')` (0008) — so adding a
--     column there would mean either widening that policy or asking an
--     administrator to paste in everybody's signature. RLS grants by ROW, not
--     by column: a policy letting somebody update their own profile row to save
--     a signature lets them update every other field on it too, and the role
--     guard beside it exists precisely because that row is where privilege
--     lives. A separate table is the only way to say "your signature is yours"
--     without saying "your profile is yours".
--
--  2. A SIGNATURE IS NOT ORDINARY PROFILE DATA. It is the mark that stands for
--     a person's assent on a quality record. What it is worth depends entirely
--     on nobody else being able to obtain it or to set it.
--
-- SO: READ YOUR OWN, WRITE YOUR OWN, AND NOBODY ELSE'S — NOT EVEN AN
-- ADMINISTRATOR'S.
--
--   * No administrator read. An administrator has every other right in this
--     system and this one is deliberately withheld: a signature image that a
--     second person can obtain is one they can put on anything, and there is
--     then no sense in which the mark on a printed report is that person's.
--     Admins can see WHETHER somebody has saved one (the view below), which is
--     the only thing administration actually needs — to chase the ones who
--     have not.
--   * No administrator write, for the same reason stated the other way round:
--     a signature somebody else can SET is a signature nobody signed.
--   * REMOVAL is the one administrative act, and it is a FUNCTION rather than
--     a policy — see the note on usig_delete below for why a policy could not
--     express it. A person who has left should not leave their mark in the
--     database, and they are by then unable to remove it themselves. Removal
--     destroys nothing that was signed: the printed document is the record,
--     not this row.
--
-- WHAT THIS MEANS ON A DOCUMENT, and it is a real limitation rather than an
-- oversight: a document prints a saved signature only when the person printing
-- it is the person the block names. Printing somebody else's block leaves it
-- blank to be signed by hand, exactly as today. That is the correct outcome —
-- the alternative is a system that signs documents on people's behalf.
-- ===========================================================================

create table if not exists public.user_signatures (
  user_id     uuid primary key references auth.users(id) on delete cascade,
  -- A PNG data URI. Held as text rather than in a bucket: it is a few KB of
  -- ink, it is read only by the one person it belongs to, and a storage object
  -- would need its own access rules to say the same thing this table says.
  signature   text        not null default '',
  -- The name and title printed UNDER the mark. Taken from the profile when the
  -- signature is saved rather than read live, because a printed document should
  -- carry the name the person signed as.
  name_line   text        not null default '',
  title_line  text        not null default '',
  updated_at  timestamptz not null default now()
);

alter table public.user_signatures enable row level security;

-- YOUR OWN, AND ONLY YOUR OWN. Four policies rather than one `for all`, because
-- delete is the only command with a different answer and a single policy could
-- not express that.
drop policy if exists usig_read on public.user_signatures;
create policy usig_read on public.user_signatures for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists usig_insert on public.user_signatures;
create policy usig_insert on public.user_signatures for insert to authenticated
  with check (user_id = (select auth.uid()));

drop policy if exists usig_update on public.user_signatures;
create policy usig_update on public.user_signatures for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- YOURS, AND ONLY YOURS — no `or is_admin()` here, and that is a correction
-- rather than a simplification. It was written that way first and the test
-- proved it did nothing: PostgreSQL applies the SELECT policy to a
-- `DELETE ... WHERE`, because the statement has to READ the row to find it. An
-- administrator who cannot see the row therefore cannot delete it, and the
-- clause reported `DELETE 0` with no error — a permission that looks granted
-- and is not.
--
-- The two ways out are opposite in kind: give administrators a SELECT policy
-- (which hands them the image, destroying the point of the table), or make
-- removal an explicit administrative ACT with its own function. The function is
-- below.
drop policy if exists usig_delete on public.user_signatures;
create policy usig_delete on public.user_signatures for delete to authenticated
  using (user_id = (select auth.uid()));

grant select, insert, update, delete on public.user_signatures to authenticated;

-- ---------------------------------------------------------------------------
-- REMOVING A LEAVER'S SIGNATURE. A person who has left should not leave their
-- mark in the database, and they are by then unable to remove it themselves.
--
-- Definer, so it does not need a read policy to work; it returns whether there
-- was one to remove, and NEVER the signature itself — an administrator's
-- authority here is to destroy the mark, not to hold it. Nothing that was
-- signed is affected: the printed document is the record, not this row.
-- ---------------------------------------------------------------------------
create or replace function public.remove_user_signature(p_user uuid)
returns boolean language plpgsql security definer set search_path = public as $$
declare v_had boolean;
begin
  if not public.is_admin() then
    raise exception 'Only an administrator may remove another person''s signature.';
  end if;
  if p_user = auth.uid() then
    raise exception 'Use your own Profile page to remove your signature.';
  end if;
  select true into v_had from public.user_signatures where user_id = p_user;
  delete from public.user_signatures where user_id = p_user;
  return coalesce(v_had, false);
end $$;

revoke all on function public.remove_user_signature(uuid) from public;
grant execute on function public.remove_user_signature(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- THE STAMP. `updated_at` is the database's to set: a client that can choose
-- when its own signature was last changed can make one look current.
-- ---------------------------------------------------------------------------
create or replace function public.user_signature_stamp()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- The owner is the session's, not the caller's to name. The insert policy
  -- already refuses another user's id; this makes the column unable to CARRY
  -- one, so the two cannot disagree.
  new.user_id := coalesce(auth.uid(), new.user_id);
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists zz_user_signature_stamp on public.user_signatures;
create trigger zz_user_signature_stamp before insert or update on public.user_signatures
  for each row execute function public.user_signature_stamp();

-- ---------------------------------------------------------------------------
-- WHO HAS SAVED ONE — the image deliberately absent.
--
-- This is what administration needs and all it needs: chasing the people who
-- have NOT saved a signature does not require seeing the ones who have. So this
-- returns a boolean and a date, and there is no path anywhere that returns
-- somebody else's image.
--
-- A FUNCTION, NOT A VIEW, and the difference is not stylistic. To report across
-- rows the caller cannot read it has to be `security definer`, and a definer
-- VIEW over RLS-protected tables is the exact fault this project shipped three
-- times (0040/0050/0057 — `calls` without security_invoker handed every row to
-- every signed-in user); `check:views` now refuses one, correctly, and writing
-- an exception into that check to admit this would blunt the control that
-- catches the real thing. A definer function is the instrument that says
-- "elevated on purpose" out loud, carries its own authority test, and returns
-- only the two columns it means to.
-- ---------------------------------------------------------------------------
create or replace function public.user_signature_status()
returns table (user_id uuid, full_name text, email text, has_signature boolean, signed_at timestamptz)
language plpgsql security definer set search_path = public as $$
begin
  if not (public.is_admin() or public.has_perm('users.manage')) then
    raise exception 'Only User Access may see who has saved a signature.';
  end if;
  return query
    select p.id, p.full_name, p.email,
           (s.user_id is not null and coalesce(btrim(s.signature), '') <> ''),
           s.updated_at
      from public.profiles p
      left join public.user_signatures s on s.user_id = p.id
     order by p.full_name;
end $$;

revoke all on function public.user_signature_status() from public;
grant execute on function public.user_signature_status() to authenticated;
