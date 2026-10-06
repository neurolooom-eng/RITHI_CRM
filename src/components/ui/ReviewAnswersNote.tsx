import { useAuth } from '../../lib/auth';
import { REVIEW_ANSWERS_HIDDEN } from '../../lib/dccr';

// D-129: ONE LINE, on every screen that shows Daily Complaint Review answers,
// for a reader who does not hold `review.view`. The database returns the
// answers EMPTY to them, and an empty answer that says nothing reads as a
// review nobody did. Renders nothing for a reader who holds the key.
export function ReviewAnswersNote({ extra }: { extra?: string }) {
  const { can } = useAuth();
  if (can('review.view')) return null;
  return (
    <div className="sheet-banner sheet-banner-info" role="note">
      <span>{REVIEW_ANSWERS_HIDDEN}{extra ? ` ${extra}` : ''}</span>
    </div>
  );
}
