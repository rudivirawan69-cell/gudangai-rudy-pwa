import { useCallback, useEffect, useState } from 'react';
import { Bell, CheckCheck, Circle, Clock3, Inbox } from 'lucide-react';
import { getNotifications, markNotificationsRead, unreadNotificationCount } from '../data/api';

function formatTime(value) {
  const timestamp = Number(value) || Date.parse(value || '');
  if (!Number.isFinite(timestamp)) return 'Waktu tidak diketahui';
  return new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(timestamp));
}

export default function NotificationsPage() {
  const [notifications, setNotifications] = useState(() => getNotifications());
  const [unread, setUnread] = useState(() => unreadNotificationCount());

  const refresh = useCallback(() => {
    setNotifications(getNotifications());
    setUnread(unreadNotificationCount());
  }, []);

  useEffect(() => {
    refresh();
    window.addEventListener('gudangai-notification', refresh);
    window.addEventListener('storage', refresh);
    return () => {
      window.removeEventListener('gudangai-notification', refresh);
      window.removeEventListener('storage', refresh);
    };
  }, [refresh]);

  const markAllRead = () => {
    markNotificationsRead();
    refresh();
  };

  return (
    <section className="notifications-page pb-28 space-y-4" aria-label="Pusat notifikasi">
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-extrabold flex items-center gap-2 text-[var(--text-main)]"><Bell className="w-5 h-5 text-cyan-500" /> Pusat Notifikasi</h1>
          <p className="text-sm text-[var(--text-muted)] mt-1">Semua pemberitahuan GudangAI terkumpul di satu tempat.</p>
        </div>
        {unread > 0 && <button type="button" onClick={markAllRead} className="shrink-0 rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2 text-xs font-bold text-[var(--text-main)] inline-flex items-center gap-1.5"><CheckCheck className="w-4 h-4" /> Baca semua</button>}
      </header>
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-elevated)] p-4 flex items-center gap-3">
        <span className="w-11 h-11 rounded-xl bg-cyan-500/15 text-cyan-500 flex items-center justify-center"><Inbox className="w-5 h-5" /></span>
        <div className="min-w-0 flex-1"><p className="font-bold text-[var(--text-main)]">Ringkasan</p><p className="text-sm text-[var(--text-muted)]">{notifications.length} notifikasi · {unread} belum dibaca</p></div>
      </div>
      {notifications.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[var(--border)] bg-[var(--bg-elevated)] p-8 text-center">
          <Bell className="w-9 h-9 mx-auto text-[var(--text-muted)] opacity-60" />
          <p className="mt-3 font-bold text-[var(--text-main)]">Belum ada notifikasi</p>
          <p className="mt-1 text-sm text-[var(--text-muted)]">Status sinkronisasi, transaksi, dan informasi penting akan tampil di sini.</p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {notifications.map((notification) => (
            <article key={notification.id} className={`rounded-2xl border border-[var(--border)] p-3.5 flex gap-3 ${notification.read ? 'bg-[var(--bg-elevated)]' : 'bg-cyan-500/5'}`}>
              <span className="mt-0.5 w-9 h-9 shrink-0 rounded-xl bg-[var(--bg-muted)] flex items-center justify-center text-cyan-500"><Bell className="w-4 h-4" /></span>
              <div className="min-w-0 flex-1">
                <div className="flex items-start gap-2"><p className="font-bold text-sm text-[var(--text-main)] flex-1">{notification.title || 'Notifikasi GudangAI'}</p>{!notification.read && <Circle className="w-2.5 h-2.5 mt-1 fill-cyan-500 text-cyan-500" aria-label="Belum dibaca" />}</div>
                <p className="mt-1 text-sm text-[var(--text-muted)] whitespace-pre-wrap break-words">{notification.body || notification.message || 'Informasi terbaru.'}</p>
                <p className="mt-2 text-[11px] text-[var(--text-muted)] inline-flex items-center gap-1"><Clock3 className="w-3 h-3" />{formatTime(notification.at || notification.createdAt)}</p>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
