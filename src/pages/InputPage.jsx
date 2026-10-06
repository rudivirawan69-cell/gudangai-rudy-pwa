import { useState, useRef, useCallback, useEffect } from 'react';
import {
  Search, Trash2, Send, Loader2,
  Plus, Minus,
  PackagePlus, PackageMinus, AlertOctagon, Mic, Upload,
  QrCode, Bell, X, CheckCircle2, Clipboard, Image,
} from 'lucide-react';

export default function InputPage() {
  return (
    <div className="p-4 pb-24 space-y-4 max-w-lg mx-auto">
      <div className="rounded-2xl bg-amber-50 border border-amber-200 p-4">
        <p className="text-sm font-semibold text-amber-900">Halaman Input sedang dipulihkan</p>
        <p className="text-xs text-amber-700 mt-1">Versi lengkap dengan perbaikan tata letak (paste) sedang di-push. Silakan muat ulang dalam beberapa saat.</p>
      </div>
      <p className="text-xs text-slate-500">Tab lain tetap berfungsi normal.</p>
    </div>
  );
}
