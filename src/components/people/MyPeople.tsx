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

/** The people who report to me, each with their profile a click away.
 *
 *  CURRENT AND EX EMPLOYEES APART (the user, 2026-09-30: "My Team should have
 *  Active/Current and Ex Employee [based on Status of the Employee]"). The
 *  status is the User Master's Active column (`validity`). The reporting tree
 *  does not drop somebody who has left -- their name still sits under their
 *  manager -- so they were listed beside the current team with nothing to say
 *  they had gone. Their profile, R&R and training stay a click away: a leaver's
 *  training record is still a quality record. */
export function MyTeam({ data }: { data: MyPeopleData }) {
  const [open, setOpen] = useState<DirectoryRow | null>(null);
  const [which, setWhich] = useState<'current' | 'ex'>('current');
  const current = data.team.filter((t) => t.validity);
  const ex = data.team.filter((t) => !t.validity);
  const team = which === 'current' ? current : ex;
  if (!supabaseConfigured()) return null;
  return (
    <>
      <div className="row" style={{ gap: 6, marginBottom: 10 }} role="tablist" aria-label="Team status">
        <button role="tab" aria-selected={which === 'current'} className={`btn btn-sm${which === 'current' ? ' btn-primary' : ''}`}
          onClick={() => setWhich('current')}>Active / Current ({current.length})</button>
        <button role="tab" aria-selected={which === 'ex'} className={`btn btn-sm${which === 'ex' ? ' btn-primary' : ''}`}
          onClick={() => setWhich('ex')}>Ex Employees ({ex.length})</button>
      </div>
      {team.length === 0 ? (
        <div className="muted">
          {data.team.length === 0 ? 'Nobody reports to you on the User Master.'
            : which === 'current' ? 'Nobody currently active reports to you.' : 'No ex employees in your team.'}
        </div>
      ) : (
        <SectionCard title={which === 'current' ? `Active / Current (${team.length})` : `Ex Employees (${team.length})`}>
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
