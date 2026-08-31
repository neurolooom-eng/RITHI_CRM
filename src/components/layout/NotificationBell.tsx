import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { listNotifications, unreadNotificationCount, markNotificationsRead, supabaseConfigured, type AppNotification } from '../../lib/supabase';
import { timeAgo } from '../../lib/format';

// The header bell: shows an unread count, opens a list of recent notifications
// (call allotted, spare dispatched), and marks them read on click.
export function NotificationBell() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<AppNotification[]>([]);
  const [unread, setUnread] = useState(0);
  const loaded = useRef(false);

  const refreshCount = async () => { try { setUnread(await unreadNotificationCount()); } catch { /* offline / not migrated */ } };
  useEffect(() => {
    if (!supabaseConfigured()) return;
    void refreshCount();
    const id = window.setInterval(() => void refreshCount(), 60_000);
    return () => window.clearInterval(id);
  }, []);

  const openMenu = async () => {
    setOpen(true);
    try { setItems(await listNotifications(30)); loaded.current = true; } catch { /* ignore */ }
  };
  const markAll = async () => { try { await markNotificationsRead(); } catch { /* ignore */ } setItems((x) => x.map((n) => ({ ...n, read: true }))); setUnread(0); };
  const clickItem = async (n: AppNotification) => {
    setOpen(false);
    if (!n.read) { try { await markNotificationsRead([n.id]); } catch { /* ignore */ } setUnread((u) => Math.max(0, u - 1)); }
    if (n.link) navigate(n.link);
  };

  if (!supabaseConfigured()) return null;
  return (
    <div className="notif">
      <button className="btn btn-ghost btn-sm notif-btn" title="Notifications" onClick={() => (open ? setOpen(false) : void openMenu())}>
        🔔{unread > 0 && <span className="notif-badge">{unread > 99 ? '99+' : unread}</span>}
      </button>
      {open && (
        <>
          <div className="notif-backdrop" onClick={() => setOpen(false)} />
          <div className="notif-menu">
            <div className="notif-head">
              <b>Notifications</b>
              {items.some((n) => !n.read) && <button className="btn btn-ghost btn-sm" onClick={() => void markAll()}>Mark all read</button>}
            </div>
            {items.length === 0 ? (
              <div className="notif-empty">{loaded.current ? "You're all caught up." : 'Loading…'}</div>
            ) : (
              <div className="notif-list">
                {items.map((n) => (
                  <button key={n.id} className={`notif-item ${n.read ? '' : 'unread'}`} onClick={() => void clickItem(n)}>
                    <div className="notif-title">{n.title}</div>
                    {n.body && <div className="notif-body">{n.body}</div>}
                    <div className="notif-time">{timeAgo(n.created_at)}</div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
