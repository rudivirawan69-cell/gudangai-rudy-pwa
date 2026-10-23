import { useState } from 'react';
import OperatorTasks from '../components/OperatorTasks';

export default function DashboardPage() {
  return (
    <div className="w-full max-w-lg mx-auto px-3 pt-4 pb-24 space-y-4">
      <div className="dashboard-header-card rounded-2xl bg-white border border-slate-200 shadow-sm px-4 py-4">
        <p className="text-[11px] font-bold uppercase tracking-wide text-cyan-700">GUDANG PUSAT</p>
        <h1 className="text-xl font-extrabold text-slate-900 mt-1">Dashboard Operasional</h1>
        <p className="text-[13px] text-slate-600 mt-1 leading-snug">
          Catatan tugas: konfirmasi PO · kedatangan barang · kirim luar kota
        </p>
        <OperatorTasks />
      </div>
      <div className="rounded-2xl bg-amber-50 border border-amber-200 px-4 py-3 text-[12px] text-amber-900 font-medium">
        Grafik analisa, status per divisi, dan Status PO sedang dipulihkan ke versi penuh.
        Modul catatan tugas operator sudah aktif (simpan lokal perangkat).
      </div>
    </div>
  );
}
