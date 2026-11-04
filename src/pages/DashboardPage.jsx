import { useMemo, useState, useEffect, useCallback, useRef } from 'react';
import { useStock } from '../hooks/useStock';
import { useAuth } from '../hooks/useAuth';
import {
  getPendingQueue, getStatusPO, getDashboardData, confirmPOStatus, getLocalHistory, getApiUrl, getApiSecret,
} from '../data/api';
import { DIVISIONS } from '../data/master';
import { classifyStockLevel } from '../data/stockStatus';
import OperatorTasks from '../components/OperatorTasks';
import ClaudeAssistant from '../components/ClaudeAssistant';
import {
  RefreshCw, FileText, Package, Users, Boxes, ShieldAlert, CheckCircle2, AlertCircle, X,
  CalendarDays, CalendarClock, ClipboardCheck, FilePlus2, Mail, Clock3, Layers3, ArrowUpRight,
  ChevronDown,
} from 'lucide-react';

import {
  classifyItem,
  formatSpreadsheetTimestamp,
  RingChart,
  DonutPO,
  DivisionStatus3D,
  normalizeMatch,
  mergeIncomingWithPO,
  normalizeStatusPO,
  getPODataSignature,
} from './dashboardHelpersA';
import {
  Movement7Days,
  StockComparison,
  DashboardTotals,
  POQuickActions,
  StatusPOCard,
} from './dashboardHelpersB';

export default function DashboardPage({ onNavigate }) {
  const { user } = useAuth();
  const stockAll = useStock('ALL');
  const stockCV = useStock('CV');
  const stockPT = useStock('PT');
  const allItems = stockAll.items || [];
  const loading = stockAll.loading || stockCV.loading || stockPT.loading;
  const refresh = useCallback(() => {
    void stockAll.refresh({ force: true });
    void stockCV.refresh({ force: true });
    void stockPT.refresh({ force: true });
  }, [stockAll, stockCV, stockPT]);

  const [poData, setPoData] = useState(null);
  const [dashboardData, setDashboardData] = useState(null);
  const [history, setHistory] = useState([]);
  const [confirmMsg, setConfirmMsg] = useState('');

  const loadPO = useCallback(async () => {
    try {
      const raw = await getStatusPO();
      const norm = normalizeStatusPO(raw);
      if (norm?.success) setPoData(norm);
    } catch (_) {}
  }, []);

  const loadDashboardData = useCallback(async () => {
    try {
      const d = await getDashboardData();
      setDashboardData(d);
    } catch (_) {}
  }, []);

  useEffect(() => {
    loadPO();
    loadDashboardData();
    try { setHistory(getLocalHistory() || []); } catch (_) {}
  }, [loadPO, loadDashboardData]);

  const stats = useMemo(() => {
    const items = allItems || [];
    let aman = 0, waspada = 0, kritis = 0;
    const cv = { aman: 0, waspada: 0, kritis: 0, total: 0 };
    const pt = { aman: 0, waspada: 0, kritis: 0, total: 0 };
    for (const it of items) {
      const cls = classifyItem(it);
      if (cls === 'aman') aman += 1;
      else if (cls === 'waspada') waspada += 1;
      else kritis += 1;
      const ent = String(it.entitas || it.entity || '').toUpperCase();
      const bucket = ent === 'PT' ? pt : cv;
      bucket.total += 1;
      bucket[cls] += 1;
    }
    return { aman, waspada, kritis, total: items.length, cv, pt };
  }, [allItems]);

  const pending = useMemo(() => {
    try {
      const q = getPendingQueue() || [];
      return q.reduce((n, e) => n + (e.items?.length || 0), 0);
    } catch { return 0; }
  }, [allItems, poData]);

  const dashboardTotalItem = Number(dashboardData?.totalItem || stats.total || 0);

  return (
    <div className="dashboard-shell w-full max-w-6xl mx-auto px-3 sm:px-5 lg:px-7 pt-4 pb-24 space-y-4">
      <div className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200/80 bg-white/80 px-4 py-3 shadow-sm">
        <div className="min-w-0">
          <p className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-cyan-700">Pusat Kendali Gudang</p>
          <h1 className="mt-0.5 text-base font-black tracking-tight text-slate-900">Ringkasan Operasional</h1>
          <p className="mt-0.5 text-[10px] font-medium text-slate-500">Pantau stok, pergerakan, dan status PO</p>
        </div>
        <button
          type="button"
          onClick={() => { refresh?.(); loadPO(); loadDashboardData(); }}
          className="h-10 w-10 shrink-0 rounded-xl border border-slate-200 bg-white text-slate-600 shadow-sm flex items-center justify-center active:scale-95"
          aria-label="Refresh data"
          title="Muat ulang data Beranda"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>
      {confirmMsg && (
        <p className="rounded-xl border border-emerald-100 bg-emerald-50 px-3 py-2 text-[11px] font-semibold text-emerald-700">{confirmMsg}</p>
      )}

      <OperatorTasks />

      <ClaudeAssistant stock={allItems} pending={pending} />

      <section className="grid grid-cols-1 xl:grid-cols-2 gap-4" aria-label="Ringkasan operasional">
        <div className="dashboard-panel rounded-2xl bg-white border border-slate-200 shadow-sm p-4 min-w-0">
          <Movement7Days history={history} />
        </div>
        <div className="dashboard-panel rounded-2xl bg-white border border-slate-200 shadow-sm p-4 min-w-0">
          <StockComparison cv={stats.cv} pt={stats.pt} />
        </div>
        <div className="xl:col-span-2"><DashboardTotals totalItem={dashboardTotalItem} /></div>
      </section>

      <section className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <div className="dashboard-panel rounded-2xl bg-white border border-slate-200 shadow-sm p-4 min-w-0">
          <StatusPOCard poData={poData} onConfirm={async (payload) => {
            try {
              await confirmPOStatus(payload);
              setConfirmMsg('Status PO diperbarui');
              loadPO();
            } catch (e) {
              setConfirmMsg(e?.message || 'Gagal konfirmasi PO');
            }
          }} />
        </div>
        <div className="dashboard-panel rounded-2xl bg-white border border-slate-200 shadow-sm p-4 min-w-0">
          <DivisionStatus3D items={allItems} sourceRows={dashboardData?.divisi || []} />
        </div>
      </section>

      {pending > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] font-semibold text-amber-800">
          {pending} item menunggu sinkronisasi di Antrian.
        </div>
      )}
    </div>
  );
}
