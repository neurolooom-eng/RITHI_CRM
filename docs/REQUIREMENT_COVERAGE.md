# Requirement coverage — screens and actions the package does not mention

**GENERATED** by `scripts/requirement-coverage.ts` (`npm run coverage:reqs`).

Every line below is a **question for a human**, not a defect. Requirements are
prose: one can cover a screen without naming it, and no scan sees that. What
this proves is only that the words do not appear anywhere in the package —
requirements, design, risks, tests and the compliance checklist together.

## Screens not named anywhere in the package (3 of 54)

| Screen | Route | Opened by |
| --- | --- | --- |
| Pending Registrations | `/pending-registrations` | `mod:/pending-registrations` |
| Bulk Report Mapping | `/report-mapping` | `mod:/report-mapping` |
| Tracker | `/tracker` | `mod:/tracker` |

## Actions not named anywhere in the package (11 of 103)

An action is what an administrator GRANTS, so one the package never mentions
is authority the validation does not discuss.

| Action | What it allows | On the matrix? |
| --- | --- | --- |
| `calls.allot` | Re-allocate a call to another engineer | yes |
| `calls.edit.complaint` |  Edit the complaint (complaint, breakdown date) | yes |
| `calls.edit.customer` |  Edit customer & product (party, city, product, serial) | yes |
| `calls.edit.vigilance` |  Edit the vigilance answers (health threat, death, incident) | yes |
| `calls.edit.contact` |  Edit customer contact details (name, number, designation) | yes |
| `calls.cancel` | Cancel a call (and restore it) | yes |
| `cover.edit` | Edit sales / warranties / contracts | yes |
| `admin.view` | Open the administration pages, read-only | yes |
| `mod:/pending-registrations` | Open: Pending Registrations | yes |
| `mod:/report-mapping` | Open: Bulk Report Mapping | yes |
| `mod:/tracker` | Open: Tracker | yes |

## Paths the package names that are not screens (0)

Usually a file path or a prose slash rather than a route — read it as a
shortlist to glance at, not a defect list.

None.
