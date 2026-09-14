import { useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import { Snowflake } from 'lucide-react';

export default function LoginPage() {
  const { login } = useAuth();
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [shake, setShake] = useState(false);
  const [imgErr, setImgErr] = useState(false);

  const tryLogin = (value) => {
    setTimeout(() => {
      if (!login(value)) {
        setError('PIN salah');
        setShake(true);
        setTimeout(() => { setShake(false); setPin(''); }, 600);
      }
    }, 200);
  };

  const handleDigit = (d) => {
    if (pin.length >= 6) return;
    const next = pin + d;
    setPin(next);
    setError('');
    // Auto-submit at 4 digits (default PIN length); user can continue to 6
    if (next.length === 4 || next.length === 6) {
      tryLogin(next);
    }
  };

  const handleDelete = () => {
    setPin(p => p.slice(0, -1));
    setError('');
  };

  const dots = Array.from({ length: 6 }, (_, i) => (
    <div key={i} className={`w-3.5 h-3.5 rounded-full transition-all duration-200 ${
      i < pin.length
        ? 'bg-cyan-400 scale-110 shadow-[0_0_12px_rgba(34,211,238,0.5)]'
        : 'bg-white/20 border border-white/30'
    }`} />
  ));

  const keys = [1, 2, 3, 4, 5, 6, 7, 8, 9, null, 0, 'del'];

  return (
    <>
      <div className="app-bg" aria-hidden>
        <div className="app-bg-login" />
      </div>
      <div className="app-shell min-h-dvh flex flex-col items-center justify-center px-6">
        {/* Logo */}
        <div className="mb-8 animate-fade-in relative z-10">
          <div className="w-24 h-24 rounded-2xl bg-gradient-to-br from-cyan-400 to-[#0b2a55] flex items-center justify-center shadow-[0_0_40px_rgba(34,211,238,0.35)] mb-4 mx-auto overflow-hidden border-2 border-white/30">
            {!imgErr ? (
              <img
                src="/assets/avatar-rudi.jpg"
                alt="GudangAI RUDY"
                className="w-full h-full object-cover"
                onError={() => setImgErr(true)}
              />
            ) : (
              <Snowflake className="w-12 h-12 text-white" />
            )}
          </div>
          <h1 className="text-white text-2xl font-bold tracking-tight text-center drop-shadow-lg">
            GudangAI <span className="text-cyan-300 font-extrabold">RUDY</span>
          </h1>
          <p className="text-cyan-100/70 text-sm text-center mt-1 drop-shadow">Cold Storage Control System</p>
        </div>

        {/* PIN Display */}
        <div className={`flex gap-3 mb-2 relative z-10 ${shake ? 'animate-[shake_0.5s_ease-in-out]' : ''}`}
             style={shake ? { animation: 'shake 0.5s ease-in-out' } : {}}>
          {dots}
        </div>

        {/* Error */}
        <div className="h-6 mb-4 relative z-10">
          {error && <p className="text-red-300 text-sm animate-fade-in drop-shadow">{error}</p>}
          {!error && <p className="text-white/50 text-sm drop-shadow">Masukkan PIN</p>}
        </div>

        {/* Keypad */}
        <div className="grid grid-cols-3 gap-3 w-full max-w-[280px] relative z-10">
          {keys.map((k, i) => {
            if (k === null) return <div key={i} />;
            if (k === 'del') return (
              <button key={i} onClick={handleDelete}
                className="h-16 rounded-2xl bg-white/10 backdrop-blur-md border border-white/20 text-white/80 text-sm font-medium active:bg-white/20 transition-all flex items-center justify-center">
                ←
              </button>
            );
            return (
              <button key={i} onClick={() => handleDigit(String(k))}
                className="h-16 rounded-2xl bg-white/15 backdrop-blur-md border border-white/25 text-white text-xl font-semibold active:bg-cyan-500/40 active:border-cyan-400/60 active:scale-95 transition-all">
                {k}
              </button>
            );
          })}
        </div>

        <p className="text-white/30 text-xs mt-10 relative z-10 drop-shadow">Nasi Goreng 69 · Cold Storage</p>

        <style>{`
          @keyframes shake {
            0%, 100% { transform: translateX(0); }
            25% { transform: translateX(-8px); }
            75% { transform: translateX(8px); }
          }
        `}</style>
      </div>
    </>
  );
}
