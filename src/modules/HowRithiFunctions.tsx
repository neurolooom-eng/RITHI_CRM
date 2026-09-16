import { type ReactNode } from 'react';
import { PageHeader } from '../components/ui/ui';
import { STATE_COLOUR } from '../lib/callstate';
import './knowledgebase.css';
import './howrithifunctions.css';

// ===========================================================================
// HOW RITHI FUNCTIONS — the third topic under Knowledge Base.
//
// The user, 2026-09-16: "Add - How the Masters come into Picture when a Call is
// Raised based on Direct Customer Call -- Where I will use the 'New Field Call'
// Option to Register the Call. Add this as Flow1, move the existing flow to
// Flow2. [...] And add this to the Knowledgebase - How RITHI Functions."
//
// A DIFFERENT QUESTION FROM "HOW TO USE RITHI CRM", which is why it is a topic
// of its own rather than two more numbered tasks on that page. How to Use
// answers *what do I click*; this answers *why does the form already know
// that*. Somebody who has learned the clicks and still cannot explain where the
// cover came from — or who types a customer name and finds it unpickable — is
// asking this question, and the how-to page has no place to put the answer.
//
// TWO FLOWS, AND THE ORDER IS THE USER'S. Flow 1 is the DIRECT customer call:
// they are on the phone, you open New Field Call, and every field is answered
// by a master. Flow 2 is the longer life of a call raised from a request. Flow
// 1 first because it is the one where the masters are visible doing their work:
// nothing is carried in from a request, so everything on screen had to come
// from somewhere.
//
// DOCUMENTATION ONLY (the user, same message: "Only the Documentation"). This
// page describes the system; it changes nothing about it, and every statement
// here is one the code already enforces. Where the two disagree the code is the
// fact and this page is the bug — the same rule `docs/HOW_TO_USE.md` carries.
//
// ALWAYS OPEN, like the other two Knowledge Base entries. It is not a module
// and has no permission: there is nothing here to grant, and a page explaining
// how the system works is of most use to the person who has just been refused
// something by it.
// ===========================================================================

const B = ({ children }: { children: ReactNode }) => <span className="kb-btn">{children}</span>;

interface Step {
  n: string;
  title: string;
  /** What actually happens at this step. */
  body: ReactNode;
  /** The masters this step reads — the left-hand answer to the user's question. */
  masters?: ReactNode[];
  /** What is refused, and what is demanded. */
  rules?: { kind: 'refuses' | 'demands'; body: ReactNode }[];
}

interface Flow { id: string; n: string; title: string; lead: ReactNode; steps: Step[] }

const FLOWS: Flow[] = [
  {
    id: 'direct',
    n: 'Flow 1',
    title: 'A customer rings, and you register the call yourself',
    lead: (
      <>
        The Hotline&rsquo;s own path: <B>New Field Call</B>, with the customer on the phone.
        No request exists, so nothing is carried in — <b>every fact on the form comes from a
        master</b>, and the order you fill it in is the order the masters answer.
        {' '}<b>Almost nothing here is typed.</b> Four things are: the complaint in the
        customer&rsquo;s words, the complaint date, the three vigilance answers, and the
        caller&rsquo;s name and number. Everything else is looked up — and where it is looked up
        it is <b>locked</b>, because the place to correct it is the master, not the call.
      </>
    ),
    steps: [
      {
        n: '1', title: 'Find the customer',
        body: (
          <>
            Type into <b>Party Name</b>. It searches as you type rather than loading every
            customer, and it runs two lists together: the people who <i>own a machine</i> lead,
            and the Party Master guarantees a name on file can be found at all. A customer who
            owns nothing is shown greyed, reading <i>&ldquo;no machine on record&rdquo;</i> —
            shown rather than hidden, because the reason on the row beats a bare
            &ldquo;nothing matches&rdquo;.
          </>
        ),
        masters: [
          <><b>Product Database</b> — one row per machine. This is what makes a customer selectable.</>,
          <><b>Party Master</b> — the customer list, so a name on file is findable even before a machine is against it.</>,
        ],
        rules: [
          { kind: 'demands', body: <>A customer who owns a machine. On a field call there is nothing to service otherwise.</> },
          { kind: 'refuses', body: <>A customer with no machine — <b>except on an installation</b>, which reaches somebody who has none yet. There, a new customer may be typed in.</> },
        ],
      },
      {
        n: '2', title: 'Pick the machine — product, then serial',
        body: (
          <>
            Two steps rather than one box, because that is how the caller knows their own
            equipment: <i>the ORION-G</i>, and then the serial off the label. The serial list is
            the machines <b>this customer</b> holds of <b>that</b> product. The customer&rsquo;s
            Serviceman is fetched once here, the moment the party settles — not again for every
            serial.
          </>
        ),
        masters: [<><b>Party Master → Serviceman</b>, held as the fallback engineer.</>,
                  <><b>Product Database</b> — this customer&rsquo;s products, then the serials of the chosen one.</>],
        rules: [
          { kind: 'demands', body: <>The <b>serial number</b>. A service record that names a product but not the individual device is not a record of anything.</> },
        ],
      },
      {
        n: '3', title: 'What the machine brings with it',
        body: (
          <>
            Choosing the serial fills eight fields at once off that machine&rsquo;s row: the city
            and state, the <b>cover</b> it is under, and its warranty and contract particulars.
            They arrive <b>locked</b> — the form says <i>From Product Database (locked)</i>.
            That is the point, not a restriction: a cover typed onto a call is true of that call
            and nothing else, so the next call on the same machine disagrees with it.
          </>
        ),
        masters: [
          <><b>Warranty Register</b> — number, start, end.</>,
          <><b>Contract Register</b> — number, start, end, CMC or AMC.</>,
          <>The <b>cover vocabulary</b> — WGP · OGP · CMC · AMC, and nothing else.</>,
        ],
        rules: [
          { kind: 'refuses', body: <>Typing over them. Wrong cover? Correct the machine in Product Database, or the register that feeds it — then every call reads right, including the ones already raised.</> },
        ],
      },
      {
        n: '4', title: 'Who it goes to',
        body: (
          <>
            <b>The machine wins.</b> Call Allocated To is filled from the machine&rsquo;s own
            Service Engineer; where the machine names nobody, the customer&rsquo;s Serviceman from
            the Party Master answers instead. Two masters, one box, and a stated precedence — so
            the common case needs no decision and the awkward one still has an answer.
          </>
        ),
        masters: [
          <><b>Product Database → Service Engineer</b> (the machine&rsquo;s own).</>,
          <><b>Party Master → Serviceman</b> (the customer&rsquo;s).</>,
          <><b>User Master</b> — the list the box can be changed to.</>,
        ],
        rules: [
          { kind: 'refuses', body: <>A typed name. What it can be changed <i>to</i> is the User Master — the directory plus the real sign-ins, deduplicated.</> },
        ],
      },
      {
        n: '5', title: 'What is wrong — two fields, doing two jobs',
        body: (
          <>
            <b>Standard Complaint</b> is the controlled one: every count, filter and
            repeat-failure match downstream runs on that value. <b>Complaint Reported</b> is the
            customer&rsquo;s own words, free text, and is the one you read back to them. Under
            both, past calls on this machine and fault are offered —
            <i> &ldquo;chosen on 85 similar calls&rdquo;</i> — while the call is being registered
            and not afterwards.
          </>
        ),
        masters: [
          <><b>Standard Complaint master</b> — the controlled fault vocabulary.</>,
          <><b>Past calls on this machine</b>, with how often each was chosen.</>,
        ],
        rules: [
          { kind: 'refuses', body: <><b>Free text in Standard Complaint, in any module.</b> A typed value is a master entry that does not exist, and it matches nothing downstream. An empty master is a <i>master</i> problem — the field says so and stays a picker.</> },
          { kind: 'demands', body: <>Complaint Reported, and the complaint date — which is what every failure analysis dates the failure by.</> },
        ],
      },
      {
        n: '6', title: 'Save — and the database does the rest',
        body: (
          <>
            Three things are assigned on save and none can be supplied by the app. The <b>UCN</b>
            {' '}(<code>26I12F0002</code> — the second <b>F</b>ield call of 12 September 2026).
            The <b>Call Number</b> (<code>CL26#####</code> from a running series, which is what a
            <i> direct</i> customer call gets; one raised from a request carries the
            request&rsquo;s own key). And both registrant columns.
          </>
        ),
        masters: [
          <><b>Admin Config</b> — which Hotline desk a call is filed to.</>,
          <>The <b>signed-in session</b> — who is actually typing.</>,
        ],
        rules: [
          { kind: 'demands', body: <>The three <b>vigilance answers</b> — public health threat, death, serious incident. Defaulted to NO, never skippable, and every later change to one is kept.</> },
          { kind: 'refuses', body: <>Setting either registrant column. <b>Created By</b> is the desk; <b>Actually Registered By</b> is you, from the session. The two differing is the finding rather than an error — only the Hotline engineer is trained on the vigilance questions.</> },
        ],
      },
    ],
  },
  {
    id: 'request',
    n: 'Flow 2',
    title: 'The call’s whole life, from a request in the field',
    lead: (
      <>
        The longer path, and the one most calls take: an engineer in the field raises a request,
        the Hotline turns it into a call, and it runs to a visit, a closure and a review.
        Flow 1 is the first two of these compressed onto one screen; <b>everything from step 3
        onwards is the same for both</b>.
      </>
    ),
    steps: [
      {
        n: '1', title: 'A request is raised',
        body: (
          <>
            Somebody in the field reports a fault. The request is identified by a{' '}
            <code>REQID</code> the database mints, and each machine on it becomes one call keyed{' '}
            <code>REQID-Product-Serial</code>. <b>The machine is found first and the customer is
            read off it</b> — searching for the customer first would mean knowing who owns the
            machine in order to find out who owns it.
          </>
        ),
        masters: [<><b>Product Database</b> — the machine, and its customer.</>,
                  <><b>Party Master</b> — and the engineer who looks after them.</>],
        rules: [
          { kind: 'demands', body: <>A serial. A key reading <code>…-NA</code> is a defect, not a variant.</> },
          { kind: 'refuses', body: <>The same machine twice on one request. And the <b>first call fixes the customer</b> for the whole request.</> },
        ],
      },
      {
        n: '2', title: 'It is registered as a call',
        body: (
          <>
            The request is dispositioned — registered as a new call, mapped to an existing one, or
            cancelled with a reason. It cannot be silently dropped: a request nobody can see is
            indistinguishable from one nobody made. Field, Installation and PM calls live in
            separate tables behind one view, with a constraint against mis-filing.
          </>
        ),
        masters: [<><b>Warranty &amp; Contract registers</b> — the cover on this machine today.</>],
        rules: [
          { kind: 'demands', body: <>Customer, product, serial, complaint date, the complaint as reported, and the three vigilance answers.</> },
        ],
      },
      {
        n: '3', title: 'An engineer is allotted',
        body: (
          <>
            Proposed from the machine first and the party second; a call raised from a request
            goes to the person who raised it. A manager can move a call, or several at once,
            between the engineers reporting to them and themselves.
          </>
        ),
        masters: [<><b>User Master</b> — who a call can be allotted to.</>,
                  <><b>Standard Complaint master</b>.</>],
        rules: [{ kind: 'refuses', body: <>Allotting outside your own reporting tree.</> }],
      },
      {
        n: '4', title: 'Spares are requested and fitted',
        body: (
          <>
            A spare request runs RM → Commercial → NSM → Stores, and the middle two approve
            automatically unless the item is AMC or OGP. Stores may issue <b>fewer</b> than were
            asked for; the balance stays open. The engineer acknowledges each delivery, and a
            spare counts as received only when the whole quantity has been.
          </>
        ),
        masters: [<><b>Part Master</b> — what may be requested.</>,
                  <><b>Hand Stock</b> — what this engineer holds. Derived, never stored: issued − consumed ± transfers − returns.</>],
        rules: [
          { kind: 'refuses', body: <>Consuming more than the engineer holds — a database trigger caps every line at the balance. A wrong line is <b>voided, never deleted</b>: quantity set to zero, the row kept with its original quantity, reason and author, and the stock returns.</> },
        ],
      },
      {
        n: '5', title: 'A visit is recorded',
        body: (
          <>
            One row per visit: what was observed, what was done, the readings, and the status it
            concluded with. <b>The call&rsquo;s status is then the latest ENTRY&rsquo;s</b> — not
            the latest visit date, which is a different thing when a visit is written up late. A
            call is <b>Unattended</b> only while it has no visit row at all.
          </>
        ),
        masters: [<><b>Service Manuals</b> — the controlled document at the point of work.</>],
        rules: [
          { kind: 'refuses', body: <>A visit dated in the future, or before the complaint it answers. And a closed call takes no visit entry and no spare request until it is re-opened.</> },
        ],
      },
      {
        n: '6', title: 'It is closed, reviewed, and read back',
        body: (
          <>
            A closed call is reviewed in the Daily Call Review — the judgement a Field Failure
            Report is raised from, and the record every failure analysis is computed over. Every
            judgement carries who made it. A closed call can be re-opened by an authorised role
            where further work or a correction is needed, and the re-opening is recorded.
          </>
        ),
        masters: [<><b>Root Cause</b> and <b>Complaint Grouping</b> lists — the review&rsquo;s own vocabulary.</>],
        rules: [
          { kind: 'refuses', body: <><b>Deleting a quality record</b>, outright. And a call reading <i>Solved — Report Completed</i> is read-only to everyone but an administrator: the way back is Re-open, not an exemption, or a call&rsquo;s history could gain a visit that never happened.</> },
        ],
      },
    ],
  },
];

// WHICH MASTER ANSWERS WHICH FIELD, for Flow 1. A table rather than prose
// because it is the question people come back to this page with — and because
// "locked" against a row is the answer to "why can I not change this?".
const LEDGER: { field: string; from: string; how: string }[] = [
  { field: 'Party Name', from: 'Product Database + Party Master', how: 'Type-search. Owners lead; a customer with no machine is unpickable' },
  { field: 'City · State', from: 'Product Database', how: 'Filled from the machine' },
  { field: 'Product Name · Serial', from: 'Product Database', how: 'Chosen — product, then serial' },
  { field: 'Item Status (cover)', from: 'Product Database ← Warranty / Contract', how: 'Locked' },
  { field: 'Warranty no. · start · end', from: 'Warranty Register', how: 'Locked' },
  { field: 'Contract no. · start · end · type', from: 'Contract Register', how: 'Locked' },
  { field: 'Call Allocated To', from: 'The machine’s engineer, else the Party Master’s Serviceman', how: 'Prefilled, editable from the User Master' },
  { field: 'Standard Complaint', from: 'Standard Complaint master', how: 'Picker — no free text, ever' },
  { field: 'Complaint Reported', from: 'The customer', how: 'Typed. Their words' },
  { field: 'Complaint Date', from: 'You', how: 'Typed — and every failure analysis dates the failure by it' },
  { field: 'Vigilance × 3', from: 'The caller’s answers', how: 'Typed. Default NO, never skipped' },
  { field: 'Customer contact', from: 'The caller', how: 'Typed' },
  { field: 'UCN · Call Number', from: 'The database', how: 'Assigned on save. The app cannot supply either' },
  { field: 'Created By · Actually Registered By', from: 'Admin Config · the session', how: 'Stamped. Not settable' },
];

// The four states, drawn from the ONE definition in `callstate.tsx` rather than
// restated here — a page explaining the colour code must not become a second,
// drifting copy of it.
const STATES = ['Unattended', 'Unsolved', 'Report pending', 'Solved'] as const;

export function HowRithiFunctions() {
  return (
    <div>
      <PageHeader
        title="How RITHI Functions"
        subtitle="Where every field on a call comes from — the masters behind the form, what the system refuses, and what it will not proceed without."
        icon="🧭"
      />

      <p className="kb-intro">
        <b>Two ways in, one record.</b> Flow 1 is registering a direct customer call from scratch
        on <B>New Field Call</B> — the path where the masters are visible doing their work.
        Flow 2 is the longer life of a call raised from a request in the field. If you are
        wondering <i>why the form already knew that</i>, or why a field will not let you type in
        it, the answer is on this page.
      </p>

      <div className="kb-jump">
        {FLOWS.map((f) => (
          <button key={f.id} onClick={() => document.getElementById(`hf-${f.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>
            <span className="kb-jn">{f.n.replace('Flow ', '')}</span>{f.title}
          </button>
        ))}
      </div>

      {FLOWS.map((flow) => (
        <section key={flow.id} id={`hf-${flow.id}`} className="hf-flow">
          <div className="hf-flow-head">
            <span className="hf-flow-n">{flow.n}</span>
            <h2>{flow.title}</h2>
          </div>
          <p className="hf-flow-lead">{flow.lead}</p>

          {flow.steps.map((s) => (
            <article key={s.n} className="kb-sec hf-step">
              <div className="kb-sec-head">
                <span className="kb-num">{s.n}</span>
                <h2>{s.title}</h2>
              </div>
              <p className="kb-lead">{s.body}</p>

              <div className="hf-cols">
                {s.masters && (
                  <div className="hf-col hf-masters">
                    <h3>Masters it reads</h3>
                    <ul>{s.masters.map((m, i) => <li key={i}>{m}</li>)}</ul>
                  </div>
                )}
                {s.rules && (
                  <div className="hf-col hf-rules">
                    <h3>What it refuses, and what it demands</h3>
                    <ul>
                      {s.rules.map((r, i) => (
                        <li key={i} className={r.kind === 'demands' ? 'hf-demands' : 'hf-refuses'}>
                          <span className="hf-kind">{r.kind === 'demands' ? 'Must have' : 'Will not'}</span>
                          {r.body}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </article>
          ))}

          {flow.id === 'direct' && (
            <article className="kb-sec hf-ledger">
              <div className="kb-sec-head"><h2>Flow 1, as a ledger</h2></div>
              <p className="kb-lead">
                Which master answers which field, in the order the form asks.
                <b> Locked</b> means the field is filled and closed — correct the master, not the call.
              </p>
              <div className="hf-scroll">
                <table className="hf-table">
                  <thead><tr><th>Field</th><th>Comes from</th><th>How</th></tr></thead>
                  <tbody>
                    {LEDGER.map((r) => (
                      <tr key={r.field}>
                        <td>{r.field}</td>
                        <td>{r.from}</td>
                        <td className={r.how === 'Locked' ? 'hf-locked' : undefined}>
                          {r.how === 'Locked' ? '🔒 Locked' : r.how}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </article>
          )}
        </section>
      ))}

      <article className="kb-sec">
        <div className="kb-sec-head"><h2>The status code</h2></div>
        <p className="kb-lead">
          These colours are fixed, and identical in light and dark. A colour people have learned
          to read is a code, and a code that means something else after dark is not one.
          <b> A UCN carries its call&rsquo;s colour wherever it appears</b>, in any module — and
          where a screen does not know the state it is drawn plain, because a wrong colour on a
          code is worse than no colour.
        </p>
        <div className="hf-chips">
          {STATES.map((s) => (
            <span key={s} className="hf-chip"
              style={{ background: STATE_COLOUR[s].bg, color: STATE_COLOUR[s].fg }}>
              {STATE_COLOUR[s].label}
            </span>
          ))}
        </div>
        <div className="kb-note tip">
          <span className="kb-ic">💡</span>
          <span>
            A call is <b>Unattended</b> only while it has no visit at all. After the first visit
            it reads as whatever the latest <i>entry</i> said — so a visit written up late still
            moves the call, because the record follows what was entered rather than when the
            engineer travelled.
          </span>
        </div>
      </article>

      <article className="kb-sec">
        <div className="kb-sec-head"><h2>Two rules that explain most refusals</h2></div>
        <div className="kb-note warn">
          <span className="kb-ic">🔐</span>
          <span>
            <b>Opening a page and seeing its rows are different rights.</b> A screen can be
            granted to your role and still show nothing, because what you may READ is decided
            separately — an engineer sees their own calls, a manager their team&rsquo;s, and the
            office roles everything. An empty page is usually this, not a fault.
          </span>
        </div>
        <div className="kb-note warn">
          <span className="kb-ic">✍️</span>
          <span>
            <b>Editing a call is granted section by section.</b> Correcting a telephone number
            and re-answering whether a patient was harmed are not the same act, so the complaint,
            the customer and machine, the vigilance answers, the contact details, re-allotting and
            cancelling are each their own permission — and each change is attributable.
          </span>
        </div>
      </article>

      <p className="kb-intro" style={{ marginTop: 24 }}>
        Where this page and the application disagree, <b>the application is the fact and this page
        is the bug</b>. Say so and it gets corrected here.
      </p>
    </div>
  );
}
