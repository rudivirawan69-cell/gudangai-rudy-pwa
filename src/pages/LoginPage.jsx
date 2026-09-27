import { useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import { KeyRound, Snowflake, Eye, EyeOff } from 'lucide-react';

export default function LoginPage() {
  const { login } = useAuth();
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [showPin, setShowPin] = useState(false);
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
    <div key={i} className={`w-4 h-4 rounded-full transition-all duration-200 ${
      i < pin.length
        ? 'bg-cyan-400 scale-110 shadow-[0_0_12px_rgba(34,211,238,0.5)]'
        : 'bg-white/20 border border-white/30'
    }`} />
  ));

  const keys = [1, 2, 3, 4, 5, 6, 7, 8, 9, null, 0, 'del'];

  return (
    <div className="min-h-dvh bg-gradient-to-br from-[#0a1628] via-[#0b2a55] to-[#0f3a73] flex flex-col items-center justify-center px-6">
      {/* Logo */}
      <div className="mb-8 animate-fade-in">
        <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-cyan-400 to-blue-500 flex items-center justify-center shadow-[0_0_40px_rgba(34,211,238,0.3)] mb-4 mx-auto">
          <Snowflake className="w-10 h-10 text-white" />
        </div>
        <h1 className="text-white text-2xl font-bold tracking-tight text-center">GudangAI <span className="text-cyan-400 font-extrabold">RUDY</span></h1>
        <p className="text-cyan-300/60 text-sm text-center mt-1">Cold Storage Control System</p>
      </div>

      {/* PIN Display */}
      <div className={`flex gap-4 mb-2 ${shake ? 'animate-[shake_0.5s_ease-in-out]' : ''}`}
           style={shake ? { animation: 'shake 0.5s ease-in-out' } : {}}>
        {dots}
      </div>

      {/* Error */}
      <div className="h-6 mb-4">
        {error && <p className="text-red-400 text-sm animate-fade-in">{error}</p>}
        {!error && <p className="text-white/40 text-sm">Masukkan PIN</p>}
      </div>

      {/* Keypad */}
      <div className="grid grid-cols-3 gap-3 w-full max-w-[280px]">
        {keys.map((k, i) => {
          if (k === null) return <div key={i} />;
          if (k === 'del') return (
            <button key={i} onClick={handleDelete}
              className="h-16 rounded-2xl bg-white/5 backdrop-blur-sm border border-white/10 text-white/70 text-sm font-medium active:bg-white/15 transition-all flex items-center justify-center">
              ←
            </button>
          );
          return (
            <button key={i} onClick={() => handleDigit(String(k))}
              className="h-16 rounded-2xl bg-white/10 backdrop-blur-sm border border-white/15 text-white text-xl font-semibold active:bg-cyan-500/30 active:border-cyan-400/50 active:scale-95 transition-all">
              {k}
            </button>
          );
        })}
      </div>

      {/* Footer */}
      <p className="text-white/20 text-xs mt-10">Nasi Goreng 69 · Cold Storage</p>

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
