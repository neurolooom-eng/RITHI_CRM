// ===========================================================================
// WHO TO TRAIN -- the audience picker's rule (0264). Pure, so check:paging can
// prove it (the paging.ts reason).
// ===========================================================================
// The user chose "Chosen at upload": roles, designations, departments, regions
// or named people. A person is IN when they match ANY chosen value (a union --
// "Service department and Priya" means both), and only ACTIVE directory rows.
// `all` is EVERY ACTIVE PERSON ON THE USER MASTER in one go (the user,
// 2026-10-23: "In Training Module, Add a Provision to add for all Active Users
// from User Master in one go"). Inactive rows are still never included.
export interface Audience { roles: string[]; designations: string[]; departments: string[]; regions: string[]; people: string[]; all?: boolean }
export const EMPTY_AUDIENCE: Audience = { roles: [], designations: [], departments: [], regions: [], people: [], all: false };
export function audienceIds(
  dir: { id: number; name: string; role: string; designation: string; department?: string; region: string; validity: boolean }[],
  a: Audience,
): number[] {
  const low = (xs: string[]) => new Set(xs.map((x) => x.trim().toLowerCase()).filter(Boolean));
  const R = low(a.roles), D = low(a.designations), P = low(a.departments), G = low(a.regions), N = low(a.people);
  const has = (s: Set<string>, v: string | undefined) => s.size > 0 && s.has(String(v ?? '').trim().toLowerCase());
  return dir.filter((d) => d.validity && (a.all === true || has(R, d.role) || has(D, d.designation) || has(P, d.department) || has(G, d.region) || has(N, d.name)))
    .map((d) => d.id);
}
export const audienceIsEmpty = (a: Audience) =>
  a.all !== true && !a.roles.length && !a.designations.length && !a.departments.length && !a.regions.length && !a.people.length;
