import { useState } from 'react';
import { useAuth } from '../hooks/useAuth';

export default function LoginPage() {
  const { login } = useAuth();
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [shake, setShake] = useState(false);

  const handleDigit = (d) => {
    if (pin.length >= 6) return;
    const next = pin + d;
    setPin(next);
    setError('');
    if (next.length === 4) {
      setTimeout(() => {
        if (!login(next)) {
          setError('PIN salah');
          setShake(true);
          setTimeout(() => { setShake(false); setPin(''); }, 600);
        }
      }, 200);
    }
  };

  const handleDelete = () => {
    setPin(p => p.slice(0, -1));
    setError('');
  };

  const dots = Array.from({ length: 4 }, (_, i) => (
    <div key={i} className={`w-3.5 h-3.5 rounded-full transition-all duration-200 ${i < pin.length
      ? 'bg-cyan-300 scale-110 shadow-[0_0_12px_rgba(103,232,249,0.7)]'
      : 'bg-white/25 border border-white/40'}`} />
  ));

  const keys = [1, 2, 3, 4, 5, 6, 7, 8, 9, null, 0, 'del'];
  return (
    <div className="min-h-dvh relative overflow-hidden bg-slate-950 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: "url('/assets/login-meeting.jpg')" }} />
      <div className="absolute inset-0 bg-slate-950/55" />
      <div className="absolute inset-0 bg-gradient-to-b from-slate-950/20 via-slate-950/35 to-slate-950/80" />

      <main className={`relative z-10 w-full max-w-sm ${shake ? 'animate-[shake_0.5s_ease-in-out]' : ''}`}>
        <section className="rounded-[2rem] border border-white/20 bg-white/10 backdrop-blur-xl shadow-2xl px-6 py-7">
          <div className="text-center mb-6">
            <div className="mx-auto mb-3 w-16 h-16 rounded-2xl bg-white flex items-center justify-center shadow-lg ring-1 ring-white/30 overflow-hidden p-1">
              <img src="/icons/icon-192x192.png" alt="GudangAI RUDY" className="w-full h-full object-contain" />
            </div>
            <h1 className="text-white text-2xl font-extrabold tracking-tight">GudangAI <span className="text-cyan-300">RUDY</span></h1>
            <p className="text-white/75 text-xs mt-1">Cold Storage Control System</p>
          </div>

          <div className="flex justify-center gap-4 mb-2">
            {dots}
          </div>

          <div className="h-6 mb-3 text-center">
            {error ? <p className="text-rose-300 text-sm font-semibold">{error}</p> : <p className="text-white/65 text-xs">Masukkan PIN</p>}
          </div>

          <div className="grid grid-cols-3 gap-2.5">
            {keys.map((k, i) => {
              if (k === null) return <div key={i} />;
              if (k === 'del') return (
                <button key={i} type="button" onClick={handleDelete} aria-label="Hapus angka terakhir"
                  className="h-14 rounded-2xl bg-white/10 border border-white/20 text-white/80 text-sm font-semibold backdrop-blur-md active:bg-white/20 active:scale-95 transition-all">
                  ←
                </button>
              );
              return (
                <button key={i} type="button" onClick={() => handleDigit(String(k))}
                  className="h-14 rounded-2xl bg-white/12 border border-white/20 text-white text-lg font-bold backdrop-blur-md active:bg-cyan-400/30 active:border-cyan-300/60 active:scale-95 transition-all">
                  {k}
                </button>
              );
            })}
          </div>

          <p className="text-white/55 text-[10px] text-center mt-6">Nasi Goreng 69 · Cold Storage</p>
        </section>
      </main>

      <style>{`
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          25% { transform: translateX(-8px); }
          75% { transform: translateX(8px); }
        }
      `}</style>
    </div>
  );
}
