import { useEffect, useState } from 'react';
import { MASTER_STORED_EVENT, storedListInfo } from '../../lib/masters';
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
  if (!info) return <span className="muted">Parts not cached on this device yet</span>;
  const at = new Date(info.at).toISOString();
  return (
    <span className="muted" title={`${info.count.toLocaleString()} parts stored on this device at ${formatDayTime(at)}; refreshed every 6 hours`}>
      {compact
        ? <>cached {formatDayTime(at)} ({timeAgo(at)})</>
        : <>Part Master cached on this device: {info.count.toLocaleString()} parts, {formatDayTime(at)} ({timeAgo(at)})</>}
    </span>
  );
}
