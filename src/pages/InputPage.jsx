import { useState, useRef, useCallback, useEffect } from 'react';
import {
  Search, Trash2, Send, Loader2,
  Plus, Minus,
  PackagePlus, PackageMinus, AlertOctagon, Mic, Upload,
  QrCode, Bell, Camera, X, AlertTriangle, CheckCircle2, ClipboardPaste, Image,
} from 'lucide-react';
import {
  extractTextFromPdf, extractTextFromImage, parseLinesFromText, validateItems, applyStockAwareFallback,
  detectEntityFromText, scanBarcodeFromVideo,
} from '../data/pdfValidate';
import {
  submitBarangMasuk, submitBarangKeluar, submitBarangRusak, fetchStock,
  saveToHistory,
  pushNotification, getNotifications, markNotificationsRead, unreadNotificationCount,
} from '../data/api';
import { searchMaster } from '../data/master';

const TX_TYPES = [
  { id: 'masuk', label: 'Masuk', icon: PackagePlus, active: 'bg-emerald-50 border-emerald-200 ring-2 ring-emerald-400/40', iconBg: 'bg-emerald-500 text-white', iconIdle: 'bg-emerald-50 text-emerald-600' },
  { id: 'keluar', label: 'Keluar', icon: PackageMinus, active: 'bg-orange-50 border-orange-200 ring-2 ring-orange-400/40', iconBg: 'bg-orange-500 text-white', iconIdle: 'bg-orange-50 text-orange-600' },
  { id: 'rusak', label: 'Rusak', icon: AlertOctagon, active: 'bg-rose-50 border-rose-200 ring-2 ring-rose-400/40', iconBg: 'bg-rose-500 text-white', iconIdle: 'bg-rose-50 text-rose-600' },
];

export default function InputPage() {
  const [entity, setEntity] = useState('CV');
  const [txType, setTxType] = useState('keluar');
  const [mode, setMode] = useState('search');
  const [busy, setBusy] = useState(false);
  const [statusBanner, setStatusBanner] = useState('');
  const [accuracy, setAccuracy] = useState(null);
  const [cart, setCart] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const [tanggal, setTanggal] = useState(() => {
    try {
      return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
    } catch (_) {
      return new Date().toISOString().slice(0, 10);
    }
  });
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState([]);
  const [listening, setListening] = useState(false);
  const [showNotif, setShowNotif] = useState(false);
  const [notifs, setNotifs] = useState([]);
  const [unread, setUnread] = useState(0);
  const [camOn, setCamOn] = useState(false);
  const [camErr, setCamErr] = useState('');
  const [camMode, setCamMode] = useState('qr');
  const [showPaste, setShowPaste] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const [pendingManualIdx, setPendingManualIdx] = useState(null);
  const fileRef = useRef(null);
  const photoRef = useRef(null);
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const recogRef = useRef(null);

  useEffect(() => {
    const refresh = () => { setNotifs(getNotifications()); setUnread(unreadNotificationCount()); };
    refresh();
    window.addEventListener('gudangai-notif', refresh);
    return () => window.removeEventListener('gudangai-notif', refresh);
  }, []);

  const onSearch = (q) => { setQuery(q); setHits(q.length >= 1 ? searchMaster(entity, q).slice(0, 8) : []); };

  const addToCart = (item, qty = 1) => {
    if (pendingManualIdx != null) {
      setCart((prev) => prev.map((c, i) => i !== pendingManualIdx ? c : { ...c, kode: item.kode, nama: item.nama, satuan: item.satuan, status: 'ok', candidates: [], keterangan: c.keterangan || '' }));
      setPendingManualIdx(null); setQuery(''); setHits([]);
      setStatusBanner('Item ditandai cocok: ' + item.nama);
      return;
    }
    setCart((prev) => {
      const i = prev.findIndex((c) => c.kode === item.kode && c.status === 'ok');
      if (i >= 0) { const next = [...prev]; next[i] = { ...next[i], qty: +(next[i].qty + (qty || 1)).toFixed(2) }; return next; }
      return [...prev, { kode: item.kode, nama: item.nama, satuan: item.satuan, qty: qty || 1, keterangan: '', status: 'ok' }];
    });
    setQuery(''); setHits([]);
  };

  // RESTORED_STUB - full body continues via second commit if truncated
  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="p-3 text-sm text-amber-700 bg-amber-50">InputPage sedang dipulihkan. Refresh setelah deploy selesai.</div>
    </div>
  );
}
