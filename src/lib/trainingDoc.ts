// ===========================================================================
// READING THE HR TRAINING DOCUMENT (Training Form R/HR/11) -- the user,
// 2026-10-27: "I shall upload the Training Doc - Generated from HR department
// which will carry the number and all other Plan details"; asked, RITHI reads
// it and fills the form for checking before it is saved.
//
// The document is the R/HR/11 template filled in by HR. Its body is a run of
// paragraphs and tables; each value sits in a cell beside or after its label
// ("Trainee Name :Service Team", "Training Approved by: | <name>"), and a risk
// or a yes / no is the box ticked before it ("☑️ LOW ⬜ MEDIUM ⬜ HIGH").
//
// PURE: it takes the document's XML (word/document.xml) and returns what it
// found, so check:ui reads the user's own template with it. Anything it cannot
// find comes back empty -- never guessed -- and the person checks the form
// before it is saved.
// ===========================================================================
import { toIsoDate } from './dates';

export interface ParsedTrainingDoc {
  req_no: string; req_date: string | null;
  trainee_name: string; designation: string; manager_name: string;
  topic: string; trainer_name: string; trainer_designation: string;
  risk: '' | 'Low' | 'Medium' | 'High';
  approved_by_name: string; not_approved_reason: string;
  from_date: string | null; to_date: string | null;
  record_lines: { name: string; content: string; status: string }[];
  evaluation_required: boolean | null; evaluation_justification: string; evaluation_method: string;
  evaluation_plan: { plan: string; evaluator: string; planned_date: string; actual: string; rating: string }[];
  reassessment: '' | 'Yes' | 'No'; remarks: string;
}

type Block = { kind: 'p'; text: string } | { kind: 'table'; rows: string[][] };

const decode = (s: string) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');

/** The body's paragraphs and tables, in order, as text. Nested tables fold into their cell. */
export function docxBlocks(xml: string): Block[] {
  const body = /<w:body\b[^>]*>([\s\S]*)<\/w:body>/.exec(xml)?.[1] ?? xml;
  const blocks: Block[] = [];
  const re = /<w:(tbl|tr|tc|p)\b[^>]*?(\/?)>|<\/w:(tbl|tr|tc|p)>|<w:t\b[^>]*>([\s\S]*?)<\/w:t>|<w:tab\b[^>]*\/>|<w:br\b[^>]*\/>/g;
  let depth = 0; // table nesting
  let rows: string[][] = []; let row: string[] = []; let cell = ''; let para = '';
  let m: RegExpExecArray | null;
  while ((m = re.exec(body))) {
    const [tok, open, selfClose, close, text] = m;
    if (open === 'tbl') { depth++; if (depth === 1) rows = []; }
    else if (close === 'tbl') { depth--; if (depth === 0) blocks.push({ kind: 'table', rows }); }
    else if (open === 'tr' && depth === 1) row = [];
    else if (close === 'tr' && depth === 1) rows.push(row);
    else if (open === 'tc' && depth === 1) cell = '';
    else if (close === 'tc' && depth === 1) row.push(cell.replace(/\s+/g, ' ').trim());
    else if (open === 'p' && !selfClose) { if (depth === 0) para = ''; }
    else if (close === 'p') {
      if (depth === 0) { const t = para.replace(/\s+/g, ' ').trim(); if (t) blocks.push({ kind: 'p', text: t }); }
      else cell += ' ';
    }
    else if (text !== undefined) { const t = decode(text); if (depth === 0) para += t; else cell += t; }
    else if (tok.startsWith('<w:tab') || tok.startsWith('<w:br')) { if (depth === 0) para += ' '; else cell += ' '; }
  }
  return blocks;
}

// A ticked box: ☑ (with or without the emoji selector), ✅, ☒, ✔ or ✓.
const TICK = '(?:\\u2611\\uFE0F?|\\u2705|\\u2612|\\u2714\\uFE0F?|\\u2713)';
const ticked = (s: string, word: string) => new RegExp(`${TICK}\\s*${word}\\b`, 'i').test(s);
/** What follows a label in the same cell: "Trainee Name :Service Team" -> "Service Team". */
const after = (s: string, label: RegExp) => { const m = label.exec(s); return m ? s.slice(m.index + m[0].length).trim() : ''; };
const day = (s: string) => toIsoDate(s.trim()) ?? null;

export function parseTrainingDoc(xml: string): ParsedTrainingDoc {
  const out: ParsedTrainingDoc = {
    req_no: '', req_date: null, trainee_name: '', designation: '', manager_name: '', topic: '', trainer_name: '',
    trainer_designation: '', risk: '', approved_by_name: '', not_approved_reason: '', from_date: null, to_date: null,
    record_lines: [], evaluation_required: null, evaluation_justification: '', evaluation_method: '', evaluation_plan: [],
    reassessment: '', remarks: '',
  };
  const blocks = docxBlocks(xml);
  for (const b of blocks) {
    if (b.kind !== 'table') continue;
    let section: '' | 'record' | 'eval' = '';
    for (const r of b.rows) {
      const first = r[0] ?? '';
      const all = r.join(' | ');
      // THE HEADING ROWS of the two repeating tables.
      if (/^S\.?\s*No$/i.test(first) && /Name of the Employee/i.test(all)) { section = 'record'; continue; }
      if (/^Sl\.?\s*No$/i.test(first) && /Training Evaluation Plan/i.test(all)) { section = 'eval'; continue; }
      if (section === 'record' && /^\d*$/.test(first) && r.length >= 4) {
        const [, name = '', content = '', status = ''] = r;
        if (name.trim()) out.record_lines.push({ name: name.trim(), content: content.trim(), status: status.trim() });
        continue;
      }
      if (section === 'eval' && /^\d*$/.test(first) && r.length >= 6) {
        const [, plan = '', evaluator = '', planned = '', actual = '', rating = ''] = r;
        if (plan.trim() || evaluator.trim()) out.evaluation_plan.push({ plan: plan.trim(), evaluator: evaluator.trim(), planned_date: day(planned) ?? '', actual: actual.trim(), rating: rating.trim() });
        continue;
      }
      section = section === 'eval' && !/Re\s*assessment|Remarks/i.test(all) ? section : '';
      for (let i = 0; i < r.length; i++) {
        const c = r[i];
        const next = (r[i + 1] ?? '').trim();
        let m: RegExpExecArray | null;
        if ((m = /Training Request\.?\s*No\s*:\s*(.*?)\s*Date\s*:\s*(.+)$/i.exec(c))) { out.req_no = m[1].trim(); out.req_date = day(m[2]); }
        else if (/^Trainee Name\s*:/i.test(c)) out.trainee_name = after(c, /^Trainee Name\s*:/i);
        else if (/^Trainer Designation\s*:/i.test(c)) out.trainer_designation = after(c, /^Trainer Designation\s*:/i);
        else if (/^Designation\s*:/i.test(c)) out.designation = after(c, /^Designation\s*:/i);
        else if (/^Manager Name\s*:/i.test(c)) out.manager_name = after(c, /^Manager Name\s*:/i);
        // The template spells it "Tropic"; both are read.
        else if (/^Training T(?:r)?opic\s*:/i.test(c)) out.topic = after(c, /^Training T(?:r)?opic\s*:/i);
        else if (/^Trainer name\s*:/i.test(c)) out.trainer_name = after(c, /^Trainer name\s*:/i);
        else if (/Training Impact on product/i.test(c)) {
          out.risk = ticked(c, 'LOW') ? 'Low' : ticked(c, 'MEDIUM') ? 'Medium' : ticked(c, 'HIGH') ? 'High' : '';
        }
        else if (/^Training Approved by\s*:/i.test(c)) out.approved_by_name = after(c, /^Training Approved by\s*:/i) || next;
        else if (/^If No Reason\s*:/i.test(c)) out.not_approved_reason = after(c, /^If No Reason\s*:/i) || next;
        else if ((m = /Training From \(Date\)\s*:\s*(.*?)\s*To \(Date\)\s*:\s*(.*)$/i.exec(c))) { out.from_date = day(m[1]); out.to_date = day(m[2]); }
        else if (/Training Evaluation Required\s*:/i.test(c)) {
          out.evaluation_required = ticked(c, 'YES') ? true : ticked(c, 'NO') ? false : null;
        }
        else if (/^If .No.,?\s*Justification\s*:/i.test(c)) out.evaluation_justification = after(c, /^If .No.,?\s*Justification\s*:/i);
        // "Evaluation Method (Note:2*) :" -- the colon inside the note is not the label's.
        else if (/^Evaluation Method/i.test(c)) out.evaluation_method = after(c, /^Evaluation Method(?:\s*\([^)]*\))?\s*:/i);
        else if (/Performance Re\s*assessment/i.test(c)) out.reassessment = ticked(c, 'YES') ? 'Yes' : ticked(c, 'NO') ? 'No' : '';
        else if (/^Remarks\s*:/i.test(c)) out.remarks = after(c, /^Remarks\s*:/i).replace(/\s*Rating Scale\s*:[\s\S]*$/i, '').trim();
      }
    }
  }
  // The methodology rows repeat the ticks ("☑️ LOW RISK"); the impact row wins,
  // and the methodology rows fill it only when the impact row ticked nothing.
  if (!out.risk) {
    for (const b of blocks) if (b.kind === 'table') for (const r of b.rows) {
      const s = r.join(' ');
      if (ticked(s, 'LOW RISK')) out.risk = 'Low';
      else if (ticked(s, 'MEDIUM RISK')) out.risk = 'Medium';
      else if (ticked(s, 'HIGH RISK')) out.risk = 'High';
    }
  }
  return out;
}
