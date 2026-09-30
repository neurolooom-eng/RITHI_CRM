-- ===========================================================================
-- 0271 — WHO MAY SWITCH AUTO REVIEW IS A ROLE, NOT TWO NAMES.
--
-- The user, 2026-09-30: "instead of hard coded names, can u change it to role -
-- Admin, NSM, Technical Support" -- and, asked whether Technical Support should
-- have it although that role is otherwise read-only, "Yes, include it".
--
-- 0269 gave review.auto to Bagyaraj and Vignesh BY NAME, into each person's own
-- extra permissions. This file:
--   1. MERGES review.auto into the nsm and technical_support role rows, never
--      overwriting what an administrator has tuned there. Admin needs no row
--      change -- has_perm() answers yes for is_admin() whatever the row holds --
--      but gets the key too, so Roles & Permissions shows the tick it has.
--      A role row with ZERO permissions is left alone: an empty array means
--      "not configured", and writing one key into it would switch off the
--      fallback that role is living on.
--   2. TAKES BACK what 0269 gave by name, and only that: the same match 0269
--      made (one sign-in named like the person, or none). Anybody an
--      administrator has since given it on User Master -> Access keeps it --
--      the per-person grant still exists; it is simply no longer written here.
--
-- TECHNICAL SUPPORT'S ONE WRITE. That role is "the Super Admin's reach, none of
-- its writes" (2026-09-08). Switching Auto Review is a write -- while on, Review 2
-- is answered NO in the switcher's name -- and it is given here because the
-- user said so, knowing that. It is the only write the role holds; nothing else
-- about it changes. Zoho Migration, whose client defaults are derived from
-- Technical Support's, is NOT given it.
--
-- Nothing about the switch itself changes: whoever turns it on is the name its
-- answers carry, and it stays in whatever state it is in now.
-- ===========================================================================

do $$
declare n int;
begin
  if to_regclass('public.app_roles') is null then return; end if;

  update public.app_roles ar
     set permissions = ar.permissions || '["review.auto"]'::jsonb,
         updated_at  = now()
   where jsonb_array_length(ar.permissions) > 0
     and ar.role in ('admin', 'nsm', 'technical_support')
     and not (ar.permissions ? 'review.auto');
  get diagnostics n = row_count;
  raise notice '0271: review.auto given to % of 3 role(s)', n;
end $$;

do $$
declare who text; n int; v_id uuid;
begin
  foreach who in array array['bagyaraj', 'vignesh'] loop
    select count(*), min(p.id::text)::uuid into n, v_id
      from public.profiles p
      left join public.user_directory d
        on lower(btrim(d.email)) = lower(btrim(p.email)) or lower(btrim(d.gmail)) = lower(btrim(p.email))
     where lower(coalesce(d.name, p.full_name, '')) like '%' || who || '%';
    if n = 1 then
      update public.profiles
         set extra_permissions = coalesce((
               select jsonb_agg(e) from jsonb_array_elements(extra_permissions) e
                where e <> '"review.auto"'::jsonb), '[]'::jsonb)
       where id = v_id and coalesce(extra_permissions, '[]'::jsonb) ? 'review.auto';
      get diagnostics n = row_count;
      raise notice '0271: the by-name grant of review.auto to % taken back (% row)', who, n;
    end if;
  end loop;
end $$;
