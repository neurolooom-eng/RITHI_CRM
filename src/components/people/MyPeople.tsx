import { useEffect, useState } from 'react';
import { SectionCard, Drawer } from '../ui/ui';
import { useAuth } from '../../lib/auth';
import { getSupabase, listDirectory, supabaseConfigured, type DirectoryRow } from '../../lib/supabase';
import { PersonProfile, type PersonProfilePart } from './PersonProfile';

// ===========================================================================
// MY PROFILE -> my own details, R&R and training, and MY TEAM'S (the user,
// 2026-09-30: profile details are seen by "the user themselves" and "their
// managers"). The team is the reporting tree the database already uses for
// calls (visible_engineer_names), so a manager sees here exactly the people
// whose calls they see -- and the rows each profile shows are checked again by
// the database (0264 may_see_person).
// ===========================================================================
//
// Read ONCE by My Profile and handed to its tabs (the user, 2026-09-30: "split
// the sections into tabs"), so moving between Details, Training and My Team
// does not read the User Master again each time.
export interface MyPeopleData { me: DirectoryRow | null; team: DirectoryRow[]; loaded: boolean }

export function useMyPeople(): MyPeopleData {
  const { user } = useAuth();
  const [me, setMe] = useState<DirectoryRow | null>(null);
  const [team, setTeam] = useState<DirectoryRow[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!supabaseConfigured() || !user?.email) return;
    let alive = true;
    void (async () => {
      try {
        const dir = await listDirectory();
        const mail = user.email.toLowerCase();
        const mine = dir.find((d) => [d.email, d.gmail].some((e) => e && e.toLowerCase() === mail)) ?? null;
        let names: string[] = [];
        const c = getSupabase();
        if (c) {
          const { data } = await c.rpc('visible_engineer_names');
          names = ((data ?? []) as unknown[]).map((x) => String(typeof x === 'string' ? x : (x as Record<string, unknown>)?.visible_engineer_names ?? ''));
        }
        const set = new Set(names.map((n) => n.toLowerCase()));
        if (!alive) return;
        setMe(mine);
        setTeam(dir.filter((d) => d.id !== mine?.id && set.has(d.name.toLowerCase())));
      } finally { if (alive) setLoaded(true); }
    })();
    return () => { alive = false; };
  }, [user?.email]);
  return { me, team, loaded };
}

/** My own details and R&R, or my training -- one tab each on My Profile. */
export function MyOwn({ data, part, title }: { data: MyPeopleData; part: PersonProfilePart; title: string }) {
  if (!supabaseConfigured()) return <div className="muted">Connect the database in Settings to see this.</div>;
  const { me, loaded } = data;
  return (
    <SectionCard title={title}>
      {me ? <PersonProfile person={me} part={part} />
        : <div className="muted">{loaded ? 'You are not on the User Master yet (matched by your sign-in email) — ask an administrator to add you.' : 'Loading…'}</div>}
    </SectionCard>
  );
}

/** The people who report to me, each with their profile a click away. */
export function MyTeam({ data }: { data: MyPeopleData }) {
  const [open, setOpen] = useState<DirectoryRow | null>(null);
  const { team } = data;
  if (!supabaseConfigured()) return null;
  return (
    <>
      {team.length === 0 ? <div className="muted">Nobody reports to you on the User Master.</div> : (
        <SectionCard title={`My team (${team.length})`}>
          <div className="assoc-scroll">
            <table className="assoc-table">
              <thead><tr><th>Name</th><th>Designation</th><th>Department</th><th>Region</th><th /></tr></thead>
              <tbody>
                {team.map((t) => (
                  <tr key={t.id}>
                    <td>{t.name}</td><td>{t.designation}</td><td>{t.department}</td><td>{t.region}</td>
                    <td><button className="btn btn-sm" onClick={() => setOpen(t)}>👤 Profile</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SectionCard>
      )}
      {open && (
        <Drawer open onClose={() => setOpen(null)} title={open.name} width={760}>
          <PersonProfile person={open} />
        </Drawer>
      )}
    </>
  );
}
