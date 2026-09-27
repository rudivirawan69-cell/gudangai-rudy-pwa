import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../hooks/useAuth';
import {
  getApiUrl, setApiUrl, getApiSecret, setApiSecret,
  healthCheck, getPendingQueue, syncPendingQueue, clearSyncedQueue,
} from '../data/api';
import {
  Wifi, CheckCircle2, XCircle, Loader2, Link2, KeyRound, User,
  RefreshCw, Trash2, Shield, ChevronRight, LogOut, Settings as SettingsIcon, Cloud,
} from 'lucide-react';
import { AVATAR_DATA_URL } from '../assets/imageAssets';

const AVATAR_SRC = AVATAR_DATA_URL;

function formatConnLabel(data) {
  if (!data) return 'OK';
  const ver = data.version || data.title || '';
  const sheet =
    data.spreadsheet ||
    data.raw?.spreadsheet ||
    (typeof data.activeMonth === 'string'
      ? data.activeMonth
      : data.activeMonth?.nama
        ? `${data.activeMonth.nama} ${data.activeMonth.tahun || ''}`.trim()
        : data.raw?.activeMonth?.nama
          ? `${data.raw.activeMonth.nama} ${data.raw.activeMonth.tahun || ''}`.trim()
          : '');
  const ts = data.timestamp || data.serverTime || data.raw?.serverTime;
  const when = ts ? new Date(ts).toLocaleString('id-ID') : '';
  return ['Terhubung', ver, sheet, when].filter(Boolean).join(' · ');
}

function MenuRow({ icon: Icon, iconBg, title, subtitle, onClick, right, danger }) {
  return (
    <button type="button" onClick={onClick}
      className="w-full flex items-center gap-3 px-4 py-3.5 text-left active:bg-slate-50 transition-colors border-b border-slate-50 last:border-0">
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${iconBg || 'bg-slate-100 text-slate-600'}`}>
        <Icon className="w-5 h-5" />
      </div>
      <div className="flex-1 min-w-0">
        <p className={`text-sm font-semibold ${danger ? 'text-red-600' : 'text-slate-800'}`}>{title}</p>
        {subtitle && <p className="text-[11px] text-slate-400 truncate mt-0.5">{subtitle}</p>}
      </div>
      {right || <ChevronRight className={`w-4 h-4 shrink-0 ${danger ? 'text-red-300' : 'text-slate-300'}`} />}
    </button>
  );
}

function Avatar({ name, size = 'lg' }) {
  const [err, setErr] = useState(false);
  const dim = size === 'lg' ? 'w-14 h-14' : 'w-10 h-10';
  const text = size === 'lg' ? 'text-xl' : 'text-sm';
  if (err) {
    return (
      <div className={`${dim} rounded-2xl bg-gradient-to-br from-[#0b2a55] to-[#164e8a] flex items-center justify-center text-white ${text} font-bold shadow-md`}>
        {(name || 'R').charAt(0).toUpperCase()}
      </div>
    );
  }
  return (
    <img
      src={AVATAR_SRC}
      alt={name || 'Avatar'}
      className={`${dim} rounded-2xl object-cover shadow-md border-2 border-white/80`}
      onError={() => setErr(true)}
    />
  );
}

export default function SettingsPage() {
  const { user, updateProfile, changePin, logout } = useAuth();
  const [apiUrl, setApiUrlState] = useState('');
  const [apiSecret, setApiSecretState] = useState('');
  const [connStatus, setConnStatus] = useState('idle');
  const [connMessage, setConnMessage] = useState('');
  const [username, setUsername] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [pinMsg, setPinMsg] = useState('');
  const [profileMsg, setProfileMsg] = useState('');
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState(null);
  const [pendingCount, setPendingCount] = useState(0);
  const [panel, setPanel] = useState(null);
  const [showLogout, setShowLogout] = useState(false);

  useEffect(() => {
    setApiUrlState(getApiUrl());
    setApiSecretState(getApiSecret());
    setUsername(localStorage.getItem('gudangai_username') || user?.name || 'Rudi Virawan');
    setPendingCount(getPendingQueue().length);
  }, [user]);

  const handleSaveUrl = () => {
    setApiUrl(apiUrl.trim());
    setApiSecret(apiSecret.trim());
    setConnStatus('idle');
    setConnMessage(
      apiUrl.trim()
        ? apiSecret.trim()
          ? 'URL + API Secret disimpan. Silakan uji koneksi.'
          : 'URL disimpan. API Secret masih kosong — backend 6.4 butuh secret.'
        : 'URL dihapus. Mode demo aktif.'
    );
  };

  const handleTestConnection = useCallback(async () => {
    if (!apiUrl.trim() && !getApiUrl()) {
      setConnStatus('fail');
      setConnMessage('Masukkan URL Apps Script terlebih dahulu.');
      return;
    }
    if (apiUrl.trim()) setApiUrl(apiUrl.trim());
    if (apiSecret.trim()) setApiSecret(apiSecret.trim());
    setConnStatus('testing');
    setConnMessage('Menguji koneksi...');
    const result = await healthCheck();
    if (result.ok) {
      setConnStatus('ok');
      // Merge raw fields so spreadsheet name is visible
      const payload = {
        ...result.data,
        spreadsheet: result.data?.spreadsheet || result.data?.raw?.spreadsheet,
        activeMonth: result.data?.activeMonth || result.data?.raw?.activeMonth,
        version: result.data?.version || result.data?.raw?.version,
        timestamp: result.data?.timestamp || result.data?.raw?.serverTime,
      };
      setConnMessage(formatConnLabel(payload));
    } else {
      setConnStatus('fail');
      setConnMessage(result.error || 'Gagal terhubung');
    }
  }, [apiUrl, apiSecret]);

  const handleSaveProfile = () => {
    const name = username.trim() || 'Rudi Virawan';
    localStorage.setItem('gudangai_username', name);
    if (updateProfile) updateProfile({ name });
    setProfileMsg('Nama disimpan.');
    setTimeout(() => setProfileMsg(''), 2500);
  };

  const handleChangePin = () => {
    if (!/^\d{4,6}$/.test(newPin)) { setPinMsg('PIN harus 4–6 digit angka.'); return; }
    if (newPin !== confirmPin) { setPinMsg('Konfirmasi PIN tidak cocok.'); return; }
    localStorage.setItem('gudangai_pin', newPin);
    if (changePin) changePin(newPin);
    setNewPin(''); setConfirmPin('');
    setPinMsg('PIN berhasil diubah.');
    setTimeout(() => setPinMsg(''), 2500);
  };

  const handleSync = async () => {
    setSyncing(true); setSyncResult(null);
    const result = await syncPendingQueue();
    setSyncResult(result);
    setPendingCount(getPendingQueue().length);
    setSyncing(false);
  };

  const handleClearSynced = () => {
    clearSyncedQueue();
    setPendingCount(getPendingQueue().length);
    setSyncResult({ message: 'Antrian tersinkron dibersihkan.' });
  };

  const connSubtitle =
    connStatus === 'ok' ? 'Terhubung ke backend'
      : connStatus === 'fail' ? 'Gagal — cek URL/secret'
        : getApiUrl() ? 'URL tersimpan · belum diuji' : 'Belum diatur · mode demo';

  return (
    <div className="pb-2 animate-fade-in space-y-3.5">
      <div className="card p-4 flex items-center gap-3">
        <Avatar name={user?.name || 'Rudi Virawan'} size="lg" />
        <div className="min-w-0 flex-1">
          <p className="text-base font-bold text-slate-900 truncate">{user?.name || 'Rudi Virawan'}</p>
          <p className="text-[11px] text-slate-400">SPV Gudang · Cold Storage NG69</p>
          <p className="text-[10px] text-cyan-700 mt-0.5 font-medium">GudangAI RUDY</p>
        </div>
      </div>

      <div className="card overflow-hidden">
        <MenuRow icon={User} iconBg="bg-blue-50 text-blue-600" title="Profil Saya" subtitle="Nama tampilan di dashboard" onClick={() => setPanel(panel === 'profile' ? null : 'profile')} />
        <MenuRow icon={Link2} iconBg="bg-cyan-50 text-cyan-700" title="Koneksi Google Sheets" subtitle={connSubtitle}
          onClick={() => setPanel(panel === 'koneksi' ? null : 'koneksi')}
          right={connStatus === 'ok' ? <CheckCircle2 className="w-5 h-5 text-emerald-500" /> : connStatus === 'fail' ? <XCircle className="w-5 h-5 text-red-500" /> : <ChevronRight className="w-4 h-4 text-slate-300" />} />
        <MenuRow icon={Cloud} iconBg="bg-violet-50 text-violet-600" title="Mode Offline & Sync" subtitle={pendingCount ? `${pendingCount} transaksi pending` : 'Antrian kosong'} onClick={() => setPanel(panel === 'sync' ? null : 'sync')} />
        <MenuRow icon={KeyRound} iconBg="bg-amber-50 text-amber-700" title="Ganti PIN" subtitle="Keamanan login 4–6 digit" onClick={() => setPanel(panel === 'pin' ? null : 'pin')} />
        <MenuRow icon={SettingsIcon} iconBg="bg-slate-100 text-slate-600" title="Tentang Aplikasi" subtitle="GudangAI · Backend V6.4.4" onClick={() => setPanel(panel === 'about' ? null : 'about')} />
      </div>

      {panel === 'profile' && (
        <div className="card p-4 space-y-3">
          <div className="flex items-center gap-3">
            <Avatar name={username} size="lg" />
            <p className="text-[11px] text-slate-500">Foto profil aktif</p>
          </div>
          <p className="text-xs font-semibold text-slate-600">Nama tampilan</p>
          <input value={username} onChange={(e) => setUsername(e.target.value)} className="w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-sm" placeholder="Nama" />
          <button type="button" onClick={handleSaveProfile} className="w-full py-2.5 rounded-xl bg-[#0b2a55] text-white text-sm font-semibold">Simpan Nama</button>
          {profileMsg && <p className="text-xs text-emerald-600">{profileMsg}</p>}
        </div>
      )}

      {panel === 'koneksi' && (
        <div className="card p-4 space-y-3">
          <p className="text-xs font-semibold text-slate-600">URL Web App Apps Script</p>
          <input value={apiUrl} onChange={(e) => setApiUrlState(e.target.value)} className="w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-xs font-mono" placeholder="https://script.google.com/macros/s/.../exec" />
          <p className="text-xs font-semibold text-slate-600">API Secret (Script Properties)</p>
          <input type="password" value={apiSecret} onChange={(e) => setApiSecretState(e.target.value)} className="w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-sm" placeholder="API_SECRET backend 6.4.4" />
          <div className="flex gap-2">
            <button type="button" onClick={handleSaveUrl} className="flex-1 py-2.5 rounded-xl bg-slate-100 text-slate-700 text-sm font-semibold">Simpan</button>
            <button type="button" onClick={handleTestConnection} className="flex-1 py-2.5 rounded-xl bg-[#0b2a55] text-white text-sm font-semibold flex items-center justify-center gap-1.5">
              {connStatus === 'testing' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wifi className="w-4 h-4" />} Uji Koneksi
            </button>
          </div>
          {connMessage && (
            <p className={`text-[11px] px-2.5 py-2 rounded-lg ${
              connStatus === 'ok' ? 'bg-emerald-50 text-emerald-700' : connStatus === 'fail' ? 'bg-red-50 text-red-700' : 'bg-slate-50 text-slate-600'
            }`}>{connMessage}</p>
          )}
        </div>
      )}

      {panel === 'sync' && (
        <div className="card p-4 space-y-3">
          <p className="text-xs text-slate-500">Transaksi gagal disimpan di perangkat dan disinkron saat online.</p>
          <div className="flex gap-2">
            <button type="button" onClick={handleSync} disabled={syncing || pendingCount === 0}
              className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-500 text-white text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-50">
              {syncing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />} Sinkronkan ({pendingCount})
            </button>
            <button type="button" onClick={handleClearSynced} className="px-4 py-2.5 rounded-xl bg-slate-100 text-slate-600"><Trash2 className="w-4 h-4" /></button>
          </div>
          {syncResult && (
            <p className="text-xs text-slate-600 bg-slate-50 rounded-lg px-3 py-2">
              {syncResult.message ? syncResult.message : syncResult.skipped ? 'Lewati — offline atau URL belum diatur.' : `Berhasil: ${syncResult.synced} · Gagal: ${syncResult.failed}`}
            </p>
          )}
        </div>
      )}

      {panel === 'pin' && (
        <div className="card p-4 space-y-3">
          <input type="password" inputMode="numeric" value={newPin} onChange={(e) => setNewPin(e.target.value)} className="w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-sm" placeholder="PIN baru (4–6 digit)" />
          <input type="password" inputMode="numeric" value={confirmPin} onChange={(e) => setConfirmPin(e.target.value)} className="w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-sm" placeholder="Konfirmasi PIN" />
          <button type="button" onClick={handleChangePin} className="w-full py-2.5 rounded-xl bg-[#0b2a55] text-white text-sm font-semibold">Ubah PIN</button>
          {pinMsg && <p className="text-xs text-emerald-600">{pinMsg}</p>}
        </div>
      )}

      {panel === 'about' && (
        <div className="card p-4 text-[11px] text-slate-500 leading-relaxed space-y-1">
          <p className="font-semibold text-slate-700">GudangAI RUDY</p>
          <p>Cold Storage Nasi Goreng 69 · CV & PT</p>
          <p>Frontend PWA · Backend Google Apps Script V6.4.4+OUTBOX</p>
          <p>Data lokal di perangkat · Sheets hanya setelah URL + secret diuji.</p>
        </div>
      )}

      <div className="card overflow-hidden">
        <MenuRow icon={LogOut} iconBg="bg-red-50 text-red-600" title="Keluar" subtitle="Login ulang dengan PIN" onClick={() => setShowLogout(true)} danger />
      </div>

      <div className="flex items-start gap-2 px-1">
        <Shield className="w-3.5 h-3.5 text-slate-300 shrink-0 mt-0.5" />
        <p className="text-[10px] text-slate-400 leading-relaxed">PIN & data antrian tersimpan lokal. Jangan bagikan API Secret.</p>
      </div>

      {showLogout && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setShowLogout(false)}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-2xl border border-slate-100" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-slate-800 mb-2">Keluar?</h3>
            <p className="text-sm text-slate-500 mb-6">Anda perlu login kembali dengan PIN.</p>
            <div className="flex gap-3">
              <button type="button" onClick={() => setShowLogout(false)} className="flex-1 py-3 rounded-xl bg-slate-100 text-slate-600 text-sm font-medium">Batal</button>
              <button type="button" onClick={() => logout && logout()} className="flex-1 py-3 rounded-xl bg-red-500 text-white text-sm font-medium">Ya, Keluar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
