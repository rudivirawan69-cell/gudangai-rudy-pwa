import { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import { searchMaster, ENTITIES } from '../data/master';
import { useStock } from '../hooks/useStock';
import { searchLiveStock } from '../data/liveSearch';
import { submitBarangMasuk, submitBarangKeluar, submitBarangRusak, saveToHistory } from '../data/api';
import { validateItems, extractTextFromPdf, extractTextFromImage, parseLinesFromText, parseLine, normalizeQty, formatQtyDisplay } from '../data/pdfValidate';
import { isSpeechSupported, createRecognizer, parseVoiceCommand, resolveVoiceItem } from '../data/voiceInput';
import {
  PackagePlus, PackageMinus, Search, Trash2, Send, CheckCircle, AlertCircle,
  Loader2, X, AlertTriangle, Upload, Eye, Mic, MicOff, FileText,
} from 'lucide-react';

function ItemRow({ item, onRemove, onUpdate, showMatch }) {
  return (
    <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm animate-slide-up">
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="flex-1 min-w-0">
          <p className="text-xs text-blue-600 font-mono font-bold">{item.kode}</p>
          <p className="text-[15px] font-semibold text-gray-800 leading-tight mt-0.5">{item.nama}</p>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            <p className="text-[12px] text-gray-400">{item.divisi} · {item.satuan}</p>
            {showMatch && item.matchType && (
              <span className="text-[9px] px-1.5 py-0.5 rounded bg-cyan-100 text-cyan-700 font-medium">{item.matchType}</span>
            )}
            {item.source === 'voice' && <span className="text-[9px] px-1.5 py-0.5 rounded bg-violet-100 text-violet-700 font-medium">voice</span>}
          </div>
        </div>
        <button type="button" onClick={onRemove} className="p-2 -mr-1 text-gray-300 active:text-red-500">
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
      <div className="flex gap-3">
        <div className="w-28">
          <label className="text-[10px] text-gray-500 uppercase tracking-wider font-medium">Qty</label>
          <input type="number" min="0" step="1" inputMode="decimal" value={item.qty}
            onChange={(e) => onUpdate({ qty: parseFloat(e.target.value) || 0 })}
            className="w-full mt-1 px-3 py-3.5 bg-gray-50 rounded-xl border border-gray-200 text-lg font-bold text-center focus:outline-none focus:border-blue-400" />
        </div>
        <div className="flex-1">
          <label className="text-[10px] text-gray-500 uppercase tracking-wider font-medium">Keterangan</label>
          <input type="text" placeholder="Kosong (opsional)" value={item.keterangan}
            onChange={(e) => onUpdate({ keterangan: e.target.value })}
            className="w-full mt-1 px-3 py-3 bg-gray-50 rounded-xl border border-gray-200 text-sm focus:outline-none focus:border-blue-400" />
        </div>
      </div>
    </div>
  );
}

export default function InputPage() {
  const [entity, setEntity] = useState('CV');
  const stock = useStock(entity);
  const [type, setType] = useState('keluar');
  const [search, setSearch] = useState('');
  const [items, setItems] = useState([]);
  const [showSearch, setShowSearch] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null);
  const [showUpload, setShowUpload] = useState(false);
  const [uploadText, setUploadText] = useState('');
  const [validationResult, setValidationResult] = useState(null);
  const [confirmedFromUpload, setConfirmedFromUpload] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [pdfFileName, setPdfFileName] = useState('');
  const [tanggalPengeluaran, setTanggalPengeluaran] = useState(() => new Date().toISOString().slice(0, 10));
  const [listening, setListening] = useState(false);
  const [voiceError, setVoiceError] = useState('');
  const [voiceHint, setVoiceHint] = useState('');
  const [voiceCandidates, setVoiceCandidates] = useState(null);
  const recognizerRef = useRef(null);
  const searchRef = useRef(null);
  const fileRef = useRef(null);
  const submitLock = useRef(false);
  const speechOk = isSpeechSupported();

  // ... (rest of the full component will be restored in next step if needed)
  return (
    <div className="pb-36 pt-3 min-h-[60vh]">
      <p className="text-center text-red-600 p-8">Sedang memulihkan file... Silakan refresh dalam 1 menit.</p>
    </div>
  );
}
