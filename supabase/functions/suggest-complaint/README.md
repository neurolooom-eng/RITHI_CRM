# suggest-complaint

Re-ranks Standard Complaint candidates for a free-text reported problem.

The register answers first — `suggest_standard_complaint()` in migration 0104
ranks by what people actually chose on similar past calls. **This function is
only for what that cannot reach: a genuine paraphrase.** `"battery not holding
charge"` against `"Internal battery inoperant"` shares one word; no trigram
threshold worth using connects them.

## It cannot invent a complaint

It is handed the candidates and must choose among them. Anything it returns
that is not *exactly* one of them is dropped before the response is built. A
Standard Complaint that is not in the master is not a Standard Complaint.

## What leaves the browser

The reported problem, the product, and candidate complaint values. **No party,
no serial, no engineer, no patient-adjacent field.** The caller sends the
candidates, so this function needs no database access and holds no service-role
key.

## Deploy

```bash
supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
# optional: supabase secrets set SUGGEST_MODEL=claude-sonnet-5
supabase functions deploy suggest-complaint
```

Deploy **with** JWT verification (the default) — a signed-in user is the only
caller. Do not pass `--no-verify-jwt`.

## Without the key

Returns `{ picks: [], reason: 'no-key' }`. The screen shows the register's own
suggestions and says nothing about AI. Everything works; you simply do not get
the paraphrase cases.
