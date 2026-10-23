// ===========================================================================
// TRAINING FORM R/HR/11 -- the template's fixed wording, kept once (the user,
// 2026-10-23: the template "102_2026 Service"; asked, "TRAINING FORM, Rev NOV
// 2021" on every page and the "*Note 1 & 2" markers with no note text).
//
// The risk-to-method table is the template's, and the database holds the
// same (training_methodology, 0453). Pure, so check:ui can pin it.
// ===========================================================================
export const TRAINING_FORM = {
  org: 'AIR LIQUIDE MEDICAL SYSTEMS PVT. LTD.',
  dept: 'HR',
  title: 'TRAINING FORM',
  notice: 'This document is the property of Air Liquide Medical Systems. Any communication or reproduction thereof, even partial, is prohibited without the owner’s prior and written consent',
  tmpl: 'TMPL No: R/HR/11 Rev: NOV 2021',
} as const;

export type TrainingRisk = 'Low' | 'Medium' | 'High';
export const TRAINING_RISKS: TrainingRisk[] = ['Low', 'Medium', 'High'];

/** LOW RISK Classroom; MEDIUM RISK Classroom + Practical; HIGH RISK Classroom + On Job (1month). */
export const TRAINING_METHODOLOGY: Record<TrainingRisk, string> = {
  Low: 'Classroom',
  Medium: 'Classroom + Practical',
  High: 'Classroom + On Job (1month)',
};

/** The form's Rating Scale, word for word. */
export const TRAINING_RATINGS: { label: string; meaning: string }[] = [
  { label: 'Does Not Meet Expectations', meaning: 'Does not meet minimum requirements of the position or only occasionally acceptable' },
  { label: 'Needs Improvement', meaning: 'Performance is inconsistent; meets some job requirements but not consistently.' },
  { label: 'Meets Expectations', meaning: 'Consistently meets the requirements of the position in all aspects' },
  { label: 'Exceeds Expectations', meaning: 'Unique and exceptional accomplishments' },
];

/** The form's tick box: ☑ for the one chosen, ⬜ for the rest. */
export const tick = (on: boolean) => (on ? '☑' : '⬜');
