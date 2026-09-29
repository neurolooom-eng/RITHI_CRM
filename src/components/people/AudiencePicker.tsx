import { useMemo } from 'react';
import { MultiPick } from '../ui/MultiPick';
import type { DirectoryRow } from '../../lib/supabase';
import { roleLabelFor } from '../../lib/rbac';
import { audienceIds, type Audience } from '../../lib/audience';

// ===========================================================================
// WHO TO TRAIN (the user, 2026-09-30: "Chosen at upload"). Roles,
// designations, departments, regions or named people; a person is in when
// they match ANY of them, and only active User Master rows count. The count
// underneath is the exact number of people who will be assigned.
// ===========================================================================
const distinct = (xs: string[]) => {
  const m = new Map<string, string>();
  xs.map((x) => x.trim()).filter(Boolean).forEach((x) => { if (!m.has(x.toLowerCase())) m.set(x.toLowerCase(), x); });
  return [...m.values()].sort((a, b) => a.localeCompare(b));
};

export function AudiencePicker({ dir, departments, value, onChange }: {
  dir: DirectoryRow[]; departments: string[]; value: Audience; onChange: (a: Audience) => void;
}) {
  const active = useMemo(() => dir.filter((d) => d.validity), [dir]);
  const roles = useMemo(() => distinct(active.map((d) => d.role)), [active]);
  const roleLabels = useMemo(() => new Map(roles.map((r) => [roleLabelFor(r) || r, r])), [roles]);
  const designations = useMemo(() => distinct(active.map((d) => d.designation)), [active]);
  const deps = useMemo(() => distinct([...departments, ...active.map((d) => d.department)]), [departments, active]);
  const regions = useMemo(() => distinct(active.map((d) => d.region)), [active]);
  const people = useMemo(() => distinct(active.map((d) => d.name)), [active]);
  const n = useMemo(() => audienceIds(dir, value).length, [dir, value]);
  const set = (k: keyof Audience, v: string[]) => onChange({ ...value, [k]: v });

  return (
    <div>
      <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
        <div style={{ minWidth: 170 }}>
          <MultiPick values={value.roles.map((r) => roleLabelFor(r) || r)} options={[...roleLabels.keys()]} noun="roles"
            allLabel="— roles —" onChange={(v) => set('roles', v.map((l) => roleLabels.get(l) ?? l))} />
        </div>
        <div style={{ minWidth: 170 }}>
          <MultiPick values={value.designations} options={designations} noun="designations" allLabel="— designations —"
            onChange={(v) => set('designations', v)} />
        </div>
        <div style={{ minWidth: 170 }}>
          <MultiPick values={value.departments} options={deps} noun="departments" allLabel="— departments —"
            onChange={(v) => set('departments', v)} />
        </div>
        <div style={{ minWidth: 150 }}>
          <MultiPick values={value.regions} options={regions} noun="regions" allLabel="— regions —"
            onChange={(v) => set('regions', v)} />
        </div>
        <div style={{ minWidth: 200 }}>
          <MultiPick values={value.people} options={people} noun="people" allLabel="— named people —"
            onChange={(v) => set('people', v)} />
        </div>
      </div>
      <div className="muted" style={{ fontSize: 12.5, marginTop: 4 }}>
        <b>{n.toLocaleString()}</b> {n === 1 ? 'person' : 'people'} will be assigned — anyone matching any choice above, active on the User Master.
      </div>
    </div>
  );
}
