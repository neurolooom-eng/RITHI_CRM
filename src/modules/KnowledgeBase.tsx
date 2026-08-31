import { type ReactNode } from 'react';
import { PageHeader } from '../components/ui/ui';
import './knowledgebase.css';

// ===========================================================================
// KNOWLEDGE BASE — "How to use RITHI CRM". A plain, always-available help page
// (every role sees it; it is not an RBAC-gated module). Step-by-step for the
// everyday engineer tasks, using the real button labels from the app.
// ===========================================================================

const B = ({ children }: { children: ReactNode }) => <span className="kb-btn">{children}</span>;
const K = ({ children }: { children: ReactNode }) => <span className="kb-key">{children}</span>;
const Hint = ({ children }: { children: ReactNode }) => <span className="kb-hint">{children}</span>;

interface Sec { id: string; n: string; title: string; who: string; lead: ReactNode; steps: ReactNode[]; note?: { tone: 'tip' | 'warn' | 'good'; icon: string; body: ReactNode } }

const SECTIONS: Sec[] = [
  {
    id: 'request', n: '1', title: 'Request a call', who: 'Any engineer',
    lead: <>When a customer reports a problem, raise a <b>call registration request</b>. The Hotline turns it into a live call with a UCN. You can put more than one machine on one request.</>,
    steps: [
      <>Open <b>Service Calls → Request Registration</b> from the left menu.</>,
      <>Tap <B>＋ New Request</B> at the top right.</>,
      <>Pick the <b>Party</b> (customer), then <b>Product</b> and <b>Serial No</b> — the list is filtered to what that customer owns.<Hint>Choosing the serial auto-fills the machine details.</Hint></>,
      <>Choose the <b>Standard Complaint</b> and type the <b>Reported Problem</b> in the customer’s words.</>,
      <>More than one machine? Tap <b>Add another</b> and repeat — all of them share one request.</>,
      <>Tap <b>Submit</b>. It appears under <b>Pending Registrations</b> until the Hotline registers it.</>,
    ],
    note: { tone: 'tip', icon: '📌', body: <>A request without a UCN stays in <b>Pending Registrations</b>. Once the Hotline registers it, it becomes a call with a UCN and shows in the <b>Field Call Register</b>.</> },
  },
  {
    id: 'update', n: '2', title: 'Update a call after your visit', who: 'Any engineer',
    lead: <>After you attend a machine, record what you did. The <b>Call Status</b> you choose is what moves the call forward — or closes it.</>,
    steps: [
      <>Open <b>Service Calls → Field Call Register</b> (or Installation / PM).</>,
      <>Find your call. Engineers see <B>🔵 Open only</B> by default — switch to <B>⚪ All calls</B> to see closed ones.<Hint>Search by UCN, party, product or serial if the list is long.</Hint></>,
      <>On the call’s row, tap <B>📝 Update</B>.</>,
      <>Set the <b>Call Status</b>.<Hint><b>Unsolved</b> = still broken · <b>Solved - Report Pending</b> = fixed, report to finish · <b>Solved - Report Completed</b> = done.</Hint></>,
      <>Fill the work details — <b>Complaint Observation</b>, <b>Job Done</b>, <b>Hour Meter Reading</b>, <b>Software Version</b> — and set <b>Add Consumption?</b> if you fitted spares.</>,
      <>Tap <b>Save</b>. Each visit is kept, so the call’s history builds up over time.</>,
    ],
    note: { tone: 'warn', icon: '⚠️', body: <>A call marked <b>Solved - Report Completed</b> becomes read-only. Make sure the report is finished before you set it.</> },
  },
  {
    id: 'spare', n: '3', title: 'Raise a spare request', who: 'Any engineer',
    lead: <>Need a part? Raise a spare request — from the call it’s for (best, so it’s linked) or from the Spare Requests screen.</>,
    steps: [
      <><b>From a call:</b> on the call’s row, tap <B>📦 Spare</B>. The call and machine are filled in for you.<Hint>Or open <b>Spares → Spare Requests</b> and tap <B>＋ New Spare Request</B>.</Hint></>,
      <>Pick the <b>Part</b> and set the <b>Quantity</b>.</>,
      <>Add another line for each different part you need — they travel together on one request.</>,
      <>Tap <b>Submit</b>. It enters the approval chain: <b>RM → Commercial → NSM → Stores → Dispatch</b>.</>,
      <>Track it any time under <b>Spares → Spare Requests</b>; the <b>Stage</b> column shows where it is.</>,
    ],
  },
  {
    id: 'approve', n: '4', title: 'Approve a spare request', who: 'Reporting Manager & approvers',
    lead: <>If you approve spares (Reporting Manager, Commercial, NSM or Stores), you decide each part on its own — one request can go forward partly approved.</>,
    steps: [
      <>Open <b>Spares → Spare Requests</b>. Lines waiting on you show at your stage.</>,
      <>Read the line — part, quantity, and the call and customer it’s for.</>,
      <>Tap <B>✔ Approve</B> to pass it to the next stage, or <B>✖ Reject</B> to stop it.<Hint>Rejecting asks for a reason so the engineer knows why.</Hint></>,
      <>Decide each part separately — approve the ones that are fine and reject the rest.</>,
      <>The <b>Stage</b> updates immediately; the engineer sees the new status on their side.</>,
    ],
    note: { tone: 'tip', icon: '💡', body: <>Only <b>Spare Coordinator</b> and <b>Hotline</b> can <B>⊘ Drop</B> a spare (cancel it) at any stage — everyone else uses Approve / Reject at their own stage.</> },
  },
  {
    id: 'password', n: '5', title: 'Reset your password', who: 'Any engineer',
    lead: <>Two ways: reset it from the sign-in screen if you’re locked out, or change it any time from your profile. The 👁️ button reveals what you typed so you can check it.</>,
    steps: [
      <><b>Locked out?</b> On the sign-in screen tap <B>Forgot password?</B>.</>,
      <>Enter your Air Liquide / Gmail address and submit — a reset link is emailed to you.</>,
      <>Open the link, type a new password (tap <b>👁️</b> to check it), confirm, and you’re back in.</>,
      <><b>Already signed in?</b> Open the user menu (your name, top-right) → <b>My Profile</b> → <b>Password</b>.</>,
      <>Enter your current password and a new one, confirm, and save.</>,
    ],
    note: { tone: 'tip', icon: '🔑', body: <>First time signing in? Use the starting password your admin gave you — the app then asks you to set your own.</> },
  },
  {
    id: 'build', n: '6', title: 'Find the Build ID (for support)', who: 'When something looks wrong',
    lead: <>If you report a problem, the <b>Build ID</b> tells support exactly which version you’re on. It lives in the <b>footer</b> at the very bottom of every page.</>,
    steps: [
      <>Scroll to the very bottom of any screen.</>,
      <>Read the footer line: <b>RITHI CRM</b>, the version, <b>build&nbsp;#</b>, and <b>ID</b>.</>,
      <>Send support the <b>version</b> and the <b>ID</b> — e.g. <K>v0.8.42 · build #128 · ID a1b2c3d4</K>.<Hint>On a narrow phone the ID may be hidden — turn the phone sideways, or note the version and build&nbsp;#.</Hint></>,
      <>Say what you were doing and what happened. A screenshot helps.</>,
    ],
  },
  {
    id: 'sync', n: '7', title: 'Refresh, Sync & Force update', who: 'Keeping your data fresh',
    lead: <>The app loads instantly from a copy on your device, then quietly syncs the latest. Three controls, from gentlest to strongest — reach for the next one only if the last didn’t help.</>,
    steps: [
      <><B>↻ Refresh</B> — on a screen’s toolbar. Pulls that screen’s latest rows from the database now. Use it first if a list looks behind.</>,
      <><B>⟳ synced 3m ago</B> — not a button, a <i>status</i>. It shows how long since this screen last synced; the app also auto-syncs about every 30 minutes.</>,
      <><B>⟳ Force update</B> — in the footer. The big one: clears the on-device cache and reloads the newest published version. Use it after an update, or if the app looks stuck or stale.<Hint>It’s the app’s version of <K>Ctrl/⌘ + Shift + R</K>.</Hint></>,
    ],
    note: { tone: 'good', icon: '✅', body: <><b>Rule of thumb:</b> list looks old → <B>↻ Refresh</B>. Whole app looks old or you were told there’s an update → <B>⟳ Force update</B>. Still wrong after that → note the <b>Build ID</b> (step 6) and tell support.</> },
  },
];

export function KnowledgeBase() {
  return (
    <div>
      <PageHeader title="Knowledge Base" subtitle="How to use RITHI CRM — step by step for the everyday engineer tasks." icon="📚" />

      <p className="kb-intro">Everything you do day to day — logging a call, updating it after a visit, requesting spares, and getting yourself unstuck. Each task shows the exact button to tap. Jump to a task:</p>

      <div className="kb-jump">
        {SECTIONS.map((s) => (
          <a key={s.id} href={`#kb-${s.id}`}><span className="kb-jn">{s.n}</span>{s.title}</a>
        ))}
      </div>

      {SECTIONS.map((s) => (
        <section className="kb-sec" id={`kb-${s.id}`} key={s.id}>
          <div className="kb-sec-head">
            <span className="kb-num">{s.n}</span>
            <h2>{s.title}</h2>
          </div>
          <div className="kb-who">{s.who}</div>
          <p className="kb-lead">{s.lead}</p>
          <ol className="kb-steps">
            {s.steps.map((st, i) => <li key={i}>{st}</li>)}
          </ol>
          {s.note && (
            <div className={`kb-note ${s.note.tone}`}>
              <span className="kb-ic">{s.note.icon}</span>
              <div>{s.note.body}</div>
            </div>
          )}
        </section>
      ))}
    </div>
  );
}
