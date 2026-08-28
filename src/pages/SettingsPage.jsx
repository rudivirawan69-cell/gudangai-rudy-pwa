import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../hooks/useAuth';
import {
  getApiUrl,
  setApiUrl,
  healthCheck,
  getPendingQueue,
  syncPendingQueue,
  clearSyncedQueue,
} from '../data/api';
import {
  Settings,
  Wifi,
  WifiOff,
  CheckCircle2,
  XCircle,
  Loader2,
  Link2,
  KeyRound,
  User,
  RefreshCw,
  Trash2,
  Shield,
  Info,
} from 'lucide-react';

export default function SettingsPage() {
  const { user, updateProfile, changePin } = useAuth();

  const [apiUrl, setApiUrlState] = useState('');
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

  useEffect(() => {
    setApiUrlState(getApiUrl());
    setUsername(localStorage.getItem('gudangai_username') || user?.name || 'Rudi Virawan');
    setPendingCount(getPendingQueue().length);
  }, [user]);

  const handleSaveUrl = () => {
    setApiUrl(apiUrl.trim());
    setConnStatus('idle');
    setConnMessage(apiUrl.trim() ? 'URL disimpan. Silakan uji koneksi.' : 'URL dihapus. Mode demo aktif.');
  };

  const handleTestConnection = useCallback(async () => {
    if (!apiUrl.trim() && !getApiUrl()) {
      setConnStatus('fail');
      setConnMessage('Masukkan URL Apps Script terlebih dahulu.');
      return;
    }
    if (apiUrl.trim()) setApiUrl(apiUrl.trim());

    setConnStatus('testing');
    setConnMessage('Menguji koneksi...');
    const result = await healthCheck();
    if (result.ok) {
      setConnStatus('ok');
      setConnMessage(
        `Terhubung · ${result.data?.timestamp ? new Date(result.data.timestamp).toLocaleString('id-ID') : 'OK'}`
      );
    } else {
      setConnStatus('fail');
      setConnMessage(result.error || 'Gagal terhubung');
    }
  }, [apiUrl]);

  const handleSaveProfile = () => {
    const name = username.trim() || 'Rudi Virawan';
    localStorage.setItem('gudangai_username', name);
    if (updateProfile) updateProfile({ name });
    setProfileMsg('Nama disimpan.');
    setTimeout(() => setProfileMsg(''), 2500);
  };

  const handleChangePin = () => {
    if (!/^\d{4,6}$/.test(newPin)) {
      setPinMsg('PIN harus 4–6 digit angka.');
      return;
    }
    if (newPin !== confirmPin) {
      setPinMsg('Konfirmasi PIN tidak cocok.');
      return;
    }
    localStorage.setItem('gudangai_pin', newPin);
    if (changePin) changePin(newPin);
    setNewPin('');
    setConfirmPin('');
    setPinMsg('PIN berhasil diubah.');
    setTimeout(() => setPinMsg(''), 2500);
  };

  const handleSync = async () => {
    setSyncing(true);
    setSyncResult(null);
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

  const statusIcon = () => {
    if (connStatus === 'testing') return <Loader2 className="w-5 h-5 text-cyan-500 animate-spin" />;
    if (connStatus === 'ok') return <CheckCircle2 className="w-5 h-5 text-emerald-500" />;
    if (connStatus === 'fail') return <XCircle className="w-5 h-5 text-red-500" />;
    return <Link2 className="w-5 h-5 text-gray-400" />;
  };

  const statusBadge = () => {
    if (connStatus === 'ok') {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 text-xs font-medium border border-emerald-200">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> Terhubung
        </span>
      );
    }
    if (connStatus === 'fail') {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-red-50 text-red-700 text-xs font-medium border border-red-200">
          <span className="w-1.5 h-1.5 rounded-full bg-red-500" /> Gagal
        </span>
      );
    }
    if (!getApiUrl()) {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-gray-100 text-gray-600 text-xs font-medium border border-gray-200">
          <span className="w-1.5 h-1.5 rounded-full bg-gray-400" /> Belum diatur
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-50 text-amber-700 text-xs font-medium border border-amber-200">
        <span className="w-1.5 h-1.5 rounded-full bg-amber-500" /> Belum diuji
      </span>
    );
  };

  return (
    <div className="pb-4 animate-fade-in space-y-4">
      <div className="flex items-center gap-3 mb-1">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#0b2a55] to-[#164e8a] flex items-center justify-center shadow-md">
          <Settings className="w-5 h-5 text-white" />
        </div>
        <div>
          <h1 className="text-lg font-bold text-gray-800">Pengaturan</h1>
          <p className="text-xs text-gray-500">Koneksi, profil & keamanan</p>
        </div>
      </div>

      <section className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-50 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Wifi className="w-4 h-4 text-[#0b2a55]" />
            <h2 className="text-sm font-semibold text-gray-800">Koneksi Google Sheets</h2>
          </div>
          {statusBadge()}
        </div>

        <div className="p-4 space-y-3">
          <div>
            <label className="text-[11px] font-medium text-gray-500 uppercase tracking-wider">
              URL Apps Script Web App
            </label>
            <input
              type="url"
              value={apiUrl}
              onChange={(e) => setApiUrlState(e.target.value)}
              placeholder="https://script.google.com/macros/s/…/exec"
              className="mt-1 w-full px-3 py-2.5 bg-gray-50 rounded-xl border border-gray-200 text-sm font-mono focus:outline-none focus:border-cyan-400 focus:ring-1 focus:ring-cyan-100"
            />
            <p className="mt-1.5 text-[11px] text-gray-400 flex items-start gap-1">
              <Info className="w-3 h-3 mt-0.5 shrink-0" />
              Deploy Code.gs sebagai Web App (Anyone), lalu tempel URL di sini.
            </p>
          </div>

          <div className="flex gap-2">
            <button
              onClick={handleSaveUrl}
              className="flex-1 py-2.5 rounded-xl bg-gray-100 text-gray-700 text-sm font-semibold active:bg-gray-200 transition-colors"
            >
              Simpan URL
            </button>
            <button
              onClick={handleTestConnection}
              disabled={connStatus === 'testing'}
              className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-[#0b2a55] to-[#164e8a] text-white text-sm font-semibold flex items-center justify-center gap-2 active:opacity-90 disabled:opacity-60 transition-all"
            >
              {statusIcon()}
              Uji Koneksi
            </button>
          </div>

          {connMessage && (
            <div
              className={`text-xs px-3 py-2 rounded-lg ${
                connStatus === 'ok'
                  ? 'bg-emerald-50 text-emerald-700'
                  : connStatus === 'fail'
                    ? 'bg-red-50 text-red-700'
                    : 'bg-gray-50 text-gray-600'
              }`}
            >
              {connMessage}
            </div>
          )}
        </div>
      </section>

      <section className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-50 flex items-center gap-2">
          <User className="w-4 h-4 text-[#0b2a55]" />
          <h2 className="text-sm font-semibold text-gray-800">Profil</h2>
        </div>
        <div className="p-4 space-y-3">
          <div>
            <label className="text-[11px] font-medium text-gray-500 uppercase tracking-wider">
              Nama pengguna
            </label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="mt-1 w-full px-3 py-2.5 bg-gray-50 rounded-xl border border-gray-200 text-sm focus:outline-none focus:border-cyan-400 focus:ring-1 focus:ring-cyan-100"
            />
          </div>
          <button
            onClick={handleSaveProfile}
            className="w-full py-2.5 rounded-xl bg-gray-100 text-gray-700 text-sm font-semibold active:bg-gray-200 transition-colors"
          >
            Simpan Nama
          </button>
          {profileMsg && (
            <p className="text-xs text-emerald-600 text-center">{profileMsg}</p>
          )}
        </div>
      </section>

      <section className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-50 flex items-center gap-2">
          <KeyRound className="w-4 h-4 text-[#0b2a55]" />
          <h2 className="text-sm font-semibold text-gray-800">Keamanan PIN</h2>
        </div>
        <div className="p-4 space-y-3">
          <div>
            <label className="text-[11px] font-medium text-gray-500 uppercase tracking-wider">
              PIN baru (4–6 digit)
            </label>
            <input
              type="password"
              inputMode="numeric"
              maxLength={6}
              value={newPin}
              onChange={(e) => setNewPin(e.target.value.replace(/\D/g, ''))}
              className="mt-1 w-full px-3 py-2.5 bg-gray-50 rounded-xl border border-gray-200 text-sm tracking-widest focus:outline-none focus:border-cyan-400 focus:ring-1 focus:ring-cyan-100"
              placeholder="••••"
            />
          </div>
          <div>
            <label className="text-[11px] font-medium text-gray-500 uppercase tracking-wider">
              Konfirmasi PIN
            </label>
            <input
              type="password"
              inputMode="numeric"
              maxLength={6}
              value={confirmPin}
              onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, ''))}
              className="mt-1 w-full px-3 py-2.5 bg-gray-50 rounded-xl border border-gray-200 text-sm tracking-widest focus:outline-none focus:border-cyan-400 focus:ring-1 focus:ring-cyan-100"
              placeholder="••••"
            />
          </div>
          <button
            onClick={handleChangePin}
            className="w-full py-2.5 rounded-xl bg-gradient-to-r from-[#0b2a55] to-[#164e8a] text-white text-sm font-semibold active:opacity-90 transition-all"
          >
            Ubah PIN
          </button>
          {pinMsg && (
            <p
              className={`text-xs text-center ${
                pinMsg.includes('berhasil') ? 'text-emerald-600' : 'text-red-600'
              }`}
            >
              {pinMsg}
            </p>
          )}
        </div>
      </section>

      <section className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-50 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <RefreshCw className="w-4 h-4 text-[#0b2a55]" />
            <h2 className="text-sm font-semibold text-gray-800">Antrian offline</h2>
          </div>
          <span className="text-xs font-medium text-gray-500">
            {pendingCount} pending
          </span>
        </div>
        <div className="p-4 space-y-3">
          <p className="text-xs text-gray-500">
            Transaksi yang gagal dikirim akan disimpan di perangkat dan dapat disinkronkan
            saat koneksi tersedia.
          </p>
          <div className="flex gap-2">
            <button
              onClick={handleSync}
              disabled={syncing || pendingCount === 0}
              className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-500 text-white text-sm font-semibold flex items-center justify-center gap-2 active:opacity-90 disabled:opacity-50 transition-all"
            >
              {syncing ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <RefreshCw className="w-4 h-4" />
              )}
              Sinkronkan
            </button>
            <button
              onClick={handleClearSynced}
              className="px-4 py-2.5 rounded-xl bg-gray-100 text-gray-600 text-sm font-medium active:bg-gray-200 transition-colors"
              title="Bersihkan yang sudah tersinkron"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
          {syncResult && (
            <div className="text-xs px-3 py-2 rounded-lg bg-gray-50 text-gray-700">
              {syncResult.message
                ? syncResult.message
                : syncResult.skipped
                  ? 'Lewati — offline atau URL belum diatur.'
                  : `Berhasil: ${syncResult.synced} · Gagal: ${syncResult.failed}`}
            </div>
          )}
        </div>
      </section>

      <div className="flex items-start gap-2 px-1 py-2">
        <Shield className="w-4 h-4 text-gray-400 shrink-0 mt-0.5" />
        <p className="text-[11px] text-gray-400 leading-relaxed">
          GudangAI · Cold Storage Nasi Goreng 69 · Data disimpan lokal di perangkat Anda.
          Koneksi ke Google Sheets hanya aktif setelah URL Web App diatur dan berhasil diuji.
        </p>
      </div>
    </div>
  );
}
