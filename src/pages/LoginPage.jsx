import { useState, useMemo } from 'react';
import { useAuth } from '../hooks/useAuth';
import { isSupabaseConfigured } from '../data/supabaseAuth';

const DEFAULT_PIN = '6969';

export default function LoginPage() {
  const { login, loginLocal } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [pin, setPin] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const configured = isSupabaseConfigured();
  const pinLength = useMemo(() => {
    const stored = localStorage.getItem('gudangai_pin') || DEFAULT_PIN;
    return Math.min(6, Math.max(4, String(stored).length || 4));
  }, []);

  const handleSupabaseSubmit = async (event) => {
    event.preventDefault();
    if (!configured || submitting) return;
    setError('');
    setSubmitting(true);
    try {
      await login(email.trim(), password);
    } catch (err) {
      setError(err.message || 'Login Supabase gagal. Periksa akun dan koneksi.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleLocalSubmit = (event) => {
    event.preventDefault();
    if (loginLocal(pin)) return;
    setError('PIN lokal salah.');
    setPin('');
  };

  return (
    <div className="min-h-dvh relative overflow-hidden bg-slate-950 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: "url('/assets/login-meeting.jpg')" }} />
      <div className="absolute inset-0 bg-slate-950/55" />
      <div className="absolute inset-0 bg-gradient-to-b from-slate-950/20 via-slate-950/35 to-slate-950/80" />

      <main className="relative z-10 w-full max-w-sm">
        <section className="rounded-[2rem] border border-white/20 bg-white/10 backdrop-blur-xl shadow-2xl px-6 py-7">
          <div className="text-center mb-6">
            <div className="mx-auto mb-3 w-16 h-16 rounded-2xl bg-white flex items-center justify-center shadow-lg ring-1 ring-white/30 overflow-hidden p-1">
              <img src="/icons/icon-192x192.png" alt="GudangAI RUDY" className="w-full h-full object-contain" />
            </div>
            <h1 className="text-white text-2xl font-extrabold tracking-tight">GudangAI <span className="text-cyan-300">RUDY</span></h1>
            <p className="text-white/75 text-xs mt-1">Cold Storage Control System</p>
          </div>

          {configured ? (
            <form onSubmit={handleSupabaseSubmit} className="space-y-3">
              <label className="block">
                <span className="mb-1.5 block text-xs font-semibold text-white/85">Email operator</span>
                <input type="email" autoComplete="username" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="nama@perusahaan.com" className="w-full rounded-xl border border-white/20 bg-slate-950/35 px-3.5 py-3 text-sm text-white outline-none placeholder:text-white/40 focus:border-cyan-300" />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs font-semibold text-white/85">Password</span>
                <div className="flex gap-2">
                  <input type={showPassword ? 'text' : 'password'} autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Password akun Supabase" className="min-w-0 flex-1 rounded-xl border border-white/20 bg-slate-950/35 px-3.5 py-3 text-sm text-white outline-none placeholder:text-white/40 focus:border-cyan-300" />
                  <button type="button" onClick={() => setShowPassword((value) => !value)} className="rounded-xl border border-white/20 px-3 text-xs font-semibold text-white/80">{showPassword ? 'Sembunyikan' : 'Lihat'}</button>
                </div>
              </label>
              {error && <p role="alert" className="rounded-xl border border-rose-300/40 bg-rose-500/10 p-3 text-xs text-rose-100">{error}</p>}
              <button type="submit" disabled={submitting || !email.trim() || !password} className="w-full rounded-xl bg-cyan-500 py-3 text-sm font-extrabold text-slate-950 shadow-lg disabled:opacity-50">{submitting ? 'Memverifikasi akun…' : 'Masuk dengan Supabase'}</button>
            </form>
          ) : (
            <form onSubmit={handleLocalSubmit} className="space-y-3">
              <div className="rounded-xl border border-amber-300/40 bg-amber-400/10 p-3 text-xs leading-relaxed text-amber-100">
                Mode kompatibilitas lokal. Fitur PWA lama tetap dapat digunakan, tetapi Claude dan endpoint AI terkunci sampai Supabase dikonfigurasi. PIN lokal bukan autentikasi server.
              </div>
              <label className="block">
                <span className="mb-1.5 block text-xs font-semibold text-white/85">PIN perangkat ({pinLength} digit)</span>
                <input type="password" inputMode="numeric" autoComplete="current-password" maxLength={pinLength} required value={pin} onChange={(event) => { setPin(event.target.value.replace(/\D/g, '').slice(0, pinLength)); setError(''); }} placeholder="Masukkan PIN lokal" className="w-full rounded-xl border border-white/20 bg-slate-950/35 px-3.5 py-3 text-center text-lg tracking-[0.5em] text-white outline-none placeholder:text-white/40 focus:border-cyan-300" />
              </label>
              {error && <p role="alert" className="rounded-xl border border-rose-300/40 bg-rose-500/10 p-3 text-xs text-rose-100">{error}</p>}
              <button type="submit" disabled={pin.length !== pinLength} className="w-full rounded-xl bg-cyan-500 py-3 text-sm font-extrabold text-slate-950 shadow-lg disabled:opacity-50">Masuk mode lokal</button>
            </form>
          )}

          <p className="text-white/55 text-[10px] text-center mt-6">Nasi Goreng 69 · Cold Storage · Supabase Auth</p>
        </section>
      </main>
    </div>
  );
}
