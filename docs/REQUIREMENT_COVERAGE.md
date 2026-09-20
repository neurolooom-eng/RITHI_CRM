# Requirement coverage — screens and actions the package does not mention

**GENERATED** by `scripts/requirement-coverage.ts` (`npm run coverage:reqs`).

Every line below is a **question for a human**, not a defect. Requirements are
prose: one can cover a screen without naming it, and no scan sees that. What
this proves is only that the words do not appear anywhere in the package —
requirements, design, risks, tests and the compliance checklist together.

## Screens not named anywhere in the package (2 of 58)

| Screen | Route | Opened by |
| --- | --- | --- |
| My Workload | `/workload` | `mod:/workload` |
| How RITHI Functions | `/knowledge-base/how-it-works` | `mod:/knowledge-base/how-it-works` |

## Actions not named anywhere in the package (2 of 107)

An action is what an administrator GRANTS, so one the package never mentions
is authority the validation does not discuss.

| Action | What it allows | On the matrix? |
| --- | --- | --- |
| `mod:/workload` | Open: My Workload | yes |
| `mod:/knowledge-base/how-it-works` | Open: How RITHI Functions | yes |

## Paths the package names that are not screens (0)

Usually a file path or a prose slash rather than a route — read it as a
shortlist to glance at, not a defect list.

None.
