// ===========================================================================
// SUGGEST A STANDARD COMPLAINT — a Supabase Edge Function (Deno).
//
// The register's own evidence answers first: `suggest_standard_complaint()`
// (migration 0104) ranks candidates by what people actually chose on past
// calls whose reported problem reads like this one. That is a decision somebody
// made, and it beats anything a model can infer.
//
// This function is for the case that layer cannot reach: a genuine PARAPHRASE.
// "battery not holding charge" against "Internal battery inoperant" shares one
// word; no trigram threshold worth using will connect them, and lowering it far
// enough drags in everything else. A model reads them as the same fault.
//
// SO IT RE-RANKS, IT DOES NOT INVENT. It is given the candidates and must
// choose among them — it cannot return a complaint that is not on the list,
// because the Standard Complaint is a controlled value and a plausible-sounding
// one that is not in the master is worse than no suggestion at all.
//
// WHAT LEAVES THE BROWSER: the reported problem, the product, and candidate
// complaint values. No party, no serial, no engineer, no patient-adjacent
// field. The caller sends the candidates, so this function needs no database
// access at all and holds no service-role key.
//
// IT SUGGESTS. The person registering the call chooses, and their choice is
// what is written — logged either way in `complaint_suggestions`.
//
// Secrets (supabase secrets set):
//   ANTHROPIC_API_KEY          required
//   SUGGEST_MODEL              optional, default claude-sonnet-5
// Deploy WITHOUT --no-verify-jwt: a signed-in user is the only caller.
// ===========================================================================

const MODEL = Deno.env.get('SUGGEST_MODEL') ?? 'claude-sonnet-5';
const KEY = Deno.env.get('ANTHROPIC_API_KEY') ?? '';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

interface Ask {
  reported?: string;
  product?: string;
  candidates?: string[];
}
interface Pick { value: string; why: string }

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);

  // No key configured is not an error the screen should shout about — the
  // register's own suggestions are already on screen and remain the answer.
  if (!KEY) return json({ picks: [], reason: 'no-key' });

  let ask: Ask;
  try { ask = await req.json(); } catch { return json({ error: 'Body must be JSON' }, 400); }

  const reported = String(ask.reported ?? '').trim().slice(0, 500);
  const product = String(ask.product ?? '').trim().slice(0, 120);
  const candidates = (ask.candidates ?? [])
    .map((c) => String(c ?? '').trim())
    .filter(Boolean)
    .slice(0, 120);                        // a prompt, not a database dump

  if (reported.length < 3) return json({ picks: [], reason: 'too-short' });
  if (candidates.length === 0) return json({ picks: [], reason: 'no-candidates' });

  const system = [
    'You match a service desk\'s free-text description of a medical-device fault',
    'to the correct STANDARD COMPLAINT from a controlled list.',
    '',
    'Rules, all of them absolute:',
    '- Choose ONLY from the numbered candidates given. Never invent, reword, correct',
    '  or combine one. Return a candidate exactly as written, character for character.',
    '- Return at most 3, best first. Return FEWER, or none at all, when nothing on the',
    '  list genuinely matches — an empty list is a correct and useful answer, and far',
    '  better than a confident wrong one. Do not pad to three.',
    '- `why` is at most 12 words, plain English, saying what made it the match.',
    '- You are advising a person who will decide. You are not deciding.',
    '',
    'Reply with JSON only, no prose, no code fence:',
    '{"picks":[{"value":"<exactly as given>","why":"<short reason>"}]}',
  ].join('\n');

  const user = [
    product ? `Product: ${product}` : 'Product: not stated',
    `Reported problem: ${reported}`,
    '',
    'Candidates:',
    ...candidates.map((c, i) => `${i + 1}. ${c}`),
  ].join('\n');

  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 400,
        temperature: 0,          // a classification, not a composition
        system,
        messages: [{ role: 'user', content: user }],
      }),
    });
    if (!r.ok) return json({ picks: [], reason: `api-${r.status}` });

    const data = await r.json();
    const text = (data?.content ?? []).map((c: { text?: string }) => c?.text ?? '').join('').trim();
    // Defensive: a model that wraps its JSON in prose must not break the screen.
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start < 0 || end <= start) return json({ picks: [], reason: 'unparsable' });

    let parsed: { picks?: Pick[] };
    try { parsed = JSON.parse(text.slice(start, end + 1)); } catch { return json({ picks: [], reason: 'unparsable' }); }

    // THE LIST IS THE LAW. Anything not exactly a candidate is dropped, however
    // plausible it reads — a Standard Complaint that is not in the master is
    // not a Standard Complaint.
    const allowed = new Set(candidates);
    const picks = (parsed.picks ?? [])
      .map((p) => ({ value: String(p?.value ?? '').trim(), why: String(p?.why ?? '').trim().slice(0, 120) }))
      .filter((p) => allowed.has(p.value))
      .slice(0, 3);

    return json({ picks, model: MODEL });
  } catch (e) {
    return json({ picks: [], reason: e instanceof Error ? e.message : 'failed' });
  }
});
