import { useState, useEffect, useCallback } from 'react';
import {
  PackagePlus, CalendarCheck2, UsersRound, Truck,
  X, CheckCircle2, Plus, Calendar,
} from 'lucide-react';

const STORAGE_KEY = 'gudangai_ops_categories_v1';

const DEFAULT_STATE = {
  tambahanOrder: [
    { id: 101, poNumber: 'PO-ADD-8891', client: 'Toko Sumber Rejeki', items: '2 Box Frozen Beef Slice + 5 Ctn Sauce', time: '10 menit lalu' },
    { id: 102, poNumber: 'PO-ADD-8895', client: 'Resto Segar Buana', items: '10 Pack Butter Unsalted 250g', time: '25 menit lalu' },
  ],
  dailyTasks: [
    { id: 't1', title: 'Pemeriksaan Suhu Cold Storage A & B', done: true },
    { id: 't2', title: 'Stock Opname Harian Item Kritis (Min. Stock)', done: false },
    { id: 't3', title: 'Penerimaan Supplier Jam 13:00 WIB', done: false },
  ],
  offToday: [
    { id: 'o1', initials: 'UL', name: 'Ulum (Gudang B)', status: 'Izin/Cuti Harian' },
    { id: 'o2', initials: 'BP', name: 'Pak Bambang', status: 'Off Reguler' },
  ],
  meeting: {
    title: 'Evaluasi Operational Q4',
    time: '14:00 - 15:30 WIB',
    participants: 'Peserta: Pak Hery, Pak Supri, & Leader Shift Gudang Pusat.',
  },
  projects: [
    { id: 'p1', name: 'Integrasi Barcode Scanner PWA', progress: 75 },
    { id: 'p2', name: 'Penataan Racking Area Cold Storage', progress: 40 },
  ],
  shipments: [
    { id: 1, destination: 'RUTE MADIUN - MAGETAN', driver: 'Pak Jarwo (Engkel L300)', manifest: 'MNF-20231001', etd: '13:30 WIB', status: 'Ready Dispatched' },
    { id: 2, destination: 'RUTE SOLO - JOGJA', driver: 'Pak Slamet (CDD Box)', manifest: 'MNF-20231004', etd: '15:00 WIB', status: 'In Packing' },
  ],
  notes: '',
};

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_STATE };
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_STATE, ...parsed };
  } catch {
    return { ...DEFAULT_STATE };
  }
}

function saveState(state) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* ignore */
  }
}

export default function OpsCategoryCards() {
  const [state, setState] = useState(() => loadState());
  const [activeModal, setActiveModal] = useState(null);
  const [toast, setToast] = useState(null);

  useEffect(() => {
    saveState(state);
  }, [state]);

  const showToast = useCallback((msg) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  }, []);

  const confirmOrder = (id) => {
    setState((prev) => ({
      ...prev,
      tambahanOrder: prev.tambahanOrder.filter((x) => x.id !== id),
    }));
    showToast('Order berhasil dikonfirmasi & masuk ke Barang Keluar');
  };

  const toggleTask = (id) => {
    setState((prev) => ({
      ...prev,
      dailyTasks: prev.dailyTasks.map((t) =>
        t.id === id ? { ...t, done: !t.done } : t
      ),
    }));
  };

  const pendingOrder = state.tambahanOrder.length;
  const offCount = state.offToday.length;

  const cards = [
    {
      id: 'tambahanOrder',
      title: 'Tambahan Order',
      subtitle: state.tambahanOrder[0]
        ? `${state.tambahanOrder[0].client} · ${state.tambahanOrder[0].items}`
        : 'Belum ada catatan',
      icon: PackagePlus,
      iconClass: 'ops-icon-amber',
      cardClass: 'ops-card--amber',
      badge: { text: `${pendingOrder} Aktif`, className: 'bg-amber-100 text-amber-800 border border-amber-200 dark:bg-amber-900/50 dark:text-amber-200 dark:border-amber-700' },
    },
    {
      id: 'jadwalOff',
      title: 'Jadwal Off',
      subtitle: state.offToday[0]
        ? `${state.offToday[0].name} · ${state.offToday[0].status}`
        : 'Belum ada jadwal',
      icon: CalendarCheck2,
      iconClass: 'ops-icon-emerald',
      cardClass: 'ops-card--emerald',
      badge: { text: `${offCount} Orang`, className: 'bg-emerald-100 text-emerald-800 border border-emerald-200 dark:bg-emerald-900/50 dark:text-emerald-200 dark:border-emerald-700' },
    },
    {
      id: 'jadwalMeeting',
      title: 'Jadwal Meeting',
      subtitle: state.meeting?.title || 'Belum ada agenda meeting',
      icon: UsersRound,
      iconClass: 'ops-icon-indigo',
      cardClass: 'ops-card--indigo',
      badge: { text: state.meeting?.time || 'Belum dijadwalkan', className: 'bg-indigo-100 text-indigo-800 border border-indigo-200 dark:bg-indigo-900/50 dark:text-indigo-200 dark:border-indigo-700' },
    },
    {
      id: 'kirimLuarKota',
      title: 'Kirim Luar Kota',
      subtitle: state.shipments[0]?.destination || 'Belum ada jadwal pengiriman',
      icon: Truck,
      iconClass: 'ops-icon-sky',
      cardClass: 'ops-card--sky',
      badge: { text: `${state.shipments.length} Pengiriman`, className: 'bg-sky-100 text-sky-800 border border-sky-200 dark:bg-sky-900/50 dark:text-sky-200 dark:border-sky-700' },
    },
  ];

  const modalMeta = {
    tambahanOrder: { title: 'Tambahan Order Susulan', subtitle: 'Konfirmasi langsung ke flow Barang Keluar', color: 'amber' },
    jadwalOff: { title: 'Jadwal Off & Tugas Harian', subtitle: 'Tim libur & instruksi kerja operasional', color: 'emerald' },
    jadwalMeeting: { title: 'Meeting & Target Project', subtitle: 'Agenda rapat & progress jangka panjang', color: 'indigo' },
    kirimLuarKota: { title: 'Jadwal Ekspedisi Luar Kota', subtitle: 'Manifest pengiriman armada & driver', color: 'sky' },
  };

  return (
    <section className="ops-category-section space-y-3.5" aria-label="Pengingat dan catatan operasional">
      <div className="flex justify-between items-end px-0.5">
        <div className="min-w-0">
          <span className="ops-section-label text-[10px] font-extrabold tracking-widest uppercase block">
            Pengingat & Catatan
          </span>
          <h2 className="ops-section-title text-sm font-extrabold">
            Operasional Gudang
          </h2>
        </div>
        <span className="ops-badge-count text-[10px] px-2.5 py-1 rounded-full font-bold shrink-0">
          4 Kategori
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2.5">
        {cards.map((card) => {
          const Icon = card.icon;
          return (
            <button
              key={card.id}
              type="button"
              onClick={() => setActiveModal(card.id)}
              className={`ops-card group relative text-left p-3.5 flex flex-col justify-between min-h-[128px] ${card.cardClass}`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className={`p-2.5 rounded-xl text-white shadow-md group-hover:scale-105 transition-transform ${card.iconClass}`}>
                  <Icon className="w-5 h-5" />
                </div>
                <span className={`inline-flex items-center justify-center min-w-7 px-2 py-1 rounded-full text-[10px] font-extrabold tabular-nums ${card.badge.className}`}>
                  {card.badge.text}
                </span>
              </div>
              <div className="min-w-0 pt-3">
                <h3 className="ops-card-title text-xs font-extrabold leading-tight">{card.title}</h3>
                <p className="ops-card-sub text-[10px] leading-snug mt-1 line-clamp-1">{card.subtitle}</p>
              </div>
            </button>
          );
        })}
      </div>

      <div className="ops-notes-card p-4">
        <div className="flex justify-between items-center mb-3">
          <div>
            <h3 className="font-bold text-sm" style={{ color: 'var(--text-main)' }}>Tambah Catatan Operasional</h3>
            <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>Tersimpan lokal di perangkat ini</p>
          </div>
        </div>
        <textarea
          rows={2}
          value={state.notes}
          onChange={(e) => setState((prev) => ({ ...prev, notes: e.target.value }))}
          placeholder="Tulis catatan operasional, nomor PO, atau jadwal..."
          className="w-full p-3 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-slate-400 transition-all"
        />
        <div className="flex gap-2 mt-2 overflow-x-auto pb-1">
          <button type="button" onClick={() => setActiveModal('tambahanOrder')} className="px-3 py-1.5 bg-amber-50 text-amber-700 border border-amber-200 text-[11px] font-semibold rounded-lg shrink-0 flex items-center gap-1">
            <Plus className="w-3 h-3" /> Tambahan Order
          </button>
          <button type="button" onClick={() => setActiveModal('jadwalOff')} className="px-3 py-1.5 bg-emerald-50 text-emerald-700 border border-emerald-200 text-[11px] font-semibold rounded-lg shrink-0 flex items-center gap-1">
            <Calendar className="w-3 h-3" /> Jadwal Off
          </button>
          <button type="button" onClick={() => setActiveModal('kirimLuarKota')} className="px-3 py-1.5 bg-sky-50 text-sky-700 border border-sky-200 text-[11px] font-semibold rounded-lg shrink-0 flex items-center gap-1">
            <Truck className="w-3 h-3" /> Luar Kota
          </button>
        </div>
      </div>

      {activeModal && (
        <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-900/60 backdrop-blur-sm" onClick={() => setActiveModal(null)} role="dialog" aria-modal="true">
          <div className="bg-white dark:bg-slate-900 w-full max-w-md rounded-t-3xl sm:rounded-3xl shadow-2xl max-h-[85vh] flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className={`px-5 py-4 border-b border-slate-100 dark:border-slate-700 flex justify-between items-center ${
              activeModal === 'tambahanOrder' ? 'bg-amber-50/50 dark:bg-amber-950/30' :
              activeModal === 'jadwalOff' ? 'bg-emerald-50/50 dark:bg-emerald-950/30' :
              activeModal === 'jadwalMeeting' ? 'bg-indigo-50/50 dark:bg-indigo-950/30' :
              'bg-sky-50/50 dark:bg-sky-950/30'
            }`}>
              <div className="flex items-center gap-3">
                <div className={`p-2 text-white rounded-xl shadow-sm ${
                  activeModal === 'tambahanOrder' ? 'bg-amber-500' :
                  activeModal === 'jadwalOff' ? 'bg-emerald-500' :
                  activeModal === 'jadwalMeeting' ? 'bg-indigo-500' : 'bg-sky-500'
                }`}>
                  {activeModal === 'tambahanOrder' && <PackagePlus className="w-5 h-5" />}
                  {activeModal === 'jadwalOff' && <CalendarCheck2 className="w-5 h-5" />}
                  {activeModal === 'jadwalMeeting' && <UsersRound className="w-5 h-5" />}
                  {activeModal === 'kirimLuarKota' && <Truck className="w-5 h-5" />}
                </div>
                <div>
                  <h3 className="font-bold text-slate-800 dark:text-slate-100 text-base">{modalMeta[activeModal]?.title}</h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">{modalMeta[activeModal]?.subtitle}</p>
                </div>
              </div>
              <button type="button" onClick={() => setActiveModal(null)} className="p-1.5 rounded-full hover:bg-slate-200/60 dark:hover:bg-slate-700 text-slate-400" aria-label="Tutup">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-5 overflow-y-auto flex-1 space-y-4">
              {activeModal === 'tambahanOrder' && (
                <div className="space-y-3">
                  <div className="p-3 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 rounded-xl text-xs text-amber-800 dark:text-amber-200">
                    <strong>Fitur Direct Konfirmasi:</strong> Klik tombol di bawah untuk menandai order sudah masuk antrean packing/outbound.
                  </div>
                  {state.tambahanOrder.length === 0 ? (
                    <div className="text-center py-8">
                      <CheckCircle2 className="w-12 h-12 text-emerald-500 mx-auto mb-2" />
                      <p className="text-sm font-bold text-slate-700 dark:text-slate-200">Semua Order Tambahan Telah Dikonfirmasi</p>
                      <p className="text-xs text-slate-400 mt-1">Data siap masuk ke menu Barang Keluar.</p>
                    </div>
                  ) : state.tambahanOrder.map((item) => (
                    <div key={item.id} className="p-3.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-sm">
                      <div className="flex justify-between items-start mb-1.5">
                        <div>
                          <span className="text-[10px] font-bold text-amber-600 bg-amber-50 dark:bg-amber-900/40 px-2 py-0.5 rounded-md border border-amber-200">{item.poNumber}</span>
                          <h4 className="font-bold text-slate-800 dark:text-slate-100 text-sm mt-1">{item.client}</h4>
                        </div>
                        <span className="text-[11px] font-semibold text-slate-400">{item.time}</span>
                      </div>
                      <div className="text-xs text-slate-600 dark:text-slate-300 mb-3 bg-slate-50 dark:bg-slate-900/50 p-2 rounded-lg font-mono">{item.items}</div>
                      <button type="button" onClick={() => confirmOrder(item.id)} className="w-full py-2 bg-gradient-to-r from-amber-500 to-amber-600 text-white font-semibold text-xs rounded-xl shadow-md active:scale-95 flex justify-center items-center gap-1.5">
                        <CheckCircle2 className="w-4 h-4" /> Konfirmasi Direct ke Barang Keluar
                      </button>
                    </div>
                  ))}
                </div>
              )}
              {activeModal === 'jadwalOff' && (
                <div className="space-y-4">
                  <div>
                    <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Tim Cuti / Off Hari Ini</h4>
                    <div className="grid grid-cols-2 gap-2">
                      {state.offToday.map((p) => (
                        <div key={p.id} className="p-2.5 bg-emerald-50/60 dark:bg-emerald-950/30 border border-emerald-200/80 dark:border-emerald-800 rounded-xl flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-full bg-emerald-200 dark:bg-emerald-800 text-emerald-800 dark:text-emerald-100 font-bold flex items-center justify-center text-xs">{p.initials}</div>
                          <div>
                            <div className="text-xs font-bold text-slate-800 dark:text-slate-100">{p.name}</div>
                            <div className="text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold">{p.status}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Checklist Tugas Operasional</h4>
                    <div className="space-y-2">
                      {state.dailyTasks.map((task) => (
                        <label key={task.id} className="flex items-center gap-3 p-3 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl cursor-pointer">
                          <input type="checkbox" checked={task.done} onChange={() => toggleTask(task.id)} className="w-4 h-4 accent-emerald-600 rounded" />
                          <span className={`text-xs font-medium text-slate-700 dark:text-slate-200 ${task.done ? 'line-through text-slate-400' : ''}`}>{task.title}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                </div>
              )}
              {activeModal === 'jadwalMeeting' && (
                <div className="space-y-4">
                  <div>
                    <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Agenda Rapat Hari Ini</h4>
                    <div className="p-3.5 bg-indigo-50/60 dark:bg-indigo-950/30 border border-indigo-200 dark:border-indigo-800 rounded-2xl">
                      <div className="flex justify-between items-center mb-1">
                        <span className="text-xs font-bold text-indigo-700 dark:text-indigo-300">{state.meeting.title}</span>
                        <span className="text-[10px] bg-indigo-600 text-white px-2 py-0.5 rounded-full font-bold">{state.meeting.time}</span>
                      </div>
                      <p className="text-xs text-slate-600 dark:text-slate-300">{state.meeting.participants}</p>
                    </div>
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Progress Project Strategic</h4>
                    <div className="space-y-3">
                      {state.projects.map((proj) => (
                        <div key={proj.id} className="p-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl">
                          <div className="flex justify-between text-xs font-bold mb-1">
                            <span className="text-slate-800 dark:text-slate-100">{proj.name}</span>
                            <span className="text-indigo-600 dark:text-indigo-400">{proj.progress}%</span>
                          </div>
                          <div className="w-full bg-slate-100 dark:bg-slate-700 rounded-full h-2">
                            <div className="bg-indigo-600 h-2 rounded-full" style={{ width: `${proj.progress}%` }} />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
              {activeModal === 'kirimLuarKota' && (
                <div className="space-y-3">
                  {state.shipments.map((s) => (
                    <div key={s.id} className="p-3.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-sm">
                      <div className="flex justify-between items-center mb-2">
                        <span className="text-xs font-bold text-sky-700 dark:text-sky-300 bg-sky-50 dark:bg-sky-950/40 px-2.5 py-1 rounded-lg border border-sky-200">{s.destination}</span>
                        <span className="text-[11px] font-semibold text-slate-500">ETD: {s.etd}</span>
                      </div>
                      <div className="text-xs text-slate-700 dark:text-slate-200 font-semibold mb-1">Driver: {s.driver}</div>
                      <div className="text-[11px] text-slate-500 flex justify-between items-center">
                        <span>Manifest: {s.manifest}</span>
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${s.status === 'Ready Dispatched' ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'}`}>{s.status}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="p-4 border-t border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50">
              <button type="button" onClick={() => setActiveModal(null)} className="w-full py-2.5 bg-slate-800 hover:bg-slate-900 text-white font-semibold text-xs rounded-xl">Tutup Window</button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-[70] bg-slate-900 text-white px-4 py-2.5 rounded-2xl shadow-xl flex items-center gap-2 border border-slate-700 text-xs">
          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          <span>{toast}</span>
        </div>
      )}
    </section>
  );
}
