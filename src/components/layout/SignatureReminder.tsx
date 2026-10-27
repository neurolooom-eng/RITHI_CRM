// ===========================================================================
// THE SIGNATURE REMINDER (the user, 2026-10-27: "Check if the user has
// configured their Signature, if not add a Pop up to Remind them to update it.
// Give the Link for the Signature Tab ... If the User has configured their
// Signatures, the Pop up or the Reminder should not come").
//
// Settled the same day: on opening RITHI, ONCE PER SESSION, with a link to My
// Profile -> Signature and a Later button. It asks the database whether a
// signature is saved; nothing saved means the popup, anything saved means
// nothing is shown, ever. "Later" (or following the link) quiets it until the
// browser tab is closed -- sessionStorage, so the next session asks again.
//
// Not shown while an administrator is viewing as somebody else (it would be
// asking about the administrator's own signature on somebody else's screen),
// nor to a login whose profile did not load, which has one page to see.
// ===========================================================================
import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Modal } from '../ui/ui';
import { useAuth } from '../../lib/auth';
import { sbHasSignature, supabaseConfigured } from '../../lib/supabase';

export const SIGNATURE_LINK = '#/profile?tab=signature';
const QUIET_KEY = 'rithi.signatureReminder.later';

function quieted(): boolean { try { return sessionStorage.getItem(QUIET_KEY) === '1'; } catch { return false; } }
function quiet(): void { try { sessionStorage.setItem(QUIET_KEY, '1'); } catch { /* the popup simply asks again */ } }

export function SignatureReminder() {
  const { realUser, viewAs } = useAuth();
  const loc = useLocation();
  const [open, setOpen] = useState(false);
  const uid = realUser?.id;

  useEffect(() => {
    if (!uid || realUser?.unresolved || viewAs || !supabaseConfigured() || quieted()) return;
    let live = true;
    // A failed read is NOT "no signature" -- only a definite false opens it.
    void sbHasSignature().then((has) => { if (live && has === false) setOpen(true); }).catch(() => {});
    return () => { live = false; };
  }, [uid, realUser?.unresolved, viewAs]);

  // Already on the Signature tab: the popup has done its job.
  useEffect(() => {
    if (open && loc.pathname === '/profile' && new URLSearchParams(loc.search).get('tab') === 'signature') { quiet(); setOpen(false); }
  }, [open, loc.pathname, loc.search]);

  const later = () => { quiet(); setOpen(false); };
  return (
    <Modal open={open} onClose={later} title="Add your signature">
      <p style={{ marginTop: 0 }}>
        You have not saved a signature in RITHI yet. It is what goes on the documents that name you — a Training Form you
        attended or gave, a Delivery Challan you dispatched — and you place it yourself, by pressing Sign.
      </p>
      <p className="muted" style={{ fontSize: 13 }}>Draw it once on My Profile → Signature. This reminder stops as soon as it is saved.</p>
      <div className="modal-actions" style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button className="btn" onClick={later}>Later</button>
        <a className="btn btn-primary" href={SIGNATURE_LINK} onClick={later}>Add my signature →</a>
      </div>
    </Modal>
  );
}
