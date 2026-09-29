import { useState, useEffect, useCallback } from 'react';
import {
  User, Link2, KeyRound, Settings as SettingsIcon, LogOut, Shield,
  CheckCircle2, XCircle, ChevronRight, Cloud,
} from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import {
  getApiUrl, setApiUrl, getApiSecret, setApiSecret, healthCheck,
  getPendingQueue, clearSyncedQueue,
} from '../data/api';

const AVATAR_SRC = '/icons/icon-96x96.png';

function formatConnLabel(data) {
  if (!data) return 'Terhubung';
  const v = data.version || data.data?.version || '';
  return v ? `Terhubung · ${v}` : 'Terhubung';
}

function MenuRow({ icon: Icon, iconBg, title, subtitle, onClick, right, danger }) {
  return (
    <button type="button" onClick={onClick}
      className={`menu-row w-full flex items-center gap-3 px-4 py-3.5 text-left active:bg-slate-50 ${
        danger ? 'text-red-600' : ''
      }`}>
      <span className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${iconBg}`}>
        <Icon className="w-4.5 h-4.5" />
      </span>
      <span className="flex-1 min-w-0">
        <span className={`block text-sm font-semibold ${danger ? 'text-red-600' : 'text-slate-800'}`}>{title}</span>
        {subtitle && <span className="block text-[11px] text-slate-400 truncate mt-0.5">{subtitle}</span>}
      </span>
      {right || <ChevronRight className="w-4 h-4 text-slate-300 shrink-0" />}
    </button>
  );
}

function Avatar({ name, photo, size = 'md' }) {
  const [err, setErr] = useState(false);
  const dim = size === 'lg' ? 'w-14 h-14' : 'w-10 h-10';
  const text = size === 'lg' ? 'text-xl' : 'text-sm';
  const letter = (
    <div className={`${dim} rounded-2xl bg-gradient-to-br from-cyan-500 to-[#0b2a55] flex items-center justify-center text-white ${text} font-extrabold shadow-md ring-2 ring-white/40 shrink-0`}>
      {(name || 'R').charAt(0).toUpperCase()}
    </div>
  );
  const src = photo || AVATAR_SRC;
  if (err || !src) return letter;
  return (
    <img
      key={src.slice(0, 40)}
      src={src}
      alt={name || 'Avatar'}
      onError={() => setErr(true)}
      className={`${dim} rounded-2xl object-cover shadow-md ring-2 ring-white/40 shrink-0 bg-slate-200`}
    />
  );
}

export default function SettingsPage({ onNavigate }) {
  const { user, updateProfile, changePin, logout } = useAuth();
  const [apiUrl, setApiUrlState] = useState('');
  const [apiSecret, setApiSecretState] = useState('');
  const [connStatus, setConnStatus] = useState('idle');
  const [connMessage, setConnMessage] = useState('');
  const [username, setUsername] = useState(user?.name || '');
  const [profileMsg, setProfileMsg] = useState('');
  const [photoPreview, setPhotoPreview] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [pinMsg, setPinMsg] = useState('');
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState(null);
  const [pendingCount, setPendingCount] = useState(0);
  const [panel, setPanel] = useState(null);
  const [showLogout, setShowLogout] = useState(false);

  useEffect(() => {
    setApiUrlState(getApiUrl());
    setApiSecretState(getApiSecret());
    setPendingCount(getPendingQueue().length);
    const onQueue = () => setPendingCount(getPendingQueue().length);
    window.addEventListener('gudangai-queue-changed', onQueue);
    return () => window.removeEventListener('gudangai-queue-changed', onQueue);
  }, []);

  const handleTestConnection = useCallback(async () => {
    if (!apiUrl.trim() && !getApiUrl()) {
      setConnStatus('fail');
      setConnMessage('Masukkan URL Apps Script terlebih dahulu.');
      return;
    }
    setConnStatus('testing');
    setConnMessage('Menguji koneksi...');
    try {
      if (apiUrl.trim()) setApiUrl(apiUrl.trim());
      if (apiSecret.trim()) setApiSecret(apiSecret.trim());
      const res = await healthCheck();
      if (res?.ok) {
        setConnStatus('ok');
        setConnMessage(formatConnLabel(res.data || res));
      } else {
        setConnStatus('fail');
        setConnMessage(res?.error || res?.message || 'Koneksi gagal');
      }
    } catch (e) {
      setConnStatus('fail');
      setConnMessage(e.message || 'Koneksi gagal');
    }
  }, [apiUrl, apiSecret]);

  const handleSaveUrl = () => {
    setApiUrl(apiUrl.trim());
    setApiSecret(apiSecret.trim());
    setConnMessage('URL & secret disimpan.');
  };

  const handlePhotoPick = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 1.5 * 1024 * 1024) {
      setProfileMsg('Foto max 1,5 MB.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result || '');
      setPhotoPreview(dataUrl);
      setProfileMsg('Foto siap — tekan Simpan Profil.');
    };
    reader.readAsDataURL(file);
  };

  const handleClearPhoto = () => {
    setPhotoPreview('');
    updateProfile?.({ photo: '' });
    setProfileMsg('Foto dihapus.');
  };

  const handleSaveProfile = () => {
    const payload = { name: username.trim() || 'Rudi' };
    if (photoPreview) payload.photo = photoPreview;
    updateProfile?.(payload);
    setProfileMsg('Profil disimpan.');
  };

  const handleChangePin = () => {
    if (!newPin || newPin.length < 4) { setPinMsg('PIN minimal 4 digit'); return; }
    if (newPin !== confirmPin) { setPinMsg('Konfirmasi PIN tidak cocok'); return; }
    changePin?.(newPin);
    setPinMsg('PIN diperbarui.');
    setNewPin(''); setConfirmPin('');
  };

  const handleClearSynced = () => {
    clearSyncedQueue();
    setPendingCount(getPendingQueue().length);
    setSyncResult({ message: 'Antrian tersinkron dibersihkan.' });
  };

  const connSubtitle =
    connStatus === 'ok' ? connMessage || 'Terhubung' :
    connStatus === 'fail' ? 'Gagal — cek URL / secret' :
    connStatus === 'testing' ? 'Menguji...' :
    'Uji koneksi ke Apps Script';

  return (
    <div className="space-y-3 pb-6">
      <div className="flex items-center gap-3 rounded-2xl bg-white/95 border border-slate-200 shadow-sm px-3.5 py-3">
        <Avatar name={user?.name || 'Rudi'} photo={user?.photo} size="lg" />
        <div className="flex-1 min-w-0">
          <p className="text-base font-extrabold text-slate-900 truncate">{user?.name || 'Rudi'}</p>
          <p className="text-[11px] text-slate-600 font-medium">PIN aktif · data lokal aman</p>
        </div>
        <span className="status-pill status-pill-neutral shrink-0">Lokal</span>
      </div>

      <div className="space-y-2.5">
        <div className="card overflow-hidden">
          <MenuRow icon={User} iconBg="bg-blue-50 text-blue-600" title="Profil Saya" subtitle="Nama & foto tampilan" onClick={() => setPanel(panel === 'profile' ? null : 'profile')} />
        </div>
        <div className="card overflow-hidden">
          <MenuRow icon={Link2} iconBg="bg-cyan-50 text-cyan-700" title="Koneksi Google Sheets" subtitle={connSubtitle}
            onClick={() => setPanel(panel === 'koneksi' ? null : 'koneksi')}
            right={connStatus === 'ok' ? <CheckCircle2 className="w-5 h-5 text-emerald-500" /> : connStatus === 'fail' ? <XCircle className="w-5 h-5 text-red-500" /> : <ChevronRight className="w-4 h-4 text-slate-300" />} />
        </div>
        <div className="card overflow-hidden">
          <MenuRow icon={KeyRound} iconBg="bg-amber-50 text-amber-700" title="Ganti PIN" subtitle="Keamanan login 4–6 digit" onClick={() => setPanel(panel === 'pin' ? null : 'pin')} />
        </div>
        <div className="card overflow-hidden">
          <MenuRow icon={SettingsIcon} iconBg="bg-slate-100 text-slate-600" title="Tentang Aplikasi" subtitle="GudangAI · Backend V6.6.5+BULK-STABLE" onClick={() => setPanel(panel === 'about' ? null : 'about')} />
        </div>
      </div>

      {panel === 'profile' && (
        <div className="section-card p-4 space-y-3">
          <div className="flex items-center gap-3">
            <Avatar name={username} photo={photoPreview || user?.photo} size="lg" />
            <div className="flex-1 min-w-0">
              <p className="text-[11px] text-slate-500 mb-1.5">Foto profil (disimpan di perangkat)</p>
              <label className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-cyan-50 text-cyan-700 text-xs font-semibold border border-cyan-200 cursor-pointer">
                Pilih foto
                <input type="file" accept="image/*" className="hidden" onChange={handlePhotoPick} />
              </label>
              {(photoPreview || user?.photo) && (
                <button type="button" onClick={handleClearPhoto} className="ml-2 text-[11px] text-red-500 font-medium">Hapus</button>
              )}
            </div>
          </div>
          <p className="text-xs font-semibold text-slate-600">Nama tampilan</p>
          <input value={username} onChange={(e) => setUsername(e.target.value)} className="form-control px-3 py-2.5 text-sm" placeholder="Nama" />
          <button type="button" onClick={handleSaveProfile} className="w-full py-2.5 rounded-xl bg-[#0b2a55] text-white text-sm font-semibold">Simpan Profil</button>
          {profileMsg && <p className="text-xs text-emerald-600">{profileMsg}</p>}
        </div>
      )}

      {panel === 'koneksi' && (
        <div className="section-card p-4 space-y-3">
          <p className="text-xs font-semibold text-slate-600">URL Web App Apps Script</p>
          <input value={apiUrl} onChange={(e) => setApiUrlState(e.target.value)} className="form-control px-3 py-2.5 text-sm" placeholder="https://script.google.com/.../exec" />
          <p className="text-xs font-semibold text-slate-600">API Secret</p>
          <input type="password" value={apiSecret} onChange={(e) => setApiSecretState(e.target.value)} className="form-control px-3 py-2.5 text-sm" placeholder="Secret (Script Properties)" />
          <div className="flex gap-2">
            <button type="button" onClick={handleSaveUrl} className="flex-1 py-2.5 rounded-xl bg-slate-100 text-slate-700 text-sm font-semibold">Simpan</button>
            <button type="button" onClick={handleTestConnection} className="flex-1 py-2.5 rounded-xl bg-cyan-600 text-white text-sm font-semibold">Uji Koneksi</button>
          </div>
          {connMessage && <p className={`text-xs ${connStatus === 'ok' ? 'text-emerald-600' : connStatus === 'fail' ? 'text-red-600' : 'text-slate-500'}`}>{connMessage}</p>}
          <div className="info-box info-box-warn px-3 py-2.5 text-xs"><p className="font-semibold">Antrian Sinkronisasi</p><p className="mt-0.5 text-amber-800/80">Buka Antrian dari halaman Riwayat (tombol Antrian di kanan atas).</p></div>
        </div>
      )}

      {panel === 'pin' && (
        <div className="section-card p-4 space-y-3">
          <input type="password" inputMode="numeric" value={newPin} onChange={(e) => setNewPin(e.target.value)} className="w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-sm" placeholder="PIN baru (4–6 digit)" />
          <input type="password" inputMode="numeric" value={confirmPin} onChange={(e) => setConfirmPin(e.target.value)} className="w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-sm" placeholder="Konfirmasi PIN" />
          <button type="button" onClick={handleChangePin} className="w-full py-2.5 rounded-xl bg-[#0b2a55] text-white text-sm font-semibold">Ubah PIN</button>
          {pinMsg && <p className="text-xs text-emerald-600">{pinMsg}</p>}
        </div>
      )}

      {panel === 'about' && (
        <div className="info-box p-4 text-[11px] leading-relaxed space-y-1">
          <p className="font-semibold text-slate-700">GudangAI RUDY</p>
          <p>Cold Storage Nasi Goreng 69 · CV & PT</p>
          <p>Frontend PWA · Backend Google Apps Script V6.6.5+BULK-STABLE</p>
          <p>Data lokal di perangkat · Sheets hanya setelah URL + secret diuji.</p>
        </div>
      )}

      <div className="card overflow-hidden">
        <MenuRow icon={LogOut} iconBg="bg-red-50 text-red-600" title="Keluar" subtitle="Login ulang dengan PIN" onClick={() => setShowLogout(true)} danger />
      </div>

      <div className="info-box px-3 py-2.5 flex items-start gap-2">
        <Shield className="w-3.5 h-3.5 text-slate-300 shrink-0 mt-0.5" />
        <p className="text-[10px] text-slate-400 leading-relaxed">PIN & data antrian tersimpan lokal. Jangan bagikan API Secret.</p>
      </div>

      {showLogout && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl p-5 w-full max-w-sm space-y-3 shadow-xl">
            <p className="font-semibold text-slate-800">Keluar dari aplikasi?</p>
            <p className="text-xs text-slate-500">Anda perlu PIN untuk masuk lagi.</p>
            <div className="flex gap-2">
              <button type="button" onClick={() => setShowLogout(false)} className="flex-1 py-2.5 rounded-xl bg-slate-100 text-slate-700 text-sm font-semibold">Batal</button>
              <button type="button" onClick={() => { setShowLogout(false); logout(); }} className="flex-1 py-2.5 rounded-xl bg-red-600 text-white text-sm font-semibold">Keluar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
