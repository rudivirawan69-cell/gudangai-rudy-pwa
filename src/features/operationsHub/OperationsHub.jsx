import { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarDays, Check, CheckCircle2, Loader2, Plus, RefreshCw, Trash2, Users, Truck, PackagePlus, FolderKanban, X } from 'lucide-react';
import { deleteOperationalActivity, listOperationalActivities, saveOperationalActivity } from '../../data/api';
import './operationsHub.css';

const CARD_META = {
  order: { title: 'Tambahan Order', eyebrow: 'ORDER & KONFIRMASI', subtitle: 'Catat order tambahan dan tenggat konfirmasi', icon: PackagePlus, tone: 'oh-order', action: 'Tambah order' },
  team: { title: 'Jadwal Off & Tugas', eyebrow: 'TIM & CHECKLIST', subtitle: 'Atur jadwal personel dan tugas harian', icon: Users, tone: 'oh-team', action: 'Tambah jadwal/tugas' },
  meeting: { title: 'Meeting & Project', eyebrow: 'AGENDA & PROJECT', subtitle: 'Pantau rapat, evaluasi, dan tindak lanjut', icon: FolderKanban, tone: 'oh-meeting', action: 'Tambah agenda' },
  logistics: { title: 'Kirim Luar Kota', eyebrow: 'LOGISTIK & ARMADA', subtitle: 'Jadwal armada dan pengiriman cold storage', icon: Truck, tone: 'oh-logistics', action: 'Tambah pengiriman' },
};
const todayKey = () => new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Jakarta',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const EMPTY_FORM = { id:'',category:'order',title:'',description:'',owner:'',date:todayKey(),time:'09:00',status:'open',checklist:[] };
const makeId = () => globalThis.crypto?.randomUUID?.() || 'ops-' + Date.now() + '-' + Math.random().toString(36).slice(2,8);
const fmtDate = value => { if(!value)return 'Tanggal belum ditentukan';const d=new Date(value+'T00:00:00');return Number.isNaN(d.getTime())?value:new Intl.DateTimeFormat('id-ID',{day:'2-digit',month:'short',year:'numeric'}).format(d); };

function ActivityModal({category,initial,onClose,onSave,onDelete,saving}) {
 const [form,setForm]=useState(()=>initial?{...initial,checklist:initial.checklist||[]}:{...EMPTY_FORM,id:makeId(),category});
 const [checkText,setCheckText]=useState('');
 const update=(key,value)=>setForm(old=>({...old,[key]:value}));
 const addChecklist=()=>{const value=checkText.trim();if(!value)return;setForm(old=>({...old,checklist:[...old.checklist,{id:makeId(),text:value,done:false}]}));setCheckText('');};
 const toggleChecklist=id=>setForm(old=>({...old,checklist:old.checklist.map(x=>x.id===id?{...x,done:!x.done}:x)}));
 const removeChecklist=id=>setForm(old=>({...old,checklist:old.checklist.filter(x=>x.id!==id)}));
 const meta=CARD_META[category];
 return <div className="oh-backdrop" role="presentation" onMouseDown={e=>{if(e.target===e.currentTarget)onClose();}}>
  <section className="oh-modal" role="dialog" aria-modal="true" aria-labelledby="oh-modal-title">
   <header className="oh-modal-head"><div><p className="oh-kicker">{meta.eyebrow}</p><h3 id="oh-modal-title">{form.id?'Edit':'Buat'} {meta.title}</h3></div><button type="button" className="oh-icon-btn" onClick={onClose} aria-label="Tutup"><X size={19}/></button></header>
   <form onSubmit={e=>{e.preventDefault();onSave(form);}} className="oh-form">
    <label>Judul aktivitas<input required maxLength={160} value={form.title} onChange={e=>update('title',e.target.value)} placeholder="Contoh: Konfirmasi tambahan order ayam fillet"/></label>
    <div className="oh-form-grid"><label>Tanggal<input type="date" value={form.date} onChange={e=>update('date',e.target.value)}/></label><label>Jam<input type="time" value={form.time} onChange={e=>update('time',e.target.value)}/></label></div>
    <label>Penanggung jawab<input maxLength={120} value={form.owner} onChange={e=>update('owner',e.target.value)} placeholder="Nama personel"/></label>
    <label>Catatan / detail<textarea rows={3} maxLength={1000} value={form.description} onChange={e=>update('description',e.target.value)} placeholder="Detail, lokasi, supplier, armada, atau agenda…"/></label>
    <div className="oh-checklist-box"><div className="oh-check-head"><strong>Checklist tugas</strong><span>{form.checklist.filter(x=>x.done).length}/{form.checklist.length} selesai</span></div>
     <div className="oh-add-check"><input value={checkText} onChange={e=>setCheckText(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();addChecklist();}}} placeholder="Tambah langkah kerja…"/><button type="button" onClick={addChecklist} aria-label="Tambah checklist"><Plus size={17}/></button></div>
     {form.checklist.length===0?<p className="oh-muted">Belum ada langkah checklist.</p>:<ul>{form.checklist.map(item=><li key={item.id}><label className={item.done?'is-done':''}><input type="checkbox" checked={!!item.done} onChange={()=>toggleChecklist(item.id)}/><span>{item.text}</span></label><button type="button" onClick={()=>removeChecklist(item.id)} aria-label="Hapus langkah"><Trash2 size={14}/></button></li>)}</ul>}
    </div>
    <label>Status<select value={form.status} onChange={e=>update('status',e.target.value)}><option value="open">Belum selesai</option><option value="done">Selesai</option></select></label>
    <p className="oh-calendar-note"><CalendarDays size={15}/> Simpan memperbarui tab Aktivitas Operasional dan Google Calendar. Event yang sama diperbarui, bukan digandakan.</p>
    <footer className="oh-modal-actions">{initial?.id&&<button type="button" className="oh-secondary" onClick={onDelete} disabled={saving}><Trash2 size={15}/>Hapus</button>}<button type="button" className="oh-secondary" onClick={onClose}>Batal</button><button type="submit" className="oh-primary" disabled={saving}>{saving?<><Loader2 className="oh-spin" size={16}/>Menyimpan…</>:<><Check size={16}/>Simpan aktivitas</>}</button></footer>
   </form>
  </section>
 </div>;
}
export default function OperationsHub() {
 const [items,setItems]=useState([]),[loading,setLoading]=useState(true),[saving,setSaving]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),[activeCategory,setActiveCategory]=useState(''),[editing,setEditing]=useState(null);
 const today=todayKey();
 const load=useCallback(async()=>{setLoading(true);setError('');try{setItems(await listOperationalActivities());}catch(e){setError(e?.message||'Tidak dapat memuat aktivitas');}finally{setLoading(false);}},[]);
 useEffect(()=>{void load();},[load]);
 const grouped=useMemo(()=>Object.fromEntries(Object.keys(CARD_META).map(key=>{const rows=items.filter(x=>x.category===key);return [key,{rows,pending:rows.filter(x=>x.status!=='done').length,today:rows.filter(x=>x.date===today&&x.status!=='done').length,next:rows.filter(x=>x.status!=='done').slice(0,2)}];})),[items,today]);
 const openNew=category=>{setEditing(null);setActiveCategory(category);};
 const openEdit=item=>{setActiveCategory(item.category);setEditing(item);};
 const save=async form=>{setSaving(true);setError('');setNotice('');try{const saved=await saveOperationalActivity(form);setNotice(saved?.calendarSynced?'Aktivitas tersimpan. Google Sheets dan Calendar diperbarui.':(saved?.calendarSkipped?'Aktivitas tersimpan di Google Sheets. Event Calendar tidak dibuat karena tanggal kosong.':'Aktivitas tersimpan di Google Sheets. Calendar belum tersinkron: '+(saved?.calendarError||'perlu otorisasi Google Calendar.')));setActiveCategory('');setEditing(null);await load();}catch(e){setError(e?.message||'Gagal menyimpan aktivitas');}finally{setSaving(false);}};
 const remove=async item=>{if(!window.confirm('Hapus aktivitas ini dan event Google Calendar terkait?'))return;setError('');setNotice('');try{await deleteOperationalActivity(item.id);setNotice('Aktivitas dan event terkait dihapus.');setActiveCategory('');setEditing(null);await load();}catch(e){setError(e?.message||'Gagal menghapus aktivitas');}};
 const calendarSearch=title=>'https://calendar.google.com/calendar/u/0/r/search?q='+encodeURIComponent(title);
 return <section className="oh-hub" aria-label="Pusat aktivitas operasional">
  <div className="oh-section-head"><div><p className="oh-kicker">OPERATIONS CONTROL CENTER</p><h2>Pusat Aktivitas Operasional</h2><p>Empat alur kerja tersambung ke spreadsheet dan kalender.</p></div><button type="button" className="oh-refresh" onClick={load} disabled={loading} aria-label="Muat ulang aktivitas"><RefreshCw size={16} className={loading?'oh-spin':''}/></button></div>
  {error&&<p className="oh-feedback oh-error" role="alert">{error}</p>}{notice&&<p className="oh-feedback oh-success" role="status">{notice}</p>}
  <div className="oh-grid">{Object.entries(CARD_META).map(([key,meta])=>{const data=grouped[key];const Icon=meta.icon;return <article className={'oh-card '+meta.tone} key={key}>
   <div className="oh-card-top"><span className="oh-card-icon"><Icon size={22}/></span><span className="oh-card-count">{data.pending} terbuka</span></div>
   <p className="oh-kicker">{meta.eyebrow}</p><h3>{meta.title}</h3><p className="oh-card-sub">{meta.subtitle}</p>
   <div className="oh-card-stats"><span><strong>{data.today}</strong><small>Perlu hari ini</small></span><span><strong>{data.rows.length}</strong><small>Total aktivitas</small></span></div>
   <div className="oh-card-next">{loading?<span>Memuat aktivitas…</span>:data.next.length?data.next.map(item=><button type="button" key={item.id} onClick={()=>openEdit(item)}><span>{item.title}</span><small>{fmtDate(item.date)} · {item.time||'—'}</small></button>):<span>Belum ada aktivitas terjadwal.</span>}</div>
   <div className="oh-card-actions"><button type="button" className="oh-card-add" onClick={()=>openNew(key)}><Plus size={16}/>{meta.action}</button><button type="button" className="oh-card-calendar" onClick={()=>window.open(calendarSearch(meta.title),'_blank','noopener,noreferrer')}><CalendarDays size={15}/>Calendar</button></div>
  </article>;})}</div>
  <p className="oh-sync-caption"><CheckCircle2 size={14}/> Aktivitas disimpan terpisah dari data stok dan transaksi gudang.</p>
  {(activeCategory||editing)&&<ActivityModal category={activeCategory} initial={editing} onClose={()=>{setActiveCategory('');setEditing(null);}} onSave={save} onDelete={()=>remove(editing)} saving={saving}/>}
 </section>;
}
