import { useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import { isSupabaseConfigured } from '../data/supabaseAuth';

export default function LoginPage() {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
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

  return (
    <div
      className="min-h-dvh flex items-center justify-center p-4"
      style={{ backgroundColor: '#02030f' }}
    >
      <main className="relative z-10 w-full max-w-sm">
        <section
          className="rounded-3xl border border-white/10 px-6 py-8 shadow-2xl"
          style={{ backgroundColor: '#1b1e2e' }}
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
              <span className="text-white">GudangAI</span>{' '}
              <span className="text-cyan-400">RUDY</span>
            </h1>
            <p className="text-white/60 text-xs mt-1.5 font-medium">
              Cold Storage Control System
            </p>
          </div>

          {!configured && (
            <div className="mb-4 rounded-xl border border-amber-400/30 bg-amber-500/10 p-3 text-xs text-amber-100">
              Konfigurasi Supabase tidak terdeteksi. Pastikan VITE_SUPABASE_URL dan
              VITE_SUPABASE_PUBLISHABLE_KEY tersedia pada build.
            </div>
          )}

          <form onSubmit={handleSupabaseSubmit} className="space-y-3.5">
            <label className="block">
              <span className="mb-1.5 block text-xs font-semibold text-white/80">
                Email operator
              </span>
              <input
                type="email"
                autoComplete="username"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="nama@perusahaan.com"
                className="w-full rounded-xl border border-white/15 bg-black/30 px-3.5 py-3 text-sm text-white outline-none placeholder:text-white/35 focus:border-teal-400 focus:ring-1 focus:ring-teal-400/40"
              />
            </label>

            <label className="block">
              <span className="mb-1.5 block text-xs font-semibold text-white/80">
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
                  className="min-w-0 flex-1 rounded-xl border border-white/15 bg-black/30 px-3.5 py-3 text-sm text-white outline-none placeholder:text-white/35 focus:border-teal-400 focus:ring-1 focus:ring-teal-400/40"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((value) => !value)}
                  className="rounded-xl border border-white/15 px-3 text-xs font-semibold text-white/75 hover:bg-white/5"
                >
                  {showPassword ? 'Sembunyikan' : 'Lihat'}
                </button>
              </div>
            </label>

            {error && (
              <p
                role="alert"
                className="rounded-xl border border-rose-400/35 bg-rose-500/10 p-3 text-xs text-rose-100"
              >
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={submitting || !configured || !email.trim() || !password}
              className="w-full rounded-xl py-3 text-sm font-extrabold text-slate-950 shadow-lg disabled:opacity-45"
              style={{ backgroundColor: '#14b8a6' }}
            >
              {submitting ? 'Memverifikasi akun…' : 'Masuk dengan Supabase'}
            </button>
          </form>

          <p className="text-white/45 text-[10px] text-center mt-7 tracking-wide">
            Nasi Goreng 69 · Cold Storage · Supabase Auth
          </p>
        </section>
      </main>
    </div>
  );
}
