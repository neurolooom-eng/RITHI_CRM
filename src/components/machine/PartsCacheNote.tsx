import { useEffect, useState } from 'react';
import { MASTER_STORED_EVENT, storedListInfo, downloadMasterNow } from '../../lib/masters';
import { formatDayTime } from '../../lib/dates';
import { timeAgo } from '../../lib/format';

// ===========================================================================
// WHEN THE PART MASTER WAS CACHED ON THIS DEVICE (the user, 2026-10-05: "Add
// when it was Cached in the Spare Request View / Page"). The spare pickers read
// the stored copy (mastercache.ts, six hours), so the person picking a part can
// see how old the list is. Re-read whenever a list is stored, so it follows a
// refresh without a reload.
// ===========================================================================
export function PartsCacheNote({ compact = false }: { compact?: boolean }) {
  const [info, setInfo] = useState(() => storedListInfo('spareProducts'));
  useEffect(() => {
    const read = () => setInfo(storedListInfo('spareProducts'));
    window.addEventListener(MASTER_STORED_EVENT, read);
    return () => window.removeEventListener(MASTER_STORED_EVENT, read);
  }, []);
  // DOWNLOAD NOW (2026-10-05): the parts and each product's accessories,
  // whatever the age of the copy. A failure keeps the copy and says so.
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const downloadNow = async () => {
    setBusy(true); setFailed(false);
    const [ok] = await Promise.all([downloadMasterNow('spareProducts'), downloadMasterNow('productAccessories')]);
    setBusy(false); setFailed(!ok);
    setInfo(storedListInfo('spareProducts'));
  };
  const button = (
    <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => void downloadNow()}
      title="Download the Part Master to this device now">
      {busy ? 'Downloading…' : '⭳ Download now'}
    </button>
  );
  const at = info ? new Date(info.at).toISOString() : '';
  return (
    <span className="muted" style={{ display: 'inline-flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}
      title={info ? `${info.count.toLocaleString()} parts stored on this device at ${formatDayTime(at)}; refreshed every 6 hours` : ''}>
      {!info
        ? <>Parts not cached on this device yet</>
        : compact
          ? <>cached {formatDayTime(at)} ({timeAgo(at)})</>
          : <>Part Master cached on this device: {info.count.toLocaleString()} parts, {formatDayTime(at)} ({timeAgo(at)})</>}
      {button}
      {failed && <span>— download failed, the copy above is kept</span>}
    </span>
  );
}
