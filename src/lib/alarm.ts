// ---------------------------------------------------------------------------
// THE ALARM NUMBER, HOWEVER SOMEBODY TYPED IT.
//
// The register writes alarms one way per product — "Alarm 012" on a MONNAL
// T75, "ALARM 012" on the common list — and people type them every other way:
// "al 12", "AL-012", "alarm12". 0107 finds the canonical value; this rewrites
// the token in place, so the sentence the person wrote about the fault
// survives being helped.
//
// The pattern must agree with the one in 0107 (`suggest_complaint_text`).
// `npm run check:ui` pins the forms both are expected to catch.
// No imports: the check script loads this file directly.
// ---------------------------------------------------------------------------
export const ALARM_RE = /\bAL(?:ARM)?[\s._-]*0*(\d{1,3})\b/i;

/** The alarm number written in the text, or null. */
export function alarmNumber(text: string): number | null {
  const m = ALARM_RE.exec(text ?? '');
  return m ? Number(m[1]) : null;
}

/** Replace the FIRST alarm token with the register's spelling of it. A
 *  complaint naming two alarms is describing two things, and picking one of
 *  them to rewrite would be a guess — so only the first is touched. */
export function withAlarm(text: string, canonical: string): string {
  return (text ?? '').replace(ALARM_RE, canonical);
}
