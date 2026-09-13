import { useEffect, useMemo, useRef, useState, type ChangeEvent, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageHeader } from '../components/ui/ui';
import { useAuth } from '../lib/auth';
import { actionForPath } from '../lib/rbac';
import { fmtLongDate } from '../lib/format';
import { fileToDataUrl } from '../lib/image';
import { htmlToText } from '../lib/sanitizeHtml';
import {
  kbList, supabaseConfigured, helpShots, helpShotSet, helpShotClear,
  type KbArticle, type HelpShot,
} from '../lib/supabase';
import './knowledgebase.css';

// ===========================================================================
// HOW TO USE RITHI CRM — its own topic under the Knowledge Base heading.
//
// The user, 2026-09-09: "Move all the How to Content Under the Topic 'How to
// Use RITHI CRM'" and "Promote Knowledge Base to a heading with 1 topic - how
// to use."
//
// IT USED TO BE THE BOTTOM HALF OF ANOTHER PAGE. The guide sat below Field
// Solutions on /knowledge-base, so the thing a new starter needs first was the
// thing they had to scroll past a wall of team articles to reach. A topic
// somebody is sent to ("read How to Use") should be a place, not a position on
// a page.
//
// ALL the how-to content is here, which is the other half of the ask: the
// fifteen written tasks AND any team article filed under the How-To category,
// which used to sit among the field solutions where nobody looking for
// instructions would think to search. One topic, one place to look.
// ===========================================================================

/** The category that means "this article is instructions". An article carrying
 *  it belongs on THIS page and not among the field solutions — the two lists
 *  read the same constant so they cannot start disagreeing about which is
 *  which, and an article cannot end up on both or on neither. */
export const HOWTO_CATEGORY = 'How-To';

const B = ({ children }: { children: ReactNode }) => <span className="kb-btn">{children}</span>;
const K = ({ children }: { children: ReactNode }) => <span className="kb-key">{children}</span>;
const Hint = ({ children }: { children: ReactNode }) => <span className="kb-hint">{children}</span>;

// `go` are real navigation targets for the task — rendered as "Open …" buttons,
// each shown only if the signed-in role may open that module (or `always`, for
// a personal screen like the profile). Some tasks (find the Build ID, refresh)
// have no module to open, so they carry none.
interface GoTo { to: string; label: string; always?: boolean }
// `group` is set on the FIRST task of each group and names the heading it opens.
// Carried on the task rather than wrapping the list in arrays so every existing
// section literal stays exactly as it was — and so a task can be moved by
// changing one line rather than re-nesting the file.
interface Sec { id: string; n: string; title: string; who: string; group?: string; lead: ReactNode; steps: ReactNode[]; go?: GoTo[]; note?: { tone: 'tip' | 'warn' | 'good'; icon: string; body: ReactNode } }

const SECTIONS: Sec[] = [
  {
    id: 'request', n: '1', title: 'Request a call', who: 'Any engineer', group: 'Calls',
    lead: <>When a customer reports a problem, raise a <b>call registration request</b>. The Hotline turns it into a live call with a UCN. You can put more than one machine on one request.</>,
    steps: [
      <>Open <b>Service Calls → Request Registration</b> from the left menu.</>,
      <>Tap <B>＋ New Request</B> at the top right.</>,
      <>Pick the <b>Party</b> (customer), then <b>Product</b> and <b>Serial No</b> — filtered to what that customer owns.<Hint>Choosing the serial auto-fills the machine details.</Hint></>,
      <>Choose the <b>Standard Complaint</b> and type the <b>Reported Problem</b> in the customer’s words.</>,
      <>More than one machine? Tap <b>Add another</b> and repeat — all share one request.</>,
      <>Tap <b>Submit</b>. It appears under <b>Pending Registrations</b> until the Hotline registers it.</>,
    ],
    go: [{ to: '/request-registration', label: 'Request Registration' }, { to: '/pending-registrations', label: 'Pending Registrations' }],
    note: { tone: 'tip', icon: '📌', body: <>A request without a UCN stays in <b>Pending Registrations</b>. Once registered, it becomes a call with a UCN in the <b>Field Call Register</b>.</> },
  },
  {
    id: 'install', n: '2', title: 'Register an installation', who: 'Commercial / Hotline · engineer reports',
    lead: <>An installation is a call of type <b>Installation</b>. It’s created like any call, then you record the install and — importantly — the <b>Warranty Start Date</b>.</>,
    steps: [
      <>Raise it as a request (step 1) choosing <b>Installation</b>, or open <b>Service Calls → Installation Calls</b> and use <B>＋ New Installation</B>.<Hint>New installations are usually triggered by the Commercial team, who are notified first.</Hint></>,
      <>Once it’s a live call, do the installation on site.</>,
      <>Open the call and tap <B>📝 Update</B>, then fill the installation details.</>,
      <>Set the <b>Warranty Start Date</b> — this starts the machine’s warranty and is required on an installation.</>,
      <>Set the <b>Call Status</b> to <b>Solved - Report Completed</b> when the install and report are done.</>,
    ],
    go: [{ to: '/installations', label: 'Installation Calls' }],
    note: { tone: 'tip', icon: '🛡️', body: <>The Warranty Start Date you enter here is what the Warranty Register and every future call read for that machine — get it right.</> },
  },
  {
    id: 'update', n: '3', title: 'Update a call after your visit', who: 'Any engineer',
    lead: <>After you attend a machine, record what you did. The <b>Call Status</b> you choose is what moves the call forward — or closes it.</>,
    steps: [
      <>Open <b>Service Calls → Field Call Register</b> (or Installation / PM).</>,
      <>Find your call. Engineers see <B>🔵 Open only</B> by default — switch to <B>⚪ All calls</B> to see closed ones.<Hint>Search by UCN, party, product or serial if the list is long.</Hint></>,
      <>On the call’s row, tap <B>📝 Update</B>.</>,
      <>Set the <b>Call Status</b>.<Hint><b>Unsolved</b> = still broken · <b>Solved - Report Pending</b> = fixed, report to finish · <b>Solved - Report Completed</b> = done.</Hint></>,
      <>Fill <b>Complaint Observation</b>, <b>Job Done</b>, <b>Hour Meter Reading</b>, <b>Software Version</b>; set <b>Add Consumption?</b> if you fitted spares.</>,
      <>Tap <b>Save</b>. Every visit is kept, so the call’s history builds up.</>,
    ],
    go: [{ to: '/field-calls', label: 'Field Call Register' }, { to: '/installations', label: 'Installation Calls' }, { to: '/pm-calls', label: 'PM Calls' }],
    note: { tone: 'warn', icon: '⚠️', body: <>A call marked <b>Solved - Report Completed</b> becomes read-only. Finish the report before you set it.</> },
  },
  {
    id: 'reallot', n: '4', title: 'Allot or re-allot calls', who: 'Reporting Manager · anyone with Edit call',
    lead: <>Hand calls to an engineer — one, or a hundred at once. This changes <b>only</b> who the call is allotted to; nothing else on the call is touched.</>,
    steps: [
      <>Open <b>Service Calls → Field Call Register</b> (Installation and PM work the same way).</>,
      <>Narrow the list to the calls you want to move — the <b>engineer chips</b>, the search boxes, or <B>⚑ Filters</B>.<Hint><b>Group</b> by Region, Engineer or Call Status if that is an easier way to find them.</Hint></>,
      <>Tick the box at the left of each call.<Hint>The box in the <b>header</b> takes everything currently listed — exactly what you can see, never rows a filter is hiding.</Hint></>,
      <>In the bar that appears, choose the engineer under <b>Allot to</b>.<Hint>The list is you and the engineers reporting to you.</Hint></>,
      <>Tap <B>Save</B>. The register reloads and the calls sit with their new engineer.</>,
    ],
    go: [{ to: '/field-calls', label: 'Field Call Register' }, { to: '/installations', label: 'Installation Calls' }, { to: '/pm-calls', label: 'PM Calls' }],
    note: { tone: 'warn', icon: '⚠️', body: <>A manager can allot only to their <b>own team</b> — that is enforced by the database, not just by the list. If a name you expect is missing, check that person’s <b>Reporting Manager</b> in the User Master: the list is built from it.</> },
  },
  {
    id: 'spare', n: '5', group: 'Spares', title: 'Raise a spare request', who: 'Any engineer',
    lead: <>Need a part? Raise a spare request — from the call it’s for (best, so it’s linked) or from the Spare Requests screen.</>,
    steps: [
      <><b>From a call:</b> on the call’s row tap <B>📦 Spare</B> — the call and machine fill in for you.<Hint>Or open <b>Spares → Spare Requests</b> and tap <B>＋ New Spare Request</B>.</Hint></>,
      <>Pick the <b>Part</b> and set the <b>Quantity</b>.</>,
      <>Add a line for each different part — they travel together on one request.</>,
      <>Tap <b>Submit</b>. It enters the chain: <b>RM → Commercial → NSM → Stores → Dispatch</b>.</>,
    ],
    go: [{ to: '/spare-requests', label: 'Spare Requests' }],
  },
  {
    id: 'approve', n: '6', title: 'Approve a spare request', who: 'Reporting Manager & approvers',
    lead: <>If you approve spares (RM, Commercial, NSM or Stores), you decide each part on its own — a request can go forward partly approved.</>,
    steps: [
      <>Open <b>Spares → Spare Requests</b>. Lines waiting on you show at your stage.</>,
      <>Read the line — part, quantity, and the call and customer it’s for.</>,
      <>Tap <B>✔ Approve</B> to pass it on, or <B>✖ Reject</B> to stop it.<Hint>Rejecting asks for a reason so the engineer knows why.</Hint></>,
      <>Decide each part separately — approve the good ones, reject the rest.</>,
    ],
    go: [{ to: '/spare-requests', label: 'Spare Requests' }],
    note: { tone: 'tip', icon: '💡', body: <>A Reporting Manager sees and approves only their <b>own team’s</b> spares. Only <b>Spare Coordinator</b> and <b>Hotline</b> can <B>⊘ Drop</B> a spare at any stage.</> },
  },
  {
    id: 'sparestatus', n: '7', title: 'View spare status', who: 'Any engineer',
    lead: <>Track a spare you raised from raise to receipt — every request shows exactly where it is in the chain.</>,
    steps: [
      <>Open <b>Spares → Spare Requests</b>.</>,
      <>Find your request; the <b>Stage</b> column shows where it is — <b>RM Approval → Commercial → NSM → Stores → Dispatched → Received</b> (or <b>Rejected / Dropped</b>).</>,
      <>Tap the item to open its detail — the full approval trail, DC number, courier and dates.</>,
      <>When Stores dispatches it, tap <B>Received</B> once it reaches you to close it off.<Hint>The tiles at the top count how many are at each stage.</Hint></>,
    ],
    go: [{ to: '/spare-requests', label: 'Spare Requests' }],
  },
  {
    id: 'partial', n: '8', title: 'Send part of a spare request', who: 'Stores',
    lead: <>If only some of what was asked for is on the shelf, send that much now — the rest stays in the queue and goes on a later stock out.</>,
    steps: [
      <>Open <b>Spares → Pending Dispatch</b> and tick the spares for one engineer.</>,
      <>On the line, set the quantity box to what you are actually sending — it will not let you exceed what is still due.<Hint>A line already part-sent shows <b>1 of 2 sent</b>.</Hint></>,
      <>Tap <B>🚚 Dispatch</B> and complete the courier and DC details.</>,
      <>The DC prints what <i>this</i> stock out carried. The balance stays in the queue for next time.</>,
    ],
    go: [{ to: '/spare-dispatch', label: 'Pending Dispatch' }],
    note: { tone: 'tip', icon: '📦', body: <>The engineer's hand stock rises by what you actually sent, not by what was requested.</> },
  },
  {
    id: 'receive', n: '9', title: 'Confirm a spare you received', who: 'Any engineer',
    lead: <>Confirm each delivery as it reaches you. A spare that arrives in two deliveries is confirmed twice.</>,
    steps: [
      <>Open <b>Spares → Spare Requests</b> and find the spare.</>,
      <>Tap <B>📥 Mark received</B> — it appears as soon as something has been sent, even if the rest is still to come.</>,
      <>Add a note if the condition or the count was not as expected.</>,
      <>The spare shows <b>Received</b> only once every unit has been confirmed.</>,
    ],
    go: [{ to: '/spare-requests', label: 'Spare Requests' }],
  },
  {
    id: 'reco', n: '10', title: 'Reconcile spares on a call', who: 'Spare Coordinator · Hotline · Admin',
    lead: <>Put the stock record right when a spare was fitted but never reported, when the quantity is wrong, or when something was booked in error.</>,
    steps: [
      <>Find the call in any register and tap <B>🧾</B> (also in the call's own view).<Hint>It carries the UCN, call number and engineer across for you.</Hint></>,
      <>Pick the part from that engineer's hand stock — the list only offers what they are actually holding — and set the quantity.</>,
      <>Add more parts with <b>＋ Add another part</b> if several went on the same call.</>,
      <>Type <b>why</b>. It is required, and it is kept with the entry.</>,
      <><b>Wrong quantity already reported?</b> In <b>Spares → Spare Consumption</b>, tap <B>✎</B> on the line and correct it.</>,
      <><b>Booked in error?</b> Set the quantity to <b>0</b>. The line is kept and marked <b>Voided</b>, and the spare goes back to the engineer's stock.</>,
    ],
    go: [{ to: '/spare-consumption', label: 'Spare Consumption' }],
    note: { tone: 'warn', icon: '⚠️', body: <>Nothing is ever deleted — a correction keeps what it was, who changed it and why. An engineer cannot consume more than they hold; if their report is refused, fix the hand stock here first.</> },
  },
  {
    id: 'feedback', n: '11', group: 'Quality & feedback', title: 'Customer feedback', who: 'Any engineer',
    lead: <>Feedback is captured on the call report, at the customer’s end. It’s then visible in the Customer Feedback screen.</>,
    steps: [
      <>While updating a call (step 3), fill the <b>Customer Feedback</b> questions with the customer — ratings and yes/no on the service and product.</>,
      <>The questions shown depend on the call type (Installation / PM / Field).</>,
      <>Saved feedback appears under <b>Quality &amp; Analytics → Customer Feedback</b>, one column per question.</>,
    ],
    go: [{ to: '/feedback', label: 'Customer Feedback' }],
    note: { tone: 'tip', icon: '⭐', body: <>Feedback is scoped like your calls — you see feedback for your own calls; managers and office roles see more.</> },
  },
  {
    id: 'password', n: '12', group: 'Your account & the app', title: 'Reset your password', who: 'Any engineer',
    lead: <>Reset it from sign-in if you’re locked out, or change it any time from your profile. The 👁️ button reveals what you typed.</>,
    steps: [
      <><b>Locked out?</b> On the sign-in screen tap <B>Forgot password?</B>.</>,
      <>Enter your Air Liquide / Gmail address — a reset link is emailed to you.</>,
      <>Open the link, type a new password (tap <b>👁️</b> to check it), confirm, and you’re back in.</>,
      <><b>Already signed in?</b> User menu (your name, top-right) → <b>My Profile</b> → <b>Password</b>.</>,
    ],
    go: [{ to: '/profile', label: 'My Profile', always: true }],
    note: { tone: 'tip', icon: '🔑', body: <>First time signing in? Use the starting password your admin gave you — the app then asks you to set your own.</> },
  },
  {
    id: 'build', n: '13', title: 'Find the Build ID (for support)', who: 'When something looks wrong',
    lead: <>The <b>Build ID</b> tells support exactly which version you’re on. It lives in the <b>footer</b> at the very bottom of every page.</>,
    steps: [
      <>Scroll to the very bottom of any screen.</>,
      <>Read the footer: <b>RITHI CRM</b>, the version, <b>build&nbsp;#</b> and <b>ID</b>.</>,
      <>Send support the <b>version</b> and <b>ID</b> — e.g. <K>v0.8.43 · build #131 · ID a1b2c3d4</K>.<Hint>On a narrow phone the ID may be hidden — turn sideways, or note the version and build #.</Hint></>,
      <>Say what you were doing and what happened. A screenshot helps.</>,
    ],
  },
  {
    id: 'spare-engineer', n: '14', title: 'Change the engineer on a spare order', who: 'Administrators',
    lead: <>An order raised against the wrong engineer can be moved — until the parts go out. Every move is kept.</>,
    steps: [
      <>Open the spare from <B>Spare Requests</B> and find <B>Engineer on this order</B> in the drawer.</>,
      <><B>✎ Change engineer</B> → pick who it is moving to, and say why. The reason is kept with the record, so write it for whoever reads it next.<Hint>The list is every engineer in the User Master.</Hint></>,
      <>Every change is listed underneath — from, to, who did it, when and why. The engineer it was taken off can see it too.</>,
    ],
    note: { tone: 'warn', icon: '⚠️', body: <><b>Once it is dispatched the name is fixed.</b> Hand stock is worked out FROM the order, so after the parts have gone out the engineer&rsquo;s name is not a label — it is whose parts they are. Changing it then would move stock from one person&rsquo;s balance to another&rsquo;s with nothing to show for it. Move the parts with a <B>Stock Transfer</B> instead.</> },
  },
  {
    id: 'sync', n: '15', title: 'Refresh, Sync & Clear Cache', who: 'Keeping your data fresh',
    lead: <>The app loads instantly from a copy on your device, then syncs the latest. Three controls, gentlest to strongest.</>,
    steps: [
      <><B>↻ Refresh</B> — on a screen’s toolbar. Pulls that screen’s latest rows now. Use it first if a list looks behind.</>,
      <><B>⟳ synced 3m ago</B> — a <i>status</i>, not a button. Shows how long since this screen synced; it also auto-syncs about every 30 minutes.</>,
      <><B>🧹 Clear Cache and Update</B> — the solid button at the bottom right of every screen, and in your name menu at the top right. Clears the copy held on this device and reloads the newest version. Use it after an update, or if the app looks stuck.<Hint>The app’s version of <K>Ctrl/⌘ + Shift + R</K>. It signs nobody out and deletes nothing from the database — only this device’s copy.</Hint></>,
    ],
    note: { tone: 'good', icon: '✅', body: <><b>Rule of thumb:</b> list looks old → <B>↻ Refresh</B>. Whole app looks old → <B>🧹 Clear Cache and Update</B>. Still wrong → note the <b>Build ID</b> and tell support.</> },
  },
  // ---- Quality: the review chain and the failure register --------------
  {
    id: 'dccr', n: '16', group: 'Quality — review & failure', title: 'Complete the Daily Call Review', who: 'Hotline, NSM, RM, Commercial',
    lead: <>Every solved call is reviewed. <b>Review 1</b> is the vigilance answer taken at registration. <b>Review 2</b> asks what the failure was, <b>Review 3</b> classifies it.</>,
    steps: [
      <>Open <b>Quality &amp; Analytics → Daily Call Review</b>.</>,
      <>Answer <b>Review 2</b>: Risk to Patient, Warranty Failure, Frequent Failure. All three must be answered before the stage counts as complete.</>,
      <>Answer <b>Review 3</b>: Complaint Grouping, Root Cause Key Word, Spare Category.</>,
      <>To answer many calls at once, tick them and use the bulk answer.<Hint>It refuses any call that failed inside the first year, or whose age is unknown — review those one at a time.</Hint></>,
    ],
    go: [{ to: '/daily-review', label: 'Daily Call Review' }],
    note: { tone: 'warn', icon: '⚠', body: <>Answering <b>Yes</b> to any of the three Review 2 questions <b>raises a Field Failure Report automatically</b>. Your name is recorded as the reviewer, on every path — including auto-save.</> },
  },
  {
    id: 'callreview', n: '17', title: 'Review a closed call’s report', who: 'Hotline, NSM, RM',
    lead: <>A second look at the <b>report</b> on a solved call — a different question from the Daily Call Review, which asks what the failure was.</>,
    steps: [
      <>Open <b>Quality &amp; Analytics → Call Review</b>. It lists solved calls only.</>,
      <>Read the visit and what was booked against it.</>,
      <>Missing a spare the engineer fitted? Book it here — it goes on as a <b>Reconciliation</b> line, visibly a correction rather than the engineer’s own entry.</>,
      <>If the report does not stand, <b>re-open the call</b>. If it does, mark it <b>Report Reviewed</b>.</>,
    ],
    go: [{ to: '/call-review', label: 'Call Review' }],
  },
  {
    id: 'ffr', n: '18', title: 'Work a Field Failure Report', who: 'NSM, RA/QA',
    lead: <>Failures that go back to manufacturing, on the controlled form <b>R-SER-03</b>. Reports are numbered <b>FFR - 001/26</b> by the system and restart each year.</>,
    steps: [
      <>Open <b>Quality &amp; Analytics → Field Failure Register</b>, tab <b>Register</b>.</>,
      <>Pick a report on the left. The middle shows the report; the right shows the call it came from — every visit, and the spares used.</>,
      <>Tap <B>Edit</B> at the top of the pane and fill in the investigation: observation, CAPA responsibility, CAPA number and status.</>,
      <>Tap <B>Print</B> for the R-SER-03 page, or <B>Word</B> to download it.<Hint>Your saved signature prints only where the form names you — anyone else gets a blank block to sign.</Hint></>,
      <>Set the report status to <b>Closed</b> when the investigation is done.</>,
    ],
    go: [{ to: '/failure-report', label: 'Field Failure Register' }],
    note: { tone: 'tip', icon: '↩', body: <>You do not create an FFR by hand — the Daily Call Review raises it. If the review is later changed to <b>No</b>, the report still stands and shows as <b>withdrawn</b>: a quality record is never deleted, and the withdrawal is itself worth seeing.</> },
  },
  {
    id: 'ffr-insights', n: '19', title: 'Ask the Field Failure Insights a question', who: 'NSM, RA/QA',
    lead: <>The Insights tab answers questions rather than showing totals.</>,
    steps: [
      <>Open <b>Field Failure Register → Insights</b>.</>,
      <>Click any bar, column or slice — a machine, a cover type, a month, a root cause, a customer. Every figure on the page re-answers for it.</>,
      <>Click the same mark again to clear it, or use <B>Clear all</B>.</>,
      <>Choices combine: pick a machine, then a month, and you are asking “for this machine, in this month”.</>,
    ],
    go: [{ to: '/failure-report', label: 'Field Failure Register' }],
    note: { tone: 'tip', icon: '🔎', body: <>The bar at the top always says how many of the total you are looking at, so a narrowed figure can never be mistaken for the whole register.</> },
  },
  // ---- Cover ------------------------------------------------------------
  {
    id: 'cover-entry', n: '20', group: 'Warranty & contract', title: 'Create a warranty sale or contract entry', who: 'Commercial',
    lead: <>A <b>sale entry</b> (SA) or <b>contract entry</b> (MC) is the deal; the machines covered by it sit underneath.</>,
    steps: [
      <>Open <b>Cover → Warranty Register</b> or <b>Contract Register</b>, tab <b>Entries</b>.</>,
      <>Tap <B>+ New entry</B>. <b>The number is already filled in</b>, continuing the series — change it if you need to.</>,
      <>Fill in the customer and the dates. Type the period in <b>months</b> and the years, the end date and the PM visits fill themselves in.<Hint>Warranty is three PM visits a year; a contract is one every six months. They are not the same.</Hint></>,
      <>Save the entry, then add the machines under it with <B>+ Add machine</B>.</>,
      <>On a contract machine line, entering a <b>Rate</b> fills in the 18% tax and the total after tax.</>,
    ],
    go: [{ to: '/warranties', label: 'Warranty Register' }, { to: '/contracts', label: 'Contract Register' }],
    note: { tone: 'tip', icon: '↺', body: <>A field left <b>empty</b> on a machine follows the entry above it — change a date on the entry and every machine moves with it. Type into a machine’s field to pin that machine to its own value; <b>↺ inherit</b> hands it back. The end date stays typeable, so a contract that does not run a whole number of months still works.</> },
  },
  {
    id: 'ownership', n: '21', title: 'Move a machine to another customer', who: 'Commercial',
    lead: <>One row per hand-over. The machine master follows the <b>latest</b> transfer.</>,
    steps: [
      <>Open <b>Cover → Ownership Transfer</b>.</>,
      <>Give the machine’s <b>serial</b>, the <b>party it is going to</b>, the date and the OT number from the paperwork.</>,
      <><b>Leave “From Party” blank</b> — it is filled in from whoever holds the machine now.</>,
    ],
    go: [{ to: '/ownership-transfer', label: 'Ownership Transfer' }],
    note: { tone: 'good', icon: '✓', body: <>Loading a historical list in date order works: each transfer moves the machine, so the next one starts from the right owner. A back-dated row loaded afterwards does not undo a later one.</> },
  },
  // ---- Stock ------------------------------------------------------------
  {
    id: 'handstock', n: '22', group: 'Stock', title: 'Check and correct hand stock', who: 'Engineer, Spare Coordinator',
    lead: <>What an engineer is holding. It is <b>worked out, never stored</b>: issued minus consumed, plus and minus transfers, minus returns.</>,
    steps: [
      <>Open <b>Spares → Hand Stock</b> and pick the engineer.</>,
      <>Each part shows what is in hand and how it got there.</>,
      <>If a level is wrong, the <b>Spare Coordinator</b> corrects the stock — the engineer does not book around it.</>,
    ],
    go: [{ to: '/handstock', label: 'Hand Stock' }],
    note: { tone: 'warn', icon: '⚠', body: <>Booking a spare is capped at the engineer’s balance — you cannot consume more than they hold. A refusal here means the stock is wrong, not the booking.</> },
  },
  {
    id: 'mrn', n: '23', title: 'Return spares to Stores, or move them', who: 'Engineer, Stores',
    lead: <>Parts going back to Stores, and parts moving between engineers.</>,
    steps: [
      <>Returning: open <b>Spares → Material Returns (MRN)</b> and raise the return. The stock goes back on the engineer’s balance.</>,
      <>Moving: open <b>Spares → Stock Transfer</b>, name the engineer it leaves and the one it reaches.<Hint>A transfer to the same person is held back and named.</Hint></>,
      <>To see what Stores has issued, open <b>Spares → Stock Out</b> — a flat list, separate from the dispatch queue.</>,
    ],
    go: [{ to: '/mrn', label: 'Material Returns' }, { to: '/stock-transfer', label: 'Stock Transfer' }, { to: '/stock-out', label: 'Stock Out' }],
  },
  // ---- Loading data ------------------------------------------------------
  {
    id: 'bulk', n: '24', group: 'Loading data', title: 'Load a register from a file', who: 'Admin, Coordinators',
    lead: <><b>Bulk Uploads</b> is the importer. Every register that can be loaded from a file is there, grouped by area.</>,
    steps: [
      <>Open <b>Data → Bulk Uploads</b> and pick the register that matches your export. Each one’s note says which export it takes.</>,
      <>Choose the CSV. Nothing is written yet — the screen first reports what it found.</>,
      <>Read the three counts: <b>ready</b>, <b>held back</b> (with the reason for each) and <b>kept on the row</b>.</>,
      <>Tap <B>Upload</B> when the counts look right.</>,
    ],
    go: [{ to: '/bulk-uploads', label: 'Bulk Uploads' }],
    note: { tone: 'tip', icon: '📄', body: <>A column the register does not recognise is <b>kept on the row</b>, not thrown away — tell us what an unfamiliar heading should be and it can be made a proper column. A letterhead above the headings is fine, and so is a tab-separated file.</> },
  },
  {
    id: 'ffr-years', n: '25', title: 'Load the old Field Failure years', who: 'Admin, RA/QA',
    lead: <>The registers from 2016 onwards, into one table. The years do not have to agree with each other, or with this year.</>,
    steps: [
      <>Export one year’s tab as CSV.</>,
      <>Open <b>Data → Bulk Uploads → Quality → Field Failure Register (any year)</b> and load it.</>,
      <>Repeat for each year, in any order, as many times as you need.</>,
    ],
    go: [{ to: '/bulk-uploads', label: 'Bulk Uploads' }],
    note: { tone: 'good', icon: '✓', body: <>Matched on the <b>FFR number and the machine</b>: one paper report often covers several units, and each keeps its own row. Loaded reports are marked as migrated and keep the sheet’s own “Raised by” name rather than yours.</> },
  },
  // ---- Workshop ----------------------------------------------------------
  {
    id: 'indoor', n: '26', group: 'Workshop', title: 'Book a unit through the workshop', who: 'Indoor engineer',
    lead: <>Work on a unit in the workshop. Two things are asked separately: <b>whose property</b> the unit is, and <b>what is being done</b> to it.</>,
    steps: [
      <>Open <b>Service → Indoor Service Register</b> and receive the unit in.</>,
      <>Record <b>cleaning and disinfection</b> — before anyone works on it.</>,
      <>Record the <b>findings and work done</b>, including any parts harvested from the unit.</>,
      <>Sign the <b>quality check</b>.</>,
      <><b>Dispatch</b> the unit back.</>,
    ],
    go: [{ to: '/indoor', label: 'Indoor Service Register' }],
    note: { tone: 'warn', icon: '⚠', body: <>A job does not need a call — a demo unit has none. A part harvested from a unit cannot go back into stock until decontamination is recorded.</> },
  },
  // ---- Analysis ----------------------------------------------------------
  {
    id: 'objective', n: '27', group: 'Analysis & reports', title: 'Re-calculate an objective and show its working', who: 'NSM, RA/QA',
    lead: <>The year’s quality and business objectives, with targets, owners and the month-by-month actual.</>,
    steps: [
      <>Open <b>Quality &amp; Analytics → Objective</b>.</>,
      <>Tap <B>Re-Calculate</B> when you want the figures brought up to date. It never runs on its own.</>,
      <>To see how a figure was reached, ask it for the <b>evidence</b> — the calls, the machines and the arithmetic come out on three tabs.</>,
    ],
    go: [{ to: '/objective', label: 'Objective' }],
    note: { tone: 'good', icon: '✓', body: <>Re-Calculate writes only objectives that have a formula, only up to this month, and <b>never a figure somebody typed</b>. A quarterly objective reports in its quarter’s last month; the other two read NA, not zero.</> },
  },
  {
    id: 'exports', n: '28', title: 'Take the reports out', who: 'Managers, Coordinators',
    lead: <>Three exports, each answering a different question.</>,
    steps: [
      <><b>Consumption Report</b> — one row per spare booked, with its call and that call’s latest visit.</>,
      <><b>Not Consumed Against this Call</b> — parts sent and not fully accounted for: <b>NOT USED</b> where none was booked, <b>SHORT</b> where less was booked than sent.</>,
      <><b>KPI Export</b> — the workbook’s Field_INST tab in its own column order.</>,
      <>For consumption patterns rather than a list, use <b>Spare Insights</b> and set the window.</>,
    ],
    go: [{ to: '/exports/consumption', label: 'Consumption Report' }, { to: '/exports/unused', label: 'Not Consumed' }, { to: '/spare-insights', label: 'Spare Insights' }],
    note: { tone: 'tip', icon: '📅', body: <>On the Consumption Report the two visit dates differ on purpose: <b>entry</b> is when the register was told, <b>visit</b> is when the engineer was there.</> },
  },
  // ---- Masters -----------------------------------------------------------
  {
    id: 'masters', n: '29', group: 'Masters & search', title: 'Add or retire a value on a master list', who: 'Whoever maintains that list',
    lead: <>The value lists behind the dropdowns. A value not on a master cannot be typed into a form that reads it.</>,
    steps: [
      <>Open <b>Masters → All Masters</b> and choose the list.</>,
      <>Add the value. It is available in the pickers immediately.</>,
      <>To stop a value being offered, <b>deactivate</b> it rather than deleting it.</>,
    ],
    go: [{ to: '/masters', label: 'All Masters' }],
    note: { tone: 'warn', icon: '⚠', body: <>Deactivating keeps every record that already uses the value reading correctly. Rights are <b>per list</b>, so somebody can maintain one without the others.</> },
  },
  {
    id: 'lookup', n: '30', title: 'Find a machine or a customer', who: 'Anyone',
    lead: <>Everything known about one machine or one customer, in one place.</>,
    steps: [
      <>Open <b>Masters → Product &amp; Party Search</b>.</>,
      <>Search by serial to reach a machine, or by name to reach a customer.</>,
      <>You get the cover, the calls, the visits and the spares against it.</>,
    ],
    go: [{ to: '/lookup', label: 'Product & Party Search' }],
  },
  // ---- Personal & admin ---------------------------------------------------
  {
    id: 'signature', n: '31', group: 'Your account & the app', title: 'Save your signature', who: 'Anyone',
    lead: <>Save it once and it prints on documents that name you — the Delivery Challan, the Field Failure Report.</>,
    steps: [
      <>Open your <b>Profile</b> (your name, top right) and find <b>My Signature</b>.</>,
      <>Upload or draw it, and save.</>,
    ],
    go: [{ to: '/profile', label: 'Profile', always: true }],
    note: { tone: 'good', icon: '🔒', body: <><b>Only you can see it or set it</b> — not your manager, not an administrator. An administrator can ask who has saved one and remove a leaver’s, but can never read one. It is a reproduced image, not a cryptographic signature.</> },
  },
  {
    id: 'tracker', n: '32', title: 'Use the Tracker', who: 'Anyone with access',
    lead: <>The shared activity list — what is being chased and by whom.</>,
    steps: [
      <>Open <b>Tracker</b>.</>,
      <>Add an item, or edit one. Anyone who can open the page can do both.</>,
      <>Set <b>With whom</b> to the team that is chasing it.</>,
      <>Mark it <b>Done</b> or <b>Dropped</b> when it is finished — the page hides it, nothing is deleted.</>,
    ],
    go: [{ to: '/tracker', label: 'Tracker' }],
  },
  {
    id: 'access', n: '33', title: 'Give somebody access', who: 'Admin',
    lead: <>Who can sign in, and what each role may do.</>,
    steps: [
      <>Open <b>Admin → User Access</b> to add the person and set their role.</>,
      <>Open <b>Admin → Roles &amp; Permissions</b> to change what a role may do — page by page and action by action.</>,
      <>Tick the <b>page</b> and the <b>actions</b> the role needs.</>,
    ],
    go: [{ to: '/users', label: 'User Access' }, { to: '/roles', label: 'Roles & Permissions' }],
    note: { tone: 'warn', icon: '⚠', body: <>If somebody opens a register and sees <b>nothing</b>, it is almost always a missing <b>action</b> rather than a missing page — a role with some permissions but not “View calls” sees an empty screen with everything apparently granted.</> },
  },
];

// One task's screenshot. Everyone sees the picture + caption; an admin gets an
// upload / replace / caption / remove strip (the picture is a downscaled data
// URL saved in help_screenshots). Renders nothing for a non-admin with no shot.
function HelpShotBlock({ sectionId, title, shot, isAdmin, busy, onUpload, onCaption, onRemove }: {
  sectionId: string; title: string; shot?: HelpShot; isAdmin: boolean; busy: boolean;
  onUpload: (id: string, f: File) => void; onCaption: (id: string, c: string) => void; onRemove: (id: string) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  if (!shot && !isAdmin) return null;
  const pick = (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]; e.target.value = '';
    if (f) onUpload(sectionId, f);
  };
  return (
    <div className="kb-shot">
      {shot ? (
        <figure className="kb-shot-fig">
          <img src={shot.image} alt={shot.caption || `${title} — screenshot`} loading="lazy" />
          {isAdmin
            ? <input className="input kb-shot-cap" defaultValue={shot.caption} placeholder="Caption (optional)"
                onBlur={(e) => { if (e.target.value !== shot.caption) onCaption(sectionId, e.target.value); }} />
            : shot.caption && <figcaption>{shot.caption}</figcaption>}
        </figure>
      ) : (
        <button className="kb-shot-add" onClick={() => fileRef.current?.click()} disabled={busy}>
          {busy ? 'Uploading…' : '📷 Add a screenshot for this step'}
        </button>
      )}
      {isAdmin && (
        <div className="kb-shot-actions">
          <input ref={fileRef} type="file" accept="image/*" hidden onChange={pick} />
          {shot && <button className="btn btn-sm" onClick={() => fileRef.current?.click()} disabled={busy}>{busy ? 'Uploading…' : '📷 Replace'}</button>}
          {shot && <button className="btn btn-sm btn-ghost" onClick={() => onRemove(sectionId)} disabled={busy}>🗑 Remove</button>}
        </div>
      )}
    </div>
  );
}

export function HowToUse() {
  const { isAdmin, can } = useAuth();
  const navigate = useNavigate();
  const onDb = supabaseConfigured();

  const [shots, setShots] = useState<Record<string, HelpShot>>({});
  const [shotBusy, setShotBusy] = useState<string | null>(null);
  const [howtos, setHowtos] = useState<KbArticle[]>([]);
  const [msg, setMsg] = useState<{ tone: 'ok' | 'error' | 'info'; text: string } | null>(null);

  // A task's "Open …" targets the signed-in role may actually reach (admins see
  // all); `always` targets (a personal screen) are shown to everyone.
  const openable = (go?: GoTo[]) => (go ?? []).filter((g) => g.always || isAdmin || can(actionForPath(g.to)));

  // Scroll to a guide section. `block: 'start'` with a little room above, so
  // the heading is not tucked under the sticky header; `smooth` because a page
  // that jumps leaves the reader working out where they landed.
  const jumpTo = (id: string) => {
    const el = document.getElementById(`kb-${id}`);
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    // A section somebody jumped to is briefly marked, so a strip of fifteen
    // links does not leave them scanning for which one they chose.
    el.classList.add('kb-jumped');
    window.setTimeout(() => el.classList.remove('kb-jumped'), 1600);
  };

  // Guide screenshots — best-effort; the guide still shows if this fails
  // (e.g. the migration isn't applied yet).
  useEffect(() => {
    if (!onDb) return;
    let live = true;
    helpShots().then((s) => { if (live) setShots(s); }).catch(() => {});
    // The team's own how-to articles. Best-effort too: the written guide is
    // static and must render whether or not the database is reachable, because
    // "how do I sign in" is a question asked when things are not working.
    kbList()
      .then((all) => { if (live) setHowtos(all.filter((a) => a.category === HOWTO_CATEGORY)); })
      .catch(() => {});
    return () => { live = false; };
  }, [onDb]);

  const uploadShot = async (id: string, f: File) => {
    setShotBusy(id);
    try {
      const image = await fileToDataUrl(f, 1280);
      const caption = shots[id]?.caption ?? '';
      const res = await helpShotSet(id, image, caption);
      if (!res.ok) { setMsg({ tone: 'error', text: /help_screenshots|does not exist|schema cache/i.test(res.error ?? '') ? 'Screenshots need migration 0043_help_screenshots.sql — run it in the Supabase SQL editor.' : (res.error ?? 'Upload failed.') }); return; }
      setShots((p) => ({ ...p, [id]: { section_id: id, image, caption, updated_at: new Date().toISOString() } }));
    } finally { setShotBusy(null); }
  };
  const captionShot = async (id: string, caption: string) => {
    const s = shots[id]; if (!s) return;
    setShots((p) => ({ ...p, [id]: { ...s, caption } }));
    const res = await helpShotSet(id, s.image, caption);
    if (!res.ok) setMsg({ tone: 'error', text: res.error ?? 'Could not save the caption.' });
  };
  const removeShot = async (id: string) => {
    if (!confirm('Remove this screenshot?')) return;
    setShotBusy(id);
    const res = await helpShotClear(id);
    setShotBusy(null);
    if (!res.ok) { setMsg({ tone: 'error', text: res.error ?? 'Remove failed.' }); return; }
    setShots((p) => { const n = { ...p }; delete n[id]; return n; });
  };

  const sorted = useMemo(
    () => [...howtos].sort((a, b) => a.title.localeCompare(b.title)), [howtos]);

  return (
    <div>
      <PageHeader
        title="How to Use RITHI CRM"
        subtitle="Every task, step by step, with the exact button to tap."
        icon="📖" />

      {msg && (
        <div className={`sheet-banner sheet-banner-${msg.tone}`}>
          <span>{msg.text}</span>
          <button className="btn btn-ghost btn-sm" onClick={() => setMsg(null)}>✕</button>
        </div>
      )}

      <p className="kb-intro">Everything you do day to day — each task shows the exact button to tap. Jump to a task:</p>
      {/* NOT ANCHORS. `href="#kb-3"` looks like the obvious way to jump down a
          long page and is the one thing that cannot work here: the app runs on
          a HashRouter, so the fragment IS the route — clicking one rewrote the
          route to `#kb-3`, which matches nothing, and every link on this strip
          landed on the Dashboard (reported 2026-09-08). Scrolling to the
          element directly is what the anchor was pretending to do anyway, and
          it leaves the address bar alone. */}
      {/* Grouped, because the list outgrew being scannable flat: it covers every
          module now, not the handful of call-and-spare tasks it started as. A
          task carries the heading it OPENS, so the order of the array is still
          the order on the page and nothing had to be re-nested. */}
      <div className="kb-jump">
        {SECTIONS.map((s) => (
          <span key={s.id} className="kb-jump-item">
            {s.group && <span className="kb-jump-group">{s.group}</span>}
            <button type="button" onClick={() => jumpTo(s.id)} title={`Jump to “${s.title}”`}>
              <span className="kb-jn">{s.n}</span>{s.title}
            </button>
          </span>
        ))}
      </div>

      {SECTIONS.map((s) => (
        <section className="kb-sec" id={`kb-${s.id}`} key={s.id}>
          {s.group && <div className="kb-group">{s.group}</div>}
          <div className="kb-sec-head"><span className="kb-num">{s.n}</span><h2>{s.title}</h2></div>
          <div className="kb-who">{s.who}</div>
          <p className="kb-lead">{s.lead}</p>
          <ol className="kb-steps">{s.steps.map((st, i) => <li key={i}>{st}</li>)}</ol>
          <HelpShotBlock sectionId={s.id} title={s.title} shot={shots[s.id]} isAdmin={isAdmin}
            busy={shotBusy === s.id} onUpload={uploadShot} onCaption={captionShot} onRemove={removeShot} />
          {s.note && <div className={`kb-note ${s.note.tone}`}><span className="kb-ic">{s.note.icon}</span><div>{s.note.body}</div></div>}
          {openable(s.go).length > 0 && (
            <div className="kb-go">
              {openable(s.go).map((g) => (
                <button key={g.to} className="btn btn-primary btn-sm" onClick={() => navigate(g.to)}>Open {g.label} →</button>
              ))}
            </div>
          )}
        </section>
      ))}

      {/* ---------- The team's own how-to articles ----------
          Written by the team rather than by this file, and they belong HERE
          rather than among the field solutions: somebody looking for
          instructions looks for instructions. Quiet when there are none — an
          empty heading on every visit is noise. */}
      {sorted.length > 0 && (
        <>
          <h2 className="kb-h2" style={{ marginTop: 34 }}>✍️ How-to articles from the team</h2>
          <p className="kb-intro" style={{ margin: '2px 0 10px' }}>
            Written by people here and filed under <b>{HOWTO_CATEGORY}</b>. Open one to read it,
            or add your own from <b>Field Solutions</b>.
          </p>
          <div className="kb-cards">
            {sorted.map((a) => (
              <button key={a.id} className="kb-card"
                onClick={() => navigate('/knowledge-base', { state: { openArticle: a.id } })}>
                <div className="kb-card-top">
                  <span className="kb-cat">{a.category}</span>
                  {a.product && <span className="kb-prod">🩺 {a.product}</span>}
                </div>
                <div className="kb-card-title">{a.title}</div>
                <div className="kb-card-prev">{htmlToText(a.body).slice(0, 160) || '—'}</div>
                <div className="kb-card-meta">{a.author_name || 'Someone'} · {fmtLongDate(a.updated_at)}{a.attachments?.length ? ` · 📎 ${a.attachments.length}` : ''}</div>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
