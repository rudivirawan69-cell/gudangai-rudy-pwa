import { useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import { isSupabaseConfigured, getSupabaseClient } from '../data/supabaseAuth';

const AUTH_BG = 'var(--bg-base, #02030f)';
const CARD_BG = 'var(--bg-elevated, #1b1e2e)';
const CARD_BORDER = 'var(--border, rgba(255,255,255,0.1))';
const TEXT_MAIN = 'var(--text-main, #ffffff)';
const TEXT_MUTED = 'var(--text-muted, rgba(255,255,255,0.6))';

export default function LoginPage() {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [resetState, setResetState] = useState('idle'); // idle | sending | sent | fail
  const [resetCooldown, setResetCooldown] = useState(0);
  const configured = isSupabaseConfigured();

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

  const handleResetPassword = async () => {
    const target = email.trim();
    if (!target || resetState === 'sending' || resetCooldown > 0) return;
    setResetState('sending');
    setError('');
    try {
      const supabase = getSupabaseClient();
      const result = await supabase.auth.resetPasswordForEmail(target, {
        redirectTo: window.location.origin,
      });
      if (result && result.error) throw result.error;
      setResetState('sent');
      setResetCooldown(60);
      const timer = setInterval(() => {
        setResetCooldown((s) => {
          if (s <= 1) { clearInterval(timer); return 0; }
          return s - 1;
        });
      }, 1000);
    } catch (err) {
      setResetState('fail');
      setError(err.message || 'Gagal mengirim email reset.');
    }
  };

  return (
    <div
      className="min-h-dvh flex items-center justify-center p-4 transition-colors"
      style={{ backgroundColor: AUTH_BG }}
    >
      <main className="relative z-10 w-full max-w-sm">
        <section
          className="rounded-3xl border px-6 py-8 shadow-2xl"
          style={{ backgroundColor: CARD_BG, borderColor: CARD_BORDER }}
        >
          <div className="text-center mb-7">
            <div
              className="mx-auto mb-4 w-16 h-16 rounded-2xl flex items-center justify-center shadow-lg"
              style={{
                background: 'linear-gradient(145deg, #0d9488 0%, #0891b2 100%)',
                boxShadow: '0 8px 24px rgba(13, 148, 136, 0.35)',
              }}
              aria-hidden="true"
            >
              <span className="text-white text-3xl font-black tracking-tight select-none">R</span>
            </div>
            <h1 className="text-2xl font-extrabold tracking-tight">
              <span style={{ color: TEXT_MAIN }}>GudangAI</span>{' '}
              <span className="text-cyan-400">RUDY</span>
            </h1>
            <p className="text-xs mt-1.5 font-medium" style={{ color: TEXT_MUTED }}>
              Cold Storage Control System
            </p>
          </div>

          {!configured && (
            <div className="mb-4 rounded-xl border border-amber-400/30 bg-amber-500/10 p-3 text-xs text-amber-100">
              Konfigurasi Supabase tidak terdeteksi. Pastikan VITE_SUPABASE_URL dan
              VITE_SUPABASE_PUBLISHABLE_KEY tersedia pada build.
            </div>
          )}

          <form onSubmit={handleSupabaseSubmit} className="space-y-3.5" noValidate={false}>
            <label className="block">
              <span className="mb-1.5 block text-xs font-semibold" style={{ color: TEXT_MAIN, opacity: 0.8 }}>
                Email operator
              </span>
              <input
                type="email"
                autoComplete="username"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="nama@perusahaan.com"
                className="w-full rounded-xl border border-white/15 bg-black/30 px-3.5 py-3 text-sm text-white outline-none placeholder:text-white/35 focus:border-teal-400 focus:ring-2 focus:ring-teal-400/40"
              />
            </label>

            <label className="block">
              <span className="mb-1.5 block text-xs font-semibold" style={{ color: TEXT_MAIN, opacity: 0.8 }}>
                Password
              </span>
              <div className="flex gap-2">
                <input
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="Password akun Supabase"
                  className="min-w-0 flex-1 rounded-xl border border-white/15 bg-black/30 px-3.5 py-3 text-sm text-white outline-none placeholder:text-white/35 focus:border-teal-400 focus:ring-2 focus:ring-teal-400/40"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((value) => !value)}
                  aria-pressed={showPassword}
                  aria-label={showPassword ? 'Sembunyikan password' : 'Tampilkan password'}
                  className="rounded-xl border border-white/15 px-3 text-xs font-semibold text-white/75 hover:bg-white/5"
                >
                  {showPassword ? 'Sembunyikan' : 'Lihat'}
                </button>
              </div>
            </label>

            {error && (
              <p
                role="alert"
                className="rounded-xl border border-rose-400/35 bg-rose-500/10 p-3 text-[13px] font-semibold text-rose-100 animate-[shakeX_0.35s_ease]"
              >
                {error}
              </p>
            )}

            {resetState === 'sent' && (
              <p role="status" className="rounded-xl border border-emerald-400/35 bg-emerald-500/10 p-3 text-xs text-emerald-100">
                Email reset terkirim ke {email.trim()}. Periksa kotak masuk/spam.
              </p>
            )}

            <button
              type="submit"
              disabled={submitting || !configured || !email.trim() || !password}
              className="w-full rounded-xl py-3 text-sm font-extrabold text-slate-950 shadow-lg disabled:opacity-45 transition active:scale-[0.99]"
              style={{ backgroundColor: '#14b8a6' }}
            >
              {submitting ? 'Memverifikasi akun…' : 'Masuk dengan Supabase'}
            </button>

            <button
              type="button"
              onClick={handleResetPassword}
              disabled={!configured || !email.trim() || resetState === 'sending' || resetCooldown > 0}
              className="w-full py-1 text-xs font-semibold text-cyan-300 hover:text-cyan-200 disabled:opacity-40"
            >
              {resetState === 'sending'
                ? 'Mengirim email…'
                : resetCooldown > 0
                  ? `Kirim ulang dalam ${resetCooldown}s`
                  : 'Lupa password?'}
            </button>
          </form>

          <p className="text-[11px] text-center mt-7 tracking-wide" style={{ color: TEXT_MUTED, opacity: 0.75 }}>
            Nasi Goreng 69 · Cold Storage · Supabase Auth
          </p>
        </section>
      </main>
    </div>
  );
}
