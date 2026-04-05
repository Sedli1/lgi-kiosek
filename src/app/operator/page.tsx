"use client";

import { useEffect, useState, useRef, type JSX } from "react";
import { buildRampSms } from "@/lib/sms-client";

// ── Types ──────────────────────────────────────────────────

interface SmsLog { id: number; type: string; phone: string; message: string; sentAt: string; }
interface Driver {
  id: number; num: number; name: string; phone: string; spz: string;
  firm: string; order: string | null; type: string; lang: string;
  status: string; ramp: string | null; rampTime: string | null;
  rampAssignedAt: string | null; doneAt: string | null; note: string | null; createdAt: string;
  smsLogs: SmsLog[];
}
interface Ramp { id: number; name: string; status: string; note: string | null; }
interface AuditLog { id: number; driverId: number | null; action: string; ramp: string | null; note: string | null; operatorName: string | null; createdAt: string; }
interface StatsData {
  perRamp: { ramp: string; count: number; avgMinutes: number | null }[];
  perFirm: { firm: string; count: number; avgMinutes: number | null }[];
  totalDone: number;
  rows: DriverRow[];
}
interface DriverRow {
  id: number; num: number; name: string; phone: string; spz: string;
  firm: string; order: string | null; type: string; status: string;
  ramp: string | null; rampTime: string | null; rampAssignedAt: string | null;
  doneAt: string | null; createdAt: string;
}
type StatsPeriod = "today" | "week" | "month" | "all";

// ── Constants ──────────────────────────────────────────────

const TYPE_LABELS: Record<string, string> = { vyklada: "Vykládka", naklada: "Nakládka", obe: "Vykl.+Nakl." };
const ACTION_LABELS: Record<string, string> = { created: "Registrace", ramp_assigned: "Rampa přidělena", done: "Dokončeno", note_added: "Poznámka" };
const PERIOD_LABELS: Record<StatsPeriod, string> = { today: "Dnes", week: "7 dní", month: "30 dní", all: "Vše" };

// ── Helpers ────────────────────────────────────────────────

function parseDate(s: string | null): Date {
  if (!s) return new Date(0);
  // SQLite CURRENT_TIMESTAMP: "YYYY-MM-DD HH:MM:SS" → treat as UTC
  const normalized = s.includes("T") ? s : s.replace(" ", "T") + "Z";
  return new Date(normalized);
}

function fmtElapsed(ms: number): string {
  if (ms < 0) ms = 0;
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function fmtDuration(mins: number | null) {
  if (mins === null) return "—";
  if (mins < 60) return `${mins} min`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
}

function nowTime() {
  return new Date().toLocaleTimeString("cs-CZ", { hour: "2-digit", minute: "2-digit" });
}

function periodToFrom(p: StatsPeriod): string | null {
  const now = new Date();
  if (p === "today") { const d = new Date(now); d.setHours(0,0,0,0); return d.toISOString(); }
  if (p === "week")  { const d = new Date(now); d.setDate(d.getDate()-7); return d.toISOString(); }
  if (p === "month") { const d = new Date(now); d.setDate(d.getDate()-30); return d.toISOString(); }
  return null;
}

function playChime() {
  try {
    const Ctx = window.AudioContext || (window as any).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    [[880,0,0.12],[1100,0.13,0.12],[1320,0.26,0.2]].forEach(([f,t,d]) => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.connect(g); g.connect(ctx.destination);
      o.frequency.value = f as number; o.type = "sine";
      g.gain.setValueAtTime(0.25, ctx.currentTime + (t as number));
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + (t as number) + (d as number));
      o.start(ctx.currentTime + (t as number));
      o.stop(ctx.currentTime + (t as number) + (d as number));
    });
  } catch {}
}

function exportCsv(rows: DriverRow[]) {
  const hdr = ["#","Jméno","Telefon","SPZ","Firma","Typ","Rampa","Čas příjezdu","Přiděleno","Dokončeno","Min na rampě"];
  const lines = rows.map(r => {
    const mins = r.rampAssignedAt && r.doneAt
      ? Math.round((parseDate(r.doneAt).getTime() - parseDate(r.rampAssignedAt).getTime()) / 60000) : "";
    return [r.num,r.name,r.phone,r.spz,r.firm,r.type,r.ramp??"",r.rampTime??"",
      r.rampAssignedAt?new Date(r.rampAssignedAt).toLocaleString("cs-CZ"):"",
      r.doneAt?new Date(r.doneAt).toLocaleString("cs-CZ"):"",mins]
      .map(v=>`"${String(v).replace(/"/g,'""')}"`).join(",");
  });
  const blob = new Blob(["\uFEFF"+[hdr.join(","),...lines].join("\n")], {type:"text/csv;charset=utf-8;"});
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob);
  a.download = `lgi-${new Date().toISOString().slice(0,10)}.csv`; a.click();
}

// ── Live elapsed badge ─────────────────────────────────────

function LiveElapsed({ createdAt, status }: { createdAt: string; status: string }) {
  const [ms, setMs] = useState(() => Date.now() - parseDate(createdAt).getTime());
  useEffect(() => {
    const t = setInterval(() => setMs(Date.now() - parseDate(createdAt).getTime()), 1000);
    return () => clearInterval(t);
  }, [createdAt]);
  const mins = ms / 60000;
  const color = status === "ramp"
    ? "text-green-700 bg-green-100"
    : mins < 15 ? "text-gray-500 bg-gray-100"
    : mins < 30 ? "text-amber-700 bg-amber-100"
    : "text-red-700 bg-red-100 animate-pulse";
  const label = status === "ramp" ? "🔧 rampa" : "⏱ čeká";
  return (
    <span className={`text-xs font-mono font-semibold px-2 py-0.5 rounded ${color}`} title="Čas od registrace">
      {label} {fmtElapsed(ms)}
    </span>
  );
}

// ── Main component ─────────────────────────────────────────

export default function OperatorPage() {
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [rampRows, setRampRows] = useState<Ramp[]>([]);
  const [auditData, setAuditData] = useState<AuditLog[]>([]);
  const [tab, setTab] = useState<"active" | "history" | "stats">("active");
  const [password, setPassword] = useState(() =>
    typeof window !== "undefined" ? (new URLSearchParams(window.location.search).get("pass") ?? "") : ""
  );
  const [operatorName, setOperatorName] = useState(() =>
    typeof window !== "undefined" ? (localStorage.getItem("operatorName") ?? "") : ""
  );
  const [authed, setAuthed] = useState(false);
  const [authError, setAuthError] = useState(false);
  const [rampModal, setRampModal] = useState<Driver | null>(null);
  const [selectedRamp, setSelectedRamp] = useState("1");
  const [selectedTime, setSelectedTime] = useState(nowTime());
  const [rampConflict, setRampConflict] = useState<Driver | null>(null);
  const [sending, setSending] = useState(false);
  const [connected, setConnected] = useState(false);
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState("all");
  const [showResetDialog, setShowResetDialog] = useState(false);
  const [stats, setStats] = useState<StatsData | null>(null);
  const [statsPeriod, setStatsPeriod] = useState<StatsPeriod>("today");
  const prevDriverIds = useRef<Set<number>>(new Set());
  const notifGranted = useRef(false);
  const [editModal, setEditModal] = useState<Driver | null>(null);
  const [editForm, setEditForm] = useState({ name: "", spz: "", firm: "", phone: "", type: "", order: "" });
  const [editSending, setEditSending] = useState(false);
  const [addModal, setAddModal] = useState(false);
  const [addForm, setAddForm] = useState({ name: "", phone: "", spz: "", firm: "", order: "", type: "vyklada", lang: "cs" });
  const [addSending, setAddSending] = useState(false);
  const [confirmDoneId, setConfirmDoneId] = useState<number | null>(null);
  const [noteModal, setNoteModal] = useState<Driver | null>(null);
  const [noteText, setNoteText] = useState("");

  // Request notification permission
  useEffect(() => {
    if (!authed) return;
    if ("Notification" in window) {
      if (Notification.permission === "default") Notification.requestPermission().then(p => { notifGranted.current = p === "granted"; });
      else notifGranted.current = Notification.permission === "granted";
    }
  }, [authed]);

  // SSE
  useEffect(() => {
    if (!authed) return;
    let es: EventSource | null = null;
    const connect = () => {
      es = new EventSource(`/api/stream?pass=${encodeURIComponent(password)}`);
      es.onopen = () => setConnected(true);
      es.onmessage = (e) => {
        const data = JSON.parse(e.data) as { drivers: Driver[]; ramps: Ramp[]; auditLogs: AuditLog[] };
        // Detect new drivers → chime + browser notification + tab blink
        let hasNew = false;
        for (const d of data.drivers) {
          if (!prevDriverIds.current.has(d.id) && prevDriverIds.current.size > 0) {
            hasNew = true;
            playChime();
            if (notifGranted.current) new Notification("Nový řidič", { body: `${d.name} · ${d.spz} · ${d.firm}`, icon: "/icon-192.png" });
          }
        }
        if (hasNew) {
          let on = true;
          const blink = setInterval(() => { document.title = on ? "🔔 Nový řidič!" : "LGI Operátor"; on = !on; }, 700);
          setTimeout(() => { clearInterval(blink); document.title = "LGI Operátor"; }, 10000);
        }
        prevDriverIds.current = new Set(data.drivers.map(d => d.id));
        setDrivers(data.drivers.map(d => ({ ...d, smsLogs: (d as any).smsLogs ?? [] })));
        setRampRows(data.ramps);
        setAuditData(data.auditLogs);
      };
      es.onerror = () => { setConnected(false); es?.close(); setTimeout(connect, 3000); };
    };
    connect();
    return () => { es?.close(); };
  }, [authed, password]);

  // Load stats
  useEffect(() => {
    if (tab !== "stats" || !authed) return;
    setStats(null);
    const from = periodToFrom(statsPeriod);
    const qs = from ? `&from=${encodeURIComponent(from)}` : "";
    fetch(`/api/stats?pass=${encodeURIComponent(password)}${qs}`, { headers: authHeaders() })
      .then(r => r.json()).then(d => setStats(d as StatsData)).catch(() => {});
  }, [tab, authed, password, statsPeriod]);

  // Auto-login from URL
  useEffect(() => {
    const p = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("pass") : null;
    if (p && p.length >= 3 && !authed) setAuthed(true);
  }, [authed]);

  // Ramp conflict
  useEffect(() => {
    if (!rampModal) return;
    setRampConflict(drivers.find(d => d.status === "ramp" && d.ramp === selectedRamp && d.id !== rampModal.id) ?? null);
  }, [selectedRamp, rampModal, drivers]);

  function authHeaders(extra?: Record<string, string>): Record<string, string> {
    return { "x-operator-pass": password, ...(operatorName ? { "x-operator-name": operatorName } : {}), ...extra };
  }

  function handleAuth(e: React.FormEvent) {
    e.preventDefault();
    if (password.length >= 3) {
      if (operatorName) localStorage.setItem("operatorName", operatorName);
      setAuthed(true); setAuthError(false);
    } else setAuthError(true);
  }

  async function assignRamp() {
    if (!rampModal) return;
    setSending(true);
    await fetch(`/api/drivers/${rampModal.id}/ramp?pass=${encodeURIComponent(password)}`, {
      method: "PATCH", headers: authHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ ramp: selectedRamp, rampTime: selectedTime }),
    });
    setSending(false); setRampModal(null); setRampConflict(null);
  }

  async function markDone(id: number) {
    await fetch(`/api/drivers/${id}/done?pass=${encodeURIComponent(password)}`, { method: "PATCH", headers: authHeaders() });
  }

  async function toggleRampRepair(ramp: Ramp) {
    const newStatus = ramp.status === "repair" ? "available" : "repair";
    await fetch(`/api/ramps?pass=${encodeURIComponent(password)}`, {
      method: "PATCH", headers: authHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ id: ramp.id, status: newStatus }),
    });
  }

  async function resetData() {
    await fetch(`/api/reset?pass=${encodeURIComponent(password)}&confirm=yes`, { method: "DELETE", headers: authHeaders() });
    setShowResetDialog(false);
  }

  async function saveEdit() {
    if (!editModal) return;
    setEditSending(true);
    await fetch(`/api/drivers/${editModal.id}?pass=${encodeURIComponent(password)}`, {
      method: "PATCH", headers: authHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify(editForm),
    });
    setEditSending(false);
    setEditModal(null);
  }

  async function addDriver() {
    if (!addForm.name || !addForm.phone || !addForm.spz || !addForm.firm) return;
    setAddSending(true);
    const res = await fetch(`/api/drivers?pass=${encodeURIComponent(password)}`, {
      method: "POST", headers: authHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify(addForm),
    });
    setAddSending(false);
    if (res.ok) { setAddModal(false); setAddForm({ name: "", phone: "", spz: "", firm: "", order: "", type: "vyklada", lang: "cs" }); }
  }

  async function saveNote() {
    if (!noteModal) return;
    await fetch(`/api/drivers/${noteModal.id}?pass=${encodeURIComponent(password)}`, {
      method: "PATCH", headers: authHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ note: noteText }),
    });
    setNoteModal(null);
  }

  // ── Login screen ──────────────────────────────────────────

  if (!authed) {
    return (
      <div className="min-h-screen bg-[#065A82] flex items-center justify-center">
        <form onSubmit={handleAuth} className="bg-white rounded-2xl p-8 w-80 shadow-xl">
          <h1 className="text-xl font-bold text-gray-900 mb-1">Operátorský panel</h1>
          <p className="text-gray-500 text-sm mb-6">Zadejte heslo pro přístup</p>
          <input type="text" value={operatorName} onChange={e => setOperatorName(e.target.value)} placeholder="Vaše jméno (nepovinné)"
            className="w-full border border-gray-300 rounded-lg px-4 py-3 mb-3 focus:outline-none focus:ring-2 focus:ring-[#065A82]" />
          <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Heslo"
            className="w-full border border-gray-300 rounded-lg px-4 py-3 mb-3 focus:outline-none focus:ring-2 focus:ring-[#065A82]" />
          {authError && <p className="text-red-500 text-sm mb-3">Nesprávné heslo</p>}
          <button type="submit" className="w-full bg-[#065A82] text-white font-semibold py-3 rounded-xl hover:bg-[#054a6b]">Přihlásit</button>
        </form>
      </div>
    );
  }

  // ── Data ──────────────────────────────────────────────────

  const active = drivers.filter(d => d.status !== "done");
  const history = drivers.filter(d => d.status === "done");
  const waiting = active.filter(d => d.status === "wait").length;
  const onRamp = active.filter(d => d.status === "ramp").length;
  const driverOnRamp = new Map(drivers.filter(d => d.status === "ramp" && d.ramp).map(d => [d.ramp!, d]));
  const occupiedRampNames = new Set(driverOnRamp.keys());

  const filteredActive = active.filter(d => {
    if (filterType !== "all" && d.type !== filterType) return false;
    if (search) {
      const q = search.toLowerCase();
      return d.name.toLowerCase().includes(q) || d.spz.toLowerCase().includes(q) || d.firm.toLowerCase().includes(q);
    }
    return true;
  });

  const filteredHistory = history.filter(d => {
    if (search) {
      const q = search.toLowerCase();
      return d.name.toLowerCase().includes(q) || d.spz.toLowerCase().includes(q) || d.firm.toLowerCase().includes(q);
    }
    return true;
  });

  // ── Main layout ───────────────────────────────────────────

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <header className="bg-[#065A82] text-white px-5 py-3 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-3">
          <span className="font-bold text-lg">LGI Operátor</span>
          <span className={`w-2 h-2 rounded-full flex-shrink-0 ${connected ? "bg-green-400" : "bg-red-400"}`} title={connected ? "Živě" : "Odpojeno"} />
          {/* Inline stats */}
          <div className="flex gap-3 ml-2 text-sm">
            <span className="text-amber-300 font-semibold">{waiting} čeká</span>
            <span className="text-green-300 font-semibold">{onRamp} na rampě</span>
            <span className="text-blue-200">{history.length} hotovo</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => { setAddForm({ name: "", phone: "", spz: "", firm: "", order: "", type: "vyklada", lang: "cs" }); setAddModal(true); }}
            className="text-xs bg-white/20 hover:bg-white/30 px-2 py-1 rounded text-white font-bold" title="Přidat řidiče ručně">
            + Přidat
          </button>
          <button onClick={() => setShowResetDialog(true)} className="text-xs bg-red-600/70 hover:bg-red-600 px-2 py-1 rounded text-white" title="Smazat všechna data (testování)">
            🗑 Reset
          </button>
          <button onClick={() => setAuthed(false)} className="text-blue-200 text-sm hover:text-white">Odhlásit</button>
        </div>
      </header>

      {/* Two-column layout */}
      <div className="flex flex-1 overflow-hidden">

        {/* LEFT: Main content */}
        <div className="flex-1 flex flex-col overflow-y-auto p-4 gap-4">

          {/* Search + filter bar */}
          <div className="flex gap-2 flex-wrap">
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Hledat jméno, SPZ, firma…"
              className="flex-1 min-w-[180px] border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#065A82] bg-white"
            />
            <div className="flex gap-1">
              {([["all","Vše"],["vyklada","Vykládka"],["naklada","Nakládka"],["obe","Obojí"]] as const).map(([val,label]) => (
                <button key={val} onClick={() => setFilterType(val)}
                  className={`px-3 py-2 rounded-lg text-sm border transition whitespace-nowrap ${filterType===val?"bg-[#065A82] text-white border-[#065A82]":"bg-white text-gray-600 border-gray-200 hover:bg-gray-50"}`}>
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Tabs */}
          <div className="bg-white rounded-xl border border-gray-200 flex-1 overflow-hidden flex flex-col">
            <div className="flex border-b border-gray-100">
              {(["active","history","stats"] as const).map(t => (
                <button key={t} onClick={() => setTab(t)}
                  className={`flex-1 py-2.5 text-sm font-medium transition ${tab===t ? "text-[#065A82] border-b-2 border-[#065A82] bg-blue-50" : "text-gray-500 hover:text-gray-700"}`}>
                  {t==="active" && `Aktivní (${active.length})`}
                  {t==="history" && `Historie (${history.length})`}
                  {t==="stats" && "Statistiky"}
                </button>
              ))}
            </div>

            {/* Active drivers */}
            {tab === "active" && (() => {
              const sorted = [...filteredActive].sort((a, b) => parseDate(a.createdAt).getTime() - parseDate(b.createdAt).getTime());
              const waitSorted = sorted.filter(d => d.status === "wait");
              const rampSorted = sorted.filter(d => d.status === "ramp");

              const renderRow = (d: Driver) => (
                <div key={d.id} className="px-4 py-3 flex items-center gap-3 hover:bg-gray-50 flex-wrap">
                  <div className="w-9 h-9 rounded-full bg-[#065A82] text-white flex items-center justify-center font-bold text-sm flex-shrink-0">
                    {d.num}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-gray-900 text-sm">{d.name}</div>
                    <div className="text-xs text-gray-500 truncate">
                      {d.spz} · {d.firm} · {TYPE_LABELS[d.type]??d.type}
                      {d.order && ` · #${d.order}`}
                    </div>
                    {d.note && (
                      <div className="text-xs text-amber-700 bg-amber-50 rounded px-1.5 py-0.5 mt-0.5 inline-block max-w-full truncate" title={d.note}>
                        📝 {d.note}
                      </div>
                    )}
                  </div>
                  <LiveElapsed createdAt={d.createdAt} status={d.status} />
                  <StatusBadge status={d.status} ramp={d.ramp} rampTime={d.rampTime} />
                  <button onClick={() => { setNoteModal(d); setNoteText(d.note ?? ""); }}
                    className="text-gray-400 hover:text-amber-600 text-xs px-2 py-1 rounded hover:bg-amber-50 flex-shrink-0" title="Interní poznámka">
                    📝
                  </button>
                  <button onClick={() => { setEditModal(d); setEditForm({ name: d.name, spz: d.spz, firm: d.firm, phone: d.phone, type: d.type, order: d.order ?? "" }); }}
                    className="text-gray-400 hover:text-[#065A82] text-xs px-2 py-1 rounded hover:bg-gray-100 flex-shrink-0" title="Upravit záznam">
                    ✏
                  </button>
                  {d.status === "wait" && (
                    <button onClick={() => { setRampModal(d); setSelectedRamp("1"); setSelectedTime(nowTime()); }}
                      className="bg-[#065A82] text-white text-xs px-3 py-1.5 rounded-lg hover:bg-[#054a6b] flex-shrink-0">
                      Přidělit rampu
                    </button>
                  )}
                  {d.status === "ramp" && confirmDoneId !== d.id && (
                    <button onClick={() => setConfirmDoneId(d.id)}
                      className="bg-green-600 text-white text-xs px-3 py-1.5 rounded-lg hover:bg-green-700 flex-shrink-0">
                      Hotovo ✓
                    </button>
                  )}
                  {d.status === "ramp" && confirmDoneId === d.id && (
                    <div className="flex gap-1 flex-shrink-0">
                      <button onClick={() => { markDone(d.id); setConfirmDoneId(null); }}
                        className="bg-green-700 text-white text-xs px-2 py-1.5 rounded-lg font-semibold">
                        Potvrdit
                      </button>
                      <button onClick={() => setConfirmDoneId(null)}
                        className="bg-gray-200 text-gray-600 text-xs px-2 py-1.5 rounded-lg">
                        Zrušit
                      </button>
                    </div>
                  )}
                </div>
              );

              if (filteredActive.length === 0) return (
                <div className="flex-1 flex items-center justify-center text-gray-400 text-sm py-12">
                  {search || filterType!=="all" ? "Žádné výsledky" : "Žádní aktivní řidiči"}
                </div>
              );

              return (
                <div className="overflow-y-auto divide-y divide-gray-100">
                  {waitSorted.length > 0 && (
                    <>
                      <div className="px-4 py-1.5 bg-amber-50 flex items-center gap-2 sticky top-0">
                        <span className="text-xs font-semibold text-amber-700 uppercase tracking-wide">Čeká ({waitSorted.length})</span>
                      </div>
                      {waitSorted.map(renderRow)}
                    </>
                  )}
                  {rampSorted.length > 0 && (
                    <>
                      <div className="px-4 py-1.5 bg-green-50 flex items-center gap-2 sticky top-0">
                        <span className="text-xs font-semibold text-green-700 uppercase tracking-wide">Na rampě ({rampSorted.length})</span>
                      </div>
                      {rampSorted.map(renderRow)}
                    </>
                  )}
                </div>
              );
            })()}

            {/* History */}
            {tab === "history" && (
              filteredHistory.length === 0
                ? <div className="flex-1 flex items-center justify-center text-gray-400 text-sm py-12">Žádná historie</div>
                : <div className="divide-y divide-gray-100 overflow-y-auto">
                    {filteredHistory.map(d => {
                      const mins = d.rampAssignedAt && d.doneAt
                        ? Math.round((parseDate(d.doneAt).getTime() - parseDate(d.rampAssignedAt).getTime()) / 60000) : null;
                      return (
                        <div key={d.id} className="px-4 py-3 flex items-center gap-3 opacity-70">
                          <div className="w-9 h-9 rounded-full bg-gray-300 text-gray-600 flex items-center justify-center font-bold text-sm flex-shrink-0">
                            {d.num}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium text-gray-700">{d.name}</div>
                            <div className="text-xs text-gray-400 truncate">
                              {d.spz} · {d.firm} · {TYPE_LABELS[d.type]??d.type}
                              {d.ramp && ` · Rampa ${d.ramp}`}
                            </div>
                          </div>
                          <div className="text-right text-xs text-gray-400 flex-shrink-0 space-y-0.5">
                            <div>{parseDate(d.createdAt).toLocaleTimeString("cs-CZ",{hour:"2-digit",minute:"2-digit"})}</div>
                            {mins !== null && <div className="text-[#065A82] font-medium">{fmtDuration(mins)}</div>}
                          </div>
                          <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">Hotovo</span>
                        </div>
                      );
                    })}
                    {/* Audit inline at bottom */}
                    {auditData.length > 0 && (
                      <details className="px-4 py-2">
                        <summary className="text-xs text-gray-400 cursor-pointer hover:text-gray-600">Audit log ({auditData.length})</summary>
                        <div className="mt-2 space-y-1">
                          {auditData.slice(0,30).map(a => {
                            const drv = drivers.find(d => d.id === a.driverId);
                            return (
                              <div key={a.id} className="flex items-center gap-2 text-xs text-gray-500 flex-wrap">
                                <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${a.action==="created"?"bg-blue-50 text-blue-600":a.action==="ramp_assigned"?"bg-green-50 text-green-600":a.action==="note_added"?"bg-amber-50 text-amber-600":"bg-gray-100 text-gray-500"}`}>
                                  {ACTION_LABELS[a.action]??a.action}
                                </span>
                                {drv && <span>{drv.name} · {drv.spz}</span>}
                                {a.ramp && <span>R{a.ramp}</span>}
                                {a.note && a.action==="note_added" && <span className="italic truncate max-w-[120px]">"{a.note}"</span>}
                                {a.operatorName && <span className="text-[#065A82] font-medium">{a.operatorName}</span>}
                                <span className="ml-auto">{parseDate(a.createdAt).toLocaleTimeString("cs-CZ",{hour:"2-digit",minute:"2-digit"})}</span>
                              </div>
                            );
                          })}
                        </div>
                      </details>
                    )}
                  </div>
            )}

            {/* Stats */}
            {tab === "stats" && (
              <div className="p-4 overflow-y-auto">
                <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
                  <div className="flex gap-1">
                    {(["today","week","month","all"] as StatsPeriod[]).map(p => (
                      <button key={p} onClick={() => setStatsPeriod(p)}
                        className={`px-3 py-1 rounded-lg text-xs font-medium transition ${statsPeriod===p?"bg-[#065A82] text-white":"bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>
                        {PERIOD_LABELS[p]}
                      </button>
                    ))}
                  </div>
                  {stats && stats.rows.length > 0 && (
                    <button onClick={() => exportCsv(stats.rows)}
                      className="flex items-center gap-1 px-3 py-1 rounded-lg text-xs font-medium bg-green-600 text-white hover:bg-green-700">
                      ↓ CSV ({stats.rows.length})
                    </button>
                  )}
                </div>
                {!stats ? (
                  <p className="text-sm text-gray-400 text-center py-8">Načítám…</p>
                ) : (
                  <div className="space-y-5">
                    <p className="text-xs text-gray-500">Celkem dokončeno: <strong>{stats.totalDone}</strong></p>
                    <div>
                      <h3 className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2">Průměr na rampě</h3>
                      {stats.perRamp.length === 0 ? <p className="text-xs text-gray-400">Žádná data</p> : (() => {
                        const maxCount = Math.max(...stats.perRamp.map(r => r.count), 1);
                        return (
                          <div className="space-y-1.5">
                            {stats.perRamp.map(r => (
                              <div key={r.ramp} className="flex items-center gap-2">
                                <span className="text-xs font-bold text-[#065A82] w-6 text-right flex-shrink-0">R{r.ramp}</span>
                                <div className="flex-1 bg-gray-100 rounded-full h-5 overflow-hidden">
                                  <div className="h-5 rounded-full bg-[#065A82]/80 flex items-center px-2 transition-all"
                                    style={{ width: `${Math.max((r.count / maxCount) * 100, 4)}%` }}>
                                    {r.count > 0 && <span className="text-[10px] text-white font-semibold whitespace-nowrap">{r.count}×</span>}
                                  </div>
                                </div>
                                <span className="text-xs text-gray-500 w-14 text-right flex-shrink-0">ø {fmtDuration(r.avgMinutes)}</span>
                              </div>
                            ))}
                          </div>
                        );
                      })()}
                    </div>
                    <div>
                      <h3 className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2">Top firmy</h3>
                      {stats.perFirm.length === 0 ? <p className="text-xs text-gray-400">Žádná data</p> : (() => {
                        const maxCount = Math.max(...stats.perFirm.map(f => f.count), 1);
                        return (
                          <div className="space-y-1.5">
                            {stats.perFirm.map(f => (
                              <div key={f.firm} className="flex items-center gap-2">
                                <span className="text-xs text-gray-700 w-28 truncate flex-shrink-0">{f.firm}</span>
                                <div className="flex-1 bg-gray-100 rounded-full h-5 overflow-hidden">
                                  <div className="h-5 rounded-full bg-[#1D9E75]/80 flex items-center px-2 transition-all"
                                    style={{ width: `${Math.max((f.count / maxCount) * 100, 4)}%` }}>
                                    {f.count > 0 && <span className="text-[10px] text-white font-semibold whitespace-nowrap">{f.count}×</span>}
                                  </div>
                                </div>
                                <span className="text-xs text-gray-500 w-14 text-right flex-shrink-0">ø {fmtDuration(f.avgMinutes)}</span>
                              </div>
                            ))}
                          </div>
                        );
                      })()}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* RIGHT: Sidebar */}
        <div className="w-56 flex-shrink-0 border-l border-gray-200 bg-white overflow-y-auto p-4 space-y-4 hidden md:flex md:flex-col">
          {/* Ramp grid */}
          <div>
            <div className="flex items-center gap-1.5 mb-2">
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Rampy</h3>
              <span className="w-4 h-4 rounded-full bg-gray-200 text-gray-500 text-[10px] font-bold flex items-center justify-center cursor-help flex-shrink-0"
                title="Kliknutím na rampu ji označíte jako V opravě / přepnete zpět na Volnou.">?</span>
            </div>
            <div className="grid grid-cols-5 gap-1.5">
              {rampRows.map(r => {
                const driver = driverOnRamp.get(r.name);
                const isOccupied = occupiedRampNames.has(r.name);
                const isRepair = r.status === "repair";
                return (
                  <button key={r.id} title={driver?`${driver.name} · ${driver.spz}`:isRepair?`R${r.name}: Oprava`:`R${r.name}: Volná`}
                    onClick={() => toggleRampRepair(r)}
                    className={`relative flex flex-col items-center justify-center h-11 rounded-lg font-bold text-xs transition ${
                      isOccupied ? "bg-red-100 text-red-700 border border-red-300"
                      : isRepair ? "bg-gray-100 text-gray-400 border border-gray-200"
                      : "bg-green-50 text-green-700 border border-green-200 hover:bg-green-100"}`}>
                    {r.name}
                    {isOccupied && <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-red-500 rounded-full"/>}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Legend */}
          <div className="text-xs text-gray-400 space-y-1">
            <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-green-400 inline-block"/>Volná</div>
            <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-red-400 inline-block"/>Obsazená</div>
            <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-gray-400 inline-block"/>Oprava</div>
          </div>

          {/* Timer legend */}
          <div className="border-t border-gray-100 pt-3 text-xs text-gray-400 space-y-1">
            <div className="font-medium text-gray-600 mb-1">Čekací čas</div>
            <div className="flex items-center gap-1.5"><span className="w-8 h-4 rounded bg-gray-100 inline-block"/>&lt; 15 min</div>
            <div className="flex items-center gap-1.5"><span className="w-8 h-4 rounded bg-amber-100 inline-block"/>15–30 min</div>
            <div className="flex items-center gap-1.5"><span className="w-8 h-4 rounded bg-red-100 inline-block"/>&gt; 30 min</div>
          </div>
        </div>
      </div>

      {/* Note modal */}
      {noteModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
            <h3 className="text-lg font-bold text-gray-900 mb-1">Interní poznámka</h3>
            <p className="text-gray-500 text-sm mb-4">{noteModal.name} · {noteModal.spz} — pouze pro operátory, neposílá se řidiči</p>
            <textarea value={noteText} onChange={e => setNoteText(e.target.value)} rows={3}
              placeholder="např. čeká na nakládku ze skladu B…"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 resize-none" />
            <div className="flex gap-3 mt-4">
              <button onClick={() => setNoteModal(null)} className="flex-1 border border-gray-300 text-gray-700 py-2.5 rounded-xl font-medium hover:bg-gray-50">Zrušit</button>
              {noteModal.note && (
                <button onClick={() => { setNoteText(""); saveNote(); }}
                  className="px-4 border border-red-200 text-red-500 py-2.5 rounded-xl font-medium hover:bg-red-50">Smazat</button>
              )}
              <button onClick={saveNote} className="flex-1 bg-amber-500 text-white py-2.5 rounded-xl font-medium hover:bg-amber-600">Uložit</button>
            </div>
          </div>
        </div>
      )}

      {/* Edit driver modal */}
      {editModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
            <h3 className="text-lg font-bold text-gray-900 mb-4">Upravit záznam #{editModal.num}</h3>
            <div className="space-y-3">
              {([["name","Jméno"],["spz","SPZ"],["firm","Firma"],["phone","Telefon"],["order","Zakázka"]] as const).map(([k,label]) => (
                <div key={k}>
                  <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
                  <input value={editForm[k]} onChange={e => setEditForm(f => ({ ...f, [k]: k === "spz" ? e.target.value.toUpperCase() : e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#065A82]"/>
                </div>
              ))}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Typ</label>
                <select value={editForm.type} onChange={e => setEditForm(f => ({ ...f, type: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#065A82]">
                  <option value="vyklada">Vykládka</option>
                  <option value="naklada">Nakládka</option>
                  <option value="obe">Vykl.+Nakl.</option>
                </select>
              </div>
            </div>
            <div className="flex gap-3 mt-5">
              <button onClick={() => setEditModal(null)} className="flex-1 border border-gray-300 text-gray-700 py-2.5 rounded-xl font-medium hover:bg-gray-50">Zrušit</button>
              <button onClick={saveEdit} disabled={editSending} className="flex-1 bg-[#065A82] text-white py-2.5 rounded-xl font-medium hover:bg-[#054a6b] disabled:opacity-60">
                {editSending ? "Ukládám…" : "Uložit"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add driver modal */}
      {addModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
            <h3 className="text-lg font-bold text-gray-900 mb-4">Přidat řidiče ručně</h3>
            <div className="space-y-3">
              {([["name","Jméno *"],["spz","SPZ *"],["firm","Firma *"],["phone","Telefon *"],["order","Zakázka"]] as const).map(([k,label]) => (
                <div key={k}>
                  <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
                  <input value={addForm[k as keyof typeof addForm]} onChange={e => setAddForm(f => ({ ...f, [k]: k === "spz" ? e.target.value.toUpperCase() : e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#065A82]"/>
                </div>
              ))}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Typ</label>
                  <select value={addForm.type} onChange={e => setAddForm(f => ({ ...f, type: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#065A82]">
                    <option value="vyklada">Vykládka</option>
                    <option value="naklada">Nakládka</option>
                    <option value="obe">Vykl.+Nakl.</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Jazyk</label>
                  <select value={addForm.lang} onChange={e => setAddForm(f => ({ ...f, lang: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#065A82]">
                    <option value="cs">CS</option>
                    <option value="sk">SK</option>
                    <option value="pl">PL</option>
                    <option value="de">DE</option>
                  </select>
                </div>
              </div>
            </div>
            <div className="flex gap-3 mt-5">
              <button onClick={() => setAddModal(false)} className="flex-1 border border-gray-300 text-gray-700 py-2.5 rounded-xl font-medium hover:bg-gray-50">Zrušit</button>
              <button onClick={addDriver} disabled={addSending || !addForm.name || !addForm.phone || !addForm.spz || !addForm.firm}
                className="flex-1 bg-[#065A82] text-white py-2.5 rounded-xl font-medium hover:bg-[#054a6b] disabled:opacity-60">
                {addSending ? "Přidávám…" : "Přidat"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reset confirmation dialog */}
      {showResetDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
            <h3 className="text-lg font-bold text-gray-900 mb-2">Smazat všechna data?</h3>
            <p className="text-gray-500 text-sm mb-6">Tato akce je nevratná. Budou smazáni všichni řidiči, SMS logy a audit záznamy. Používejte pouze pro testování.</p>
            <div className="flex gap-3">
              <button onClick={() => setShowResetDialog(false)}
                className="flex-1 border border-gray-300 text-gray-700 py-2.5 rounded-xl font-medium hover:bg-gray-50">
                Zrušit
              </button>
              <button onClick={resetData}
                className="flex-1 bg-red-600 text-white py-2.5 rounded-xl font-medium hover:bg-red-700">
                Smazat vše
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Ramp assignment modal */}
      {rampModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
            <h3 className="text-lg font-bold mb-1">Přidělit rampu</h3>
            <p className="text-gray-500 text-sm mb-4">{rampModal.name} · {rampModal.spz} · {TYPE_LABELS[rampModal.type]??rampModal.type}</p>

            <div className="grid grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1.5">Číslo rampy</label>
                <div className="flex gap-1.5 flex-wrap">
                  {rampRows.map(r => {
                    const occ = occupiedRampNames.has(r.name) && driverOnRamp.get(r.name)?.id !== rampModal.id;
                    const rep = r.status === "repair";
                    return (
                      <button key={r.name} onClick={() => setSelectedRamp(r.name)}
                        className={`w-9 h-9 rounded-lg font-bold text-sm transition relative ${
                          selectedRamp===r.name ? "bg-[#065A82] text-white ring-2 ring-[#065A82] ring-offset-1"
                          : rep ? "bg-gray-100 text-gray-300"
                          : occ ? "bg-red-100 text-red-600 border border-red-300"
                          : "bg-gray-100 text-gray-700 hover:bg-gray-200"}`}>
                        {r.name}
                        {occ && !rep && <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 bg-red-500 rounded-full"/>}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1.5">Čas příjezdu</label>
                <input type="time" value={selectedTime} onChange={e => setSelectedTime(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-base focus:outline-none focus:ring-2 focus:ring-[#065A82]"/>
              </div>
            </div>

            {rampConflict && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4 text-sm text-red-700">
                ⚠ Rampa {selectedRamp} obsazena: {rampConflict.name} · {rampConflict.spz} od {rampConflict.rampTime}
              </div>
            )}

            <div className="bg-gray-50 rounded-lg p-3 mb-4 text-sm text-gray-700">
              {buildRampSms(rampModal.lang as "cs"|"sk"|"pl"|"de", rampModal.name, selectedRamp, selectedTime)}
            </div>

            <div className="flex gap-3">
              <button onClick={() => { setRampModal(null); setRampConflict(null); }}
                className="flex-1 border border-gray-300 text-gray-700 py-2.5 rounded-xl font-medium hover:bg-gray-50">
                Zrušit
              </button>
              <button onClick={assignRamp} disabled={sending}
                className={`flex-1 text-white py-2.5 rounded-xl font-medium disabled:opacity-60 ${rampConflict?"bg-orange-500 hover:bg-orange-600":"bg-[#1D9E75] hover:bg-[#178a64]"}`}>
                {sending ? "Odesílám…" : rampConflict ? "Přesto odeslat ⚠" : "Odeslat SMS"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status, ramp, rampTime }: { status: string; ramp: string | null; rampTime: string | null }) {
  const styles: Record<string, string> = { wait: "bg-amber-100 text-amber-700", ramp: "bg-green-100 text-green-700", done: "bg-gray-100 text-gray-500" };
  const labels: Record<string, string> = { wait: "Čeká", ramp: "Na rampě", done: "Hotovo" };
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full font-medium whitespace-nowrap ${styles[status]??""}`}>
      {status === "ramp" && ramp ? `R${ramp}${rampTime ? " · "+rampTime : ""}` : (labels[status]??status)}
    </span>
  );
}
