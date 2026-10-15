# How the Objective page calculates each figure

**Page:** Quality & Analytics → Objective (`/objective`).
**Written:** 12-Oct-2026, from the live database functions as they stand after migration 0422.
**Where the logic lives:** the database function `objective_value(objective, month)` works out every
figure; `objective_evidence(objective, month)` returns the rows behind it (the evidence download);
`objective_period(objective, month)` decides which dates a month covers. The SQL is the fact — if
this document and the SQL ever disagree, the SQL is right and this document must be corrected.

---

## 1. Rules that apply to every objective

### 1.1 Computed or typed
Each objective is either **computed** (marked **ƒ** on the page; it has a *calculation* chosen in its
definition) or **typed** (someone enters the figure by hand). Re-Calculate never touches a typed
figure.

### 1.2 Which dates a month covers — "the period"
| Frequency | Months that get a figure | Period measured |
|---|---|---|
| **Monthly** | every month | the 1st of the month to the **last day of the month** |
| **Quarterly** ("3 Months" / "Quarter") | **Mar, Jun, Sep, Dec only**; the other months read NA | the 1st day of the quarter to the **last day of the quarter-end month** (Jan 1 – Mar 31, Apr 1 – Jun 30, …) |

- A period that has not ended yet stops at **today** (India time). A month that has not started yet
  gets no figure.
- *Exception:* the Recent Failure Rates count failing calls up to **today** for every month (see §3).

### 1.3 Re-Calculate
- Works out every **Active** computed objective for every month of the year that has started, and
  writes the result into the month.
- Objectives set to *Not Working* or *Do Not Use* are left exactly as they are.
- **Manual overrides** (a computed month someone typed over; shown ✎) are **kept** unless you choose
  *Discard them* in the Re-Calculate dialog.
- The page is **not** recalculated when it is opened — only when Re-Calculate is pressed (or the
  Missed PM switch is flipped, §4.4). A figure on the page can therefore be older than the data;
  the evidence download says whether it still agrees ("Agrees with this file?").

### 1.4 Blank, zero and NA
- **Blank** = there was nothing to measure (no calls, no machines, no feedback in the period). A rate
  over nothing is undefined, so it is left blank rather than shown as 0%.
- **0** = measured, and the answer is nothing. Only the FFR count shows 0 for "none".
- **NA** = a quarterly objective in a month that is not a quarter-end.

### 1.5 How a figure is shown
- A figure whose target contains **%** is a percentage, shown to **two decimal places** (0.010101 → 1.01%).
- It is coloured **good** or **bad** against a target written `<x%` or `>x%`.
- The **Total** column is **calculated** for every computed objective (0428, 13-Oct-2026), the way
  the shared sheet works it out:
  - **FFR count** — the **sum** of its months. Sheet 2026: 0 + 9 + 7 + 6 + 2 + 4 + 6 = **34**.
  - **Every percentage objective** — the plain **average of the months (or quarters) that carry a
    figure**. A blank or NA month is in neither the sum nor the count. Sheet 2026: CPXcare
    (1% + 1% + 0 + 0 + 0 + 0 + 0) ÷ 7 = **0.29%**; attended within 3 days (92 + 93 + 94 + 95 + 96 + 94 + 96) ÷ 7
    = **94.29%**; Preventive Maintenance (10% + 10%) ÷ 2 = **10%**.
  - It is an average of the monthly figures, **not** the year's calls pooled into one rate.
  - It moves by itself whenever a month changes — Re-Calculate or a month typed over by hand. A
    **typed** objective (no calculation) keeps the Total typed in.
  - **Check by hand:** add the month figures shown and divide by how many there are (FFR: just add).

---

## 2. Which calculation each 2026 objective uses

| # | Objective | Calculation | Settings it uses |
|---|---|---|---|
| 1 | No. of Field failures registered in FFR | **FFR count** (§3.1) | none |
| 2 | Recent Failure Rate of CPXcare | **Recent Failure Rate** (§3.2) | product `%CPX%` |
| 3 | Recent Failure Rate of Extend (Indian) | Recent Failure Rate | product `%EXTEND%`, serial `INXT%` |
| 4 | Recent Failure Rate of Orion-G | Recent Failure Rate | product `%ORION%` |
| 5 | Recent Failure Rate of VEGA | Recent Failure Rate | product `%VEGA%` |
| 6 | Recent Failure Rate of MT75 | Recent Failure Rate | product `%T75%` |
| 7 | Recent Failure Rate of MT60 | Recent Failure Rate | product `%T60%` |
| 8 | Breakdown Calls | **Open-call rate** (§3.3) | register: Field calls |
| 9 | Preventive Maintenance Calls | Open-call rate | register: PM calls; Missed PMs excluded (§4.4) |
| 10 | Installation call | Open-call rate | register: Installation calls |
| 11 | Problem Call attending within 3 days | **Attended within N days** (§3.4) | register: Field calls; N = 3 |
| 12 | b. Customer feedback | **Customer feedback satisfaction** (§3.5) | none |

`%` in a product or serial setting means "anything here": `%T75%` matches any product name
containing T75; `INXT%` any serial starting with INXT. Settings are seen and changed in the
objective's definition (✏️ beside its name).

---

## 3. The calculations

### 3.1 FFR count — "No. of Field failures registered in FFR"
**Answers:** how many Field Failure Reports were raised in the month.

1. Take the **Field Failure Register** (`field_failure_reports`).
2. Keep the reports whose **FFR Date** falls in the period (and, if set, whose product / serial match
   the filters).
3. Count the **distinct FFR numbers**. A report covering several machines is one row per machine
   in the register but **one** FFR number — it counts once. A report with no number counts as itself.

**Figure = number of distinct FFR numbers.** Zero when there are none.

*Example:* FFR-101 covers 3 machines, FFR-102 covers 1 → 4 register rows → **2**.
*Check by hand:* evidence download → one row per machine, grouped by FFR number.

### 3.2 Recent Failure Rate — CPXcare, Extend, Orion-G, VEGA, MT75, MT60
**Answers:** of the machines commissioned in the last 12 months, what share failed within 3 months
of commissioning — averaged month by month, as the WRR workbook does.

**Step 1 — the machines (Parc).** From the **Product Database** take every machine of the product
(name matches the product setting; serial matches the serial setting, if any; serial not blank)
with a **Warranty Start** date. Its **commissioning month** is the month of its Warranty Start.
*Parc* of a month = how many machines were commissioned in it.

**Step 2 — the failures.** A **failure** is a **Field call** (from the Field Call Register) that:
- is not cancelled, has a serial, and its product matches the setting; **and**
- its **Daily Complaint Review (DCCR)** says *Spare / Consumable / Correction / Calibration* contains
  **SPARE**, **or** *Any Potential Effect* = **YES**.

Each failing call is tied to its machine: the Product Database row with the **same serial** and a
matching product whose **Warranty Start is on or before the call date** (the latest such, if more
than one). A call with no such machine is not counted. **Every call counts** — a machine called out
twice is two failures (so a rate can pass 100%, as in the workbook).

**Step 3 — the rate of each commissioning month.**
`3-month rate = (failing calls registered within 3 months of their machine's Warranty Start) ÷ Parc`
- A commissioning month that is **less than 3 months old today** has no rate yet (blank) — its
  machines have not had their full 3 months.
- A month with **no machines** (Parc 0) has no rate.

**Step 4 — the objective's figure for a month.**
`Figure = average of the 3-month rates of the 12 commissioning months ending in that month`
(e.g. March 2026 → Apr 2025 … Mar 2026), **leaving out the blank ones**. Failing calls are counted
**up to today**, not up to the month's end — so an earlier month's figure can rise on Re-Calculate
when a late failure is recorded.

*Example (VEGA, March):* the 12 months Apr–Mar have rates 10%, blank, 0%, 5%, … → the average of
the non-blank rates.
*Settings:* "3 months" and "12 months" are set on **SLA / Objective Configuration**
(*failure window* and *rolling months*).
*Check by hand:* **Failure Rate (DCCR)** tab on the Objective page, or the evidence download (three
sheets: the commissioning-month table, the failing calls, and the months averaged).

### 3.3 Open-call rate — Breakdown Calls, Preventive Maintenance Calls, Installation call
**Answers:** of the calls registered in the period, what share were **still not solved** by the
cut-off date.

1. **The calls (denominator).** From the objective's register — Field, PM or Installation calls —
   every call **registered** (Call Registration date) in the period, not cancelled, and of the call
   type in the setting (all types if none).
   *PM only:* **Missed PMs are left out** (§4.4).
2. **Solved by the cut-off.** A call is *solved* if it has a visit report whose Call Status starts
   with **Solved**, and that visit's **visit date** is on or before the **cut-off date**. If the
   solving report has no visit date, the date the report was entered is used.
3. **The cut-off date**, most specific first:
   1. the **cut-off date set for that month** on the Objective page (the 12 date boxes; a quarterly
      objective uses its quarter-end month's date) — never later than today;
   2. else a **fixed cut-off date** in the objective's definition — never later than today;
   3. else the period's end **plus a grace of N days** if the definition sets one;
   4. else the **period's end**.
4. **Open calls (numerator)** = calls from step 1 that are **not** solved by the cut-off.

**Figure = open calls ÷ calls.** Blank when there are no calls.

*Example (Breakdown, March, cut-off 03-Apr):* 528 field calls registered in March; 100 had no
Solved visit on or before 03-Apr → 100 ÷ 528 = **18.94%**.
*Note:* the cut-off never changes **which** calls are counted — only how many of them count as solved.
*Check by hand:* evidence download → every call, marked open/closed, with its solving visit date
and a note where the visit came after the cut-off.

### 3.4 Attended within N days — "Problem Call attending within 3 days"
**Answers:** of the calls registered in the period, what share were **attended** within N days.

1. **The calls (denominator):** every call registered in the period in the objective's register
   (Field), not cancelled, of the call type in the setting.
2. **Days:** the **lower** of *attended on − complaint date* and *attended on − breakdown date*
   that is not negative (0441, 2026-10-14: *"which ever is lower should be considered. If the
   value is going in negative, then take the other date"*); 0 when both are negative. A call with
   only one of the two dates counts from that one; with neither, from its registration date.
3. **Attended on:** the **earlier** of
   - the call's **first visit date**, and
   - the date of the call's **first spare request**.
4. A call is **attended in time** if those days are ≤ N.
   A call never visited and with no spare request is **not** in time.

**Figure = calls attended in time ÷ calls.** N = **3** (the *days* setting). Blank when no calls.

*Example:* breakdown 09-Mar, complaint 10-Mar; first visit 13-Mar, spare requested 12-Mar →
attended 12-Mar → 3 days from the breakdown, 2 from the complaint → **2** → in time (N = 3).

**The download (0443)** gives each call, after its UCN and Call Number: Call Registration Date,
Complaint Date, Breakdown Date, First Visit Date (the earliest by visit date), First Visit Recorded
Date (that visit's Visit Entry Date), First Spare Request Date, Attended On, **TTA Counted From**,
**TTA (Days)** — the number compared with N — and **TTA ( R )**, the KPI band. Every TTA can be
worked by hand along its row.

### 3.5 Customer feedback satisfaction — "b. Customer feedback"
**Answers:** the average satisfaction of the customers whose feedback was taken in the period —
exactly the **Customer Feedback workbook's** method.

1. **Score each answer:** Excellent **4**, Good **3**, Average **2**, Poor **1**
   (Not Required / blank = no score).
2. **Each call's Satisfaction %:**
   - **Installation call** (any call type containing INSTALLATION, including *Installation Call &
     Field*): its **5 installation questions** ÷ 20 —
     Startup, Training & Handing Over · Packing & Forwarding · Delivery adherence schedule ·
     Operating Feasibility of the Equipment · General support of our company.
   - **Every other call** (Field, PM, SW upgrade …): its **6 PM / Field questions** ÷ 24 —
     Operating Feasibility · General support · Ability of our Product to meet your requirement ·
     Reliability of Product · Reliability of Service · Promptness for Service Calls.
   - A feedback **missing an answer** to one of its questions is **left out**.
3. **Which period:** the feedback's **visit date** (the workbook's *Solved Date*).

**Figure = the plain average of the Satisfaction % of every feedback in the period.**
Blank when there is none. The objective is quarterly, so Mar = Jan–Mar, Jun = Apr–Jun, …

*Example:* field call all Excellent → 24/24 = 100%; PM call scoring 4,4,3,3,2,4 → 20/24 = 83.33%;
installation call all Good → 15/20 = 75% → average of the three = **86.11%**.
*Check by hand:* evidence download → every feedback counted, each answer's score, its
Satisfaction %, and the average.

---

## 4. Special rules

### 4.1 India time
Every date is an **India date** — a day runs midnight to midnight IST: "today", the period
boundaries, a visit's date, a report's entry date, a call's registration time and a spare request's
date. *(Until 0423 the open-call and attended rates took a visit's date in UTC, so a visit between
00:00 and 05:30 IST counted the day before — D-168, fixed 12-Oct-2026. That was nearly every visit:
29,970 of the 31,262 on the live project are stored at exactly midnight IST, because an imported visit
carries a date and no time.)*

### 4.2 Cancelled calls
Cancelled calls are never counted in any calculation.

### 4.3 A call is counted in the period it was registered
The open-call and attended rates take the calls **registered** in the period; what happened to them
afterwards (solved, attended) is measured against them.

### 4.4 Missed PMs (Preventive Maintenance Calls only)
A **Missed PM** is a PM call whose **Added On** date is **after the last day of the month it is
registered for** — e.g. a March PM added in October. By default Missed PMs are **left out** of the
PM figure (both the calls and the open calls). The **Missed PM: Excluded / Included** switch on the
PM row changes this and re-calculates at once. A PM call with no Added On date is never a Missed PM.
*(The switch is a non-auditable requirement and is hidden in Audit Mode; the figure stays as last
calculated.)*

---

## 5. Where each setting is changed

| Setting | Where | Applies to |
|---|---|---|
| Calculation, product / serial filter, register, call type, days, cut-off date / grace | Objective → ✏️ beside the objective → definition | that objective |
| Cut-off date per month | Objective → the 12 date boxes above the table (can be locked) | every open-call rate |
| Failure window (3 months), rolling months (12) | SLA / Objective Configuration | every Recent Failure Rate |
| Missed PM: Excluded / Included | the switch on the PM row | Preventive Maintenance Calls |
| Status (Active / Not Working / Do Not Use) | the objective's definition | whether Re-Calculate touches it |

---

## 6. Database references (for whoever maintains it)

| Calculation | `calc_key` | Migrations |
|---|---|---|
| FFR count | `ffr_count_monthly` | 0142 |
| Recent Failure Rate | `dccr_failure_cohort` | 0393, 0416 (as of today) |
| Open-call rate | `open_rate_monthly` | 0132 (first), 0136–0139 (periods, cut-offs), 0418 (Missed PM) |
| Attended within N days | `attended_within_days` | 0136 |
| Customer feedback satisfaction | `feedback_satisfaction` | 0422 |
| The Total column (every calculated objective) | — | 0428 (`objective_total()`, trigger `zx_quality_objectives_total`) |
| *(not used in 2026)* failure within N months of installation over a rolling 12 months, by machine | `failure_rate_12m` | 0357, 0359 |

Requirements: FRS-121 (Quality objectives) in `src/lib/validation.ts`; tests in `supabase/tests/`
(`dccr_failure_cohort_test`, `missed_pm_test`, `feedback_satisfaction_test`, `objective_total_test`, `objective_periods_test`,
`objective_ffr_count_test`, `quality_objectives_test`).
