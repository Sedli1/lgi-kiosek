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
const ACTION_LABELS: Record<string, string> = { created: "Registrace", ramp_assigned: "Rampa přidělena", done: "Dokončeno", note_added: "Poznámka", edited: "Úprava záznamu", cancelled: "Zrušeno operátorem" };
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

function fmtHistoryDate(s: string | null): string {
  if (!s) return "—";
  const d = new Date(s.includes("T") ? s : s.replace(" ", "T") + "Z");
  const now = new Date();
  const yesterday = new Date(now); yesterday.setDate(now.getDate() - 1);
  const time = d.toLocaleTimeString("cs-CZ", { hour: "2-digit", minute: "2-digit" });
  if (d.toDateString() === now.toDateString()) return `dnes ${time}`;
  if (d.toDateString() === yesterday.toDateString()) return `včera ${time}`;
  return d.toLocaleDateString("cs-CZ", { day: "numeric", month: "numeric" }) + ` ${time}`;
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

// ── Overdue row wrapper ────────────────────────────────────

function LiveDriverRow({ driver, children }: { driver: Driver; children: React.ReactNode }) {
  const [overdue, setOverdue] = useState(
    () => driver.status === "wait" && Date.now() - parseDate(driver.createdAt).getTime() > 30 * 60000
  );
  useEffect(() => {
    if (driver.status !== "wait") return;
    const t = setInterval(() => setOverdue(Date.now() - parseDate(driver.createdAt).getTime() > 30 * 60000), 15000);
    return () => clearInterval(t);
  }, [driver.createdAt, driver.status]);
  return (
    <div className={`group px-4 py-3 flex items-center gap-3 hover:bg-gray-50 ${overdue ? "border-l-[3px] border-red-500 bg-red-50/40" : ""}`}>
      {overdue && <span className="text-red-500 text-base flex-shrink-0 leading-none" title="Čeká déle než 30 minut">⚠</span>}
      {children}
    </div>
  );
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
  const [tab, setTab] = useState<"active" | "history" | "stats" | "users">("active");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [operatorUsername, setOperatorUsername] = useState("");
  const [operatorRole, setOperatorRole] = useState("operator");
  const [authed, setAuthed] = useState(false);
  const [authChecked, setAuthChecked] = useState(false);
  const [authError, setAuthError] = useState(false);
  const [authLoading, setAuthLoading] = useState(false);
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
  const [editForm, setEditForm] = useState({ name: "", spz: "", firm: "", phone: "", type: "", order: "", note: "" });
  const [editSending, setEditSending] = useState(false);
  const [addModal, setAddModal] = useState(false);
  const [addForm, setAddForm] = useState({ name: "", phone: "", spz: "", firm: "", order: "", type: "vyklada", lang: "cs" });
  const [addSending, setAddSending] = useState(false);
  const [confirmDoneId, setConfirmDoneId] = useState<number | null>(null);
  const [showLegend, setShowLegend] = useState(false);
  const [historyFirmFilter, setHistoryFirmFilter] = useState("all");
  const [historyDayFilter, setHistoryDayFilter] = useState("all");
  const [skipSms, setSkipSms] = useState(false);
  const [cancelConfirmId, setCancelConfirmId] = useState<number | null>(null);
  const [statsFirmSearch, setStatsFirmSearch] = useState("");
  const [statsTypeFilter, setStatsTypeFilter] = useState("all");
  const [historyStatusFilter, setHistoryStatusFilter] = useState("all");
  const [historyTypeFilter, setHistoryTypeFilter] = useState("all");
  const [historyDetailModal, setHistoryDetailModal] = useState<Driver | null>(null);
  const [opList, setOpList] = useState<{id:number;username:string;role:string;createdAt:string;active:number}[]>([]);
  const [opListLoading, setOpListLoading] = useState(false);
  const [addOpModal, setAddOpModal] = useState(false);
  const [addOpForm, setAddOpForm] = useState({ username: "", password: "", role: "operator" });
  const [addOpError, setAddOpError] = useState("");
  const [addOpSending, setAddOpSending] = useState(false);
  const [deleteOpId, setDeleteOpId] = useState<number | null>(null);
  const [changePassModal, setChangePassModal] = useState<{id:number;username:string}|null>(null);
  const [changePassValue, setChangePassValue] = useState("");
  const [changePassError, setChangePassError] = useState("");

  // Zkontrolovat session cookie při načtení stránky
  useEffect(() => {
    fetch("/api/auth")
      .then(r => r.json())
      .then((d: unknown) => {
        const data = d as { authed: boolean; operator?: { username: string; role: string } };
        setAuthed(data.authed === true);
        if (data.operator) {
          setOperatorUsername(data.operator.username);
          setOperatorRole(data.operator.role);
        }
        setAuthChecked(true);
      })
      .catch(() => setAuthChecked(true));
  }, []);

  // Request notification permission
  useEffect(() => {
    if (!authed) return;
    if ("Notification" in window) {
      if (Notification.permission === "default") Notification.requestPermission().then(p => { notifGranted.current = p === "granted"; });
      else notifGranted.current = Notification.permission === "granted";
    }
  }, [authed]);

  // SSE — fetch-based (podporuje custom headers, heslo není v URL)
  useEffect(() => {
    if (!authed) return;
    let aborted = false;
    const ctrl = new AbortController();

    const processData = (raw: string) => {
      const data = JSON.parse(raw) as { drivers: Driver[]; ramps: Ramp[]; auditLogs: AuditLog[] };
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

    const connect = async () => {
      try {
        setConnected(false);
        const res = await fetch("/api/stream", { headers: authHeaders(), signal: ctrl.signal });
        if (!res.ok || !res.body) throw new Error("bad response");
        setConnected(true);
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buf = "";
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });
          const parts = buf.split("\n\n");
          buf = parts.pop() ?? "";
          for (const chunk of parts) {
            const m = chunk.match(/^data: (.+)$/m);
            if (m) try { processData(m[1]); } catch {}
          }
        }
      } catch (e: any) {
        if (e?.name === "AbortError") return;
      }
      if (!aborted) { setConnected(false); setTimeout(connect, 3000); }
    };

    connect();
    return () => { aborted = true; ctrl.abort(); };
  }, [authed]);

  // Load stats
  useEffect(() => {
    if (tab !== "stats" || !authed) return;
    setStats(null);
    const from = periodToFrom(statsPeriod);
    const qs = (from ? `&from=${encodeURIComponent(from)}` : "") + (statsTypeFilter !== "all" ? `&type=${statsTypeFilter}` : "");
    fetch(`/api/stats?${qs.replace(/^&/, "")}`, { headers: authHeaders() })
      .then(r => r.json()).then(d => setStats(d as StatsData)).catch(() => {});
  }, [tab, authed, statsPeriod, statsTypeFilter]);

  // Načíst seznam operátorů při přechodu na záložku users
  useEffect(() => {
    if (tab !== "users" || !authed || operatorRole !== "admin") return;
    setOpListLoading(true);
    fetch("/api/operators", { headers: authHeaders() })
      .then(r => r.json())
      .then((d: unknown) => { setOpList(d as typeof opList); setOpListLoading(false); })
      .catch(() => setOpListLoading(false));
  }, [tab, authed, operatorRole]);

  // Auto-login from URL ?pass= (pre-fill password field, still requires server auth)
  useEffect(() => {
    if (typeof window === "undefined" || authed) return;
    const p = new URLSearchParams(window.location.search).get("pass");
    if (p && p.length >= 3) setPassword(p);
  }, []);

  // Ramp conflict
  useEffect(() => {
    if (!rampModal) return;
    setRampConflict(drivers.find(d => d.status === "ramp" && d.ramp === selectedRamp && d.id !== rampModal.id) ?? null);
  }, [selectedRamp, rampModal, drivers]);

  function authHeaders(extra?: Record<string, string>): Record<string, string> {
    return { ...extra };
  }

  async function handleAuth(e: React.FormEvent) {
    e.preventDefault();
    if (!username.trim() || password.length < 3) { setAuthError(true); return; }
    setAuthLoading(true);
    try {
      const res = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: username.trim().toLowerCase(), password }),
      });
      if (!res.ok) { setAuthError(true); setAuthLoading(false); return; }
      const data = await res.json() as { ok: boolean; operator: { username: string; role: string } };
      setOperatorUsername(data.operator.username);
      setOperatorRole(data.operator.role);
      setPassword("");
      setAuthed(true);
      setAuthError(false);
    } catch { setAuthError(true); }
    setAuthLoading(false);
  }

  async function addOperator() {
    if (!addOpForm.username || !addOpForm.password) return;
    setAddOpSending(true);
    setAddOpError("");
    try {
      const res = await fetch("/api/operators", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(addOpForm),
      });
      const data = await res.json() as { error?: string; id?: number };
      if (!res.ok) { setAddOpError(data.error ?? "Chyba"); setAddOpSending(false); return; }
      setOpList(prev => [...prev, data as typeof opList[0]]);
      setAddOpModal(false);
      setAddOpForm({ username: "", password: "", role: "operator" });
    } catch { setAddOpError("Chyba sítě"); }
    setAddOpSending(false);
  }

  async function deleteOperator(id: number) {
    await fetch(`/api/operators/${id}`, { method: "DELETE" });
    setOpList(prev => prev.filter(op => op.id !== id));
    setDeleteOpId(null);
  }

  async function toggleRole(op: typeof opList[0]) {
    const newRole = op.role === "admin" ? "operator" : "admin";
    const res = await fetch(`/api/operators/${op.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role: newRole }),
    });
    if (res.ok) {
      setOpList(prev => prev.map(o => o.id === op.id ? { ...o, role: newRole } : o));
    }
  }

  async function changePassword() {
    if (!changePassModal || changePassValue.length < 6) return;
    setChangePassError("");
    const res = await fetch(`/api/operators/${changePassModal.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: changePassValue }),
    });
    const data = await res.json() as { error?: string };
    if (!res.ok) { setChangePassError(data.error ?? "Chyba"); return; }
    setChangePassModal(null);
    setChangePassValue("");
    // Pokud je to vlastní heslo, odhlásit (session byla invalidována)
    if (changePassModal.id === opList.find(o => o.username === operatorUsername)?.id) {
      await fetch("/api/auth", { method: "DELETE" }).catch(() => {});
      setAuthed(false);
    }
  }

  async function assignRamp() {
    if (!rampModal) return;
    setSending(true);
    await fetch(`/api/drivers/${rampModal.id}/ramp`, {
      method: "PATCH", headers: authHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ ramp: selectedRamp, rampTime: selectedTime, skipSms }),
    });
    setSending(false); setRampModal(null); setRampConflict(null); setSkipSms(false);
  }

  async function cancelDriver(id: number) {
    await fetch(`/api/drivers/${id}`, { method: "DELETE", headers: authHeaders() });
    setCancelConfirmId(null);
  }

  async function markDone(id: number) {
    await fetch(`/api/drivers/${id}/done`, { method: "PATCH", headers: authHeaders() });
  }

  async function toggleRampRepair(ramp: Ramp) {
    const newStatus = ramp.status === "repair" ? "available" : "repair";
    await fetch(`/api/ramps`, {
      method: "PATCH", headers: authHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ id: ramp.id, status: newStatus }),
    });
  }

  async function resetData() {
    await fetch(`/api/reset?confirm=yes`, { method: "DELETE", headers: authHeaders() });
    setShowResetDialog(false);
  }

  async function saveEdit() {
    if (!editModal) return;
    setEditSending(true);
    await fetch(`/api/drivers/${editModal.id}`, {
      method: "PATCH", headers: authHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ ...editForm, note: editForm.note.trim() || null }),
    });
    setEditSending(false);
    setEditModal(null);
  }

  async function addDriver() {
    if (!addForm.name || !addForm.phone || !addForm.spz || !addForm.firm) return;
    setAddSending(true);
    const res = await fetch(`/api/drivers`, {
      method: "POST", headers: authHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify(addForm),
    });
    setAddSending(false);
    if (res.ok) { setAddModal(false); setAddForm({ name: "", phone: "", spz: "", firm: "", order: "", type: "vyklada", lang: "cs" }); }
  }


  // ── Loading state ─────────────────────────────────────────

  if (!authChecked) {
    return (
      <div className="min-h-screen bg-[#065A82] flex items-center justify-center">
        <div className="text-white text-lg opacity-70">Načítám…</div>
      </div>
    );
  }

  // ── Login screen ──────────────────────────────────────────

  if (!authed) {
    return (
      <div className="min-h-screen bg-[#065A82] flex items-center justify-center">
        <form method="post" onSubmit={handleAuth} className="bg-white rounded-2xl p-8 w-80 shadow-xl">
          <h1 className="text-xl font-bold text-gray-900 mb-1">Operátorský panel</h1>
          <p className="text-gray-500 text-sm mb-6">Přihlaste se svým účtem</p>
          <input type="text" value={username} onChange={e => setUsername(e.target.value)} placeholder="Uživatelské jméno"
            autoComplete="username"
            className="w-full border border-gray-300 rounded-lg px-4 py-3 mb-3 focus:outline-none focus:ring-2 focus:ring-[#065A82]" />
          <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Heslo"
            autoComplete="current-password"
            className="w-full border border-gray-300 rounded-lg px-4 py-3 mb-3 focus:outline-none focus:ring-2 focus:ring-[#065A82]" />
          {authError && <p className="text-red-500 text-sm mb-3">Nesprávné přihlašovací údaje</p>}
          <button type="submit" disabled={authLoading} className="w-full bg-[#065A82] text-white font-semibold py-3 rounded-xl hover:bg-[#054a6b] disabled:opacity-60">
            {authLoading ? "Přihlašuji…" : "Přihlásit"}
          </button>
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
          <span className="text-sm text-blue-200">{operatorUsername}</span>
          {operatorRole === "admin" && <span className="text-xs bg-purple-500/70 px-1.5 py-0.5 rounded text-white">admin</span>}
          <button onClick={() => { setAddForm({ name: "", phone: "", spz: "", firm: "", order: "", type: "vyklada", lang: "cs" }); setAddModal(true); }}
            className="text-xs bg-white/20 hover:bg-white/30 px-2 py-1 rounded text-white font-bold" title="Přidat řidiče ručně">
            + Přidat
          </button>
          <button onClick={() => setShowResetDialog(true)} className="text-xs bg-red-600/70 hover:bg-red-600 px-2 py-1 rounded text-white" title="Smazat všechna data (testování)">
            🗑 Reset
          </button>
          <button onClick={async () => {
            await fetch("/api/auth", { method: "DELETE" }).catch(() => {});
            setOperatorUsername(""); setOperatorRole("operator"); setAuthed(false);
          }} className="text-blue-200 text-sm hover:text-white">Odhlásit</button>
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
              {([["all","Vše"],["vyklada","Vykládka"],["naklada","Nakládka"],["obe","Vykl.+Nakl."]] as const).map(([val,label]) => (
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
                  className={`flex-1 py-2.5 text-sm font-medium transition flex items-center justify-center gap-1.5 ${tab===t ? "text-[#065A82] border-b-2 border-[#065A82] bg-blue-50" : "text-gray-500 hover:text-gray-700"}`}>
                  {t==="active" && <>Aktivní <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${tab==="active"?"bg-[#065A82] text-white":"bg-gray-200 text-gray-600"}`}>{active.length}</span></>}
                  {t==="history" && <>Historie <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${tab==="history"?"bg-[#065A82] text-white":"bg-gray-200 text-gray-600"}`}>{history.length}</span></>}
                  {t==="stats" && "Statistiky"}
                </button>
              ))}
              {operatorRole === "admin" && (
                <button onClick={() => setTab("users")}
                  className={`flex-1 py-2.5 text-sm font-medium transition flex items-center justify-center gap-1.5 ${tab==="users" ? "text-[#065A82] border-b-2 border-[#065A82] bg-blue-50" : "text-gray-500 hover:text-gray-700"}`}>
                  Uživatelé
                </button>
              )}
            </div>

            {/* Active drivers */}
            {tab === "active" && (() => {
              const sorted = [...filteredActive].sort((a, b) => parseDate(a.createdAt).getTime() - parseDate(b.createdAt).getTime());
              const waitSorted = sorted.filter(d => d.status === "wait");
              const rampSorted = sorted.filter(d => d.status === "ramp");

              const renderRow = (d: Driver) => (
                <LiveDriverRow key={d.id} driver={d}>
                  <div className="w-8 h-8 rounded-full bg-[#065A82] text-white flex items-center justify-center font-bold text-xs flex-shrink-0">
                    {d.num}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-gray-900 text-sm leading-tight">{d.name}</div>
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
                  {d.status === "ramp" && <StatusBadge status={d.status} ramp={d.ramp} rampTime={d.rampTime} />}
                  <button
                    onClick={() => { setEditModal(d); setEditForm({ name: d.name, spz: d.spz, firm: d.firm, phone: d.phone, type: d.type, order: d.order ?? "", note: d.note ?? "" }); }}
                    className="text-xs px-2 py-1 rounded border border-gray-200 text-gray-500 hover:border-[#065A82] hover:text-[#065A82] hover:bg-blue-50 flex-shrink-0 font-medium"
                    title="Upravit záznam">
                    Upravit
                  </button>
                  {d.status === "wait" && cancelConfirmId !== d.id && (
                    <button onClick={() => setCancelConfirmId(d.id)}
                      className="text-xs px-2 py-1 rounded border border-gray-200 text-gray-400 hover:border-red-300 hover:text-red-500 hover:bg-red-50 flex-shrink-0"
                      title="Zrušit čekání">
                      ✕
                    </button>
                  )}
                  {d.status === "wait" && cancelConfirmId === d.id && (
                    <div className="flex gap-1 flex-shrink-0">
                      <button onClick={() => cancelDriver(d.id)} className="bg-red-600 text-white text-xs px-2 py-1 rounded-lg font-semibold">Zrušit?</button>
                      <button onClick={() => setCancelConfirmId(null)} className="bg-gray-200 text-gray-600 text-xs px-2 py-1 rounded-lg">Ne</button>
                    </div>
                  )}
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
                </LiveDriverRow>
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
            {tab === "history" && (() => {
              const historyFirms = [...new Set(history.map(d => d.firm))].sort();
              const historyDays = [...new Set(history.map(d =>
                parseDate(d.createdAt).toLocaleDateString("cs-CZ", { day: "numeric", month: "numeric", year: "numeric" })
              ))];
              const displayHistory = filteredHistory.filter(d => {
                if (historyFirmFilter !== "all" && d.firm !== historyFirmFilter) return false;
                if (historyTypeFilter !== "all" && d.type !== historyTypeFilter) return false;
                if (historyStatusFilter === "done" && d.note === "Zrušeno operátorem") return false;
                if (historyStatusFilter === "cancelled" && d.note !== "Zrušeno operátorem") return false;
                if (historyDayFilter === "today") return parseDate(d.createdAt).toDateString() === new Date().toDateString();
                if (historyDayFilter === "week") { const w = new Date(); w.setDate(w.getDate()-7); return parseDate(d.createdAt) >= w; }
                if (historyDayFilter !== "all") {
                  const s = parseDate(d.createdAt).toLocaleDateString("cs-CZ", { day: "numeric", month: "numeric", year: "numeric" });
                  if (s !== historyDayFilter) return false;
                }
                return true;
              });
              const histSummary = (() => {
                const ok = displayHistory.filter(d => d.rampAssignedAt && d.doneAt && d.note !== "Zrušeno operátorem");
                const withWait = displayHistory.filter(d => d.rampAssignedAt && d.note !== "Zrušeno operátorem");
                const avgRamp = ok.length ? Math.round(ok.reduce((s,d) => s + (parseDate(d.doneAt!).getTime() - parseDate(d.rampAssignedAt!).getTime()), 0) / ok.length / 60000) : null;
                const avgWait = withWait.length ? Math.round(withWait.reduce((s,d) => s + (parseDate(d.rampAssignedAt!).getTime() - parseDate(d.createdAt).getTime()), 0) / withWait.length / 60000) : null;
                return { count: displayHistory.length, avgRamp, avgWait };
              })();

              // Skupiny dle dne
              const now2 = new Date();
              const yesterday2 = new Date(now2); yesterday2.setDate(now2.getDate()-1);
              const dayGroups = new Map<string, Driver[]>();
              for (const d of [...displayHistory].sort((a,b) => parseDate(b.createdAt).getTime() - parseDate(a.createdAt).getTime())) {
                const dt = parseDate(d.createdAt);
                let label: string;
                if (dt.toDateString() === now2.toDateString()) label = `Dnes (${dt.toLocaleDateString("cs-CZ", { day: "numeric", month: "numeric" })})`;
                else if (dt.toDateString() === yesterday2.toDateString()) label = `Včera (${dt.toLocaleDateString("cs-CZ", { day: "numeric", month: "numeric" })})`;
                else label = dt.toLocaleDateString("cs-CZ", { weekday: "long", day: "numeric", month: "numeric" });
                const arr = dayGroups.get(label) ?? []; arr.push(d); dayGroups.set(label, arr);
              }

              if (history.length === 0) return <div className="flex-1 flex items-center justify-center text-gray-400 text-sm py-12">Žádná historie</div>;

              return (
                <div className="flex flex-col overflow-hidden">
                  {/* Filtry */}
                  <div className="px-3 py-2 border-b border-gray-100 flex items-center gap-2 flex-wrap bg-white">
                    <select value={historyDayFilter} onChange={e => setHistoryDayFilter(e.target.value)}
                      className="text-xs border border-gray-200 rounded-lg px-2 py-1 focus:outline-none focus:ring-1 focus:ring-[#065A82] bg-white">
                      <option value="all">Všechny dny</option>
                      <option value="today">Dnes</option>
                      <option value="week">7 dní</option>
                      {historyDays.map(d => <option key={d} value={d}>{d}</option>)}
                    </select>
                    {historyFirms.length > 1 && (
                      <select value={historyFirmFilter} onChange={e => setHistoryFirmFilter(e.target.value)}
                        className="text-xs border border-gray-200 rounded-lg px-2 py-1 focus:outline-none focus:ring-1 focus:ring-[#065A82] bg-white">
                        <option value="all">Všechny firmy</option>
                        {historyFirms.map(f => <option key={f} value={f}>{f}</option>)}
                      </select>
                    )}
                    <select value={historyTypeFilter} onChange={e => setHistoryTypeFilter(e.target.value)}
                      className="text-xs border border-gray-200 rounded-lg px-2 py-1 focus:outline-none focus:ring-1 focus:ring-[#065A82] bg-white">
                      <option value="all">Vše</option>
                      <option value="vyklada">Vykládka</option>
                      <option value="naklada">Nakládka</option>
                      <option value="obe">Vykl.+Nakl.</option>
                    </select>
                    <select value={historyStatusFilter} onChange={e => setHistoryStatusFilter(e.target.value)}
                      className="text-xs border border-gray-200 rounded-lg px-2 py-1 focus:outline-none focus:ring-1 focus:ring-[#065A82] bg-white">
                      <option value="all">Všechny stavy</option>
                      <option value="done">Hotovo</option>
                      <option value="cancelled">Zrušeno</option>
                    </select>
                    {displayHistory.length > 0 && (
                      <button onClick={() => exportCsv(displayHistory as unknown as DriverRow[])}
                        className="ml-auto text-xs px-2.5 py-1 rounded-lg bg-green-600 text-white hover:bg-green-700 whitespace-nowrap">
                        ↓ CSV ({displayHistory.length})
                      </button>
                    )}
                  </div>
                  {/* Summary bar */}
                  {displayHistory.length > 0 && (
                    <div className="px-4 py-1.5 bg-gray-50 border-b border-gray-100 flex gap-3 text-xs text-gray-500">
                      <span className="font-medium text-gray-700">{histSummary.count} jízd</span>
                      {histSummary.avgWait !== null && <span>ø čekání <span className="text-amber-600 font-medium">{fmtDuration(histSummary.avgWait)}</span></span>}
                      {histSummary.avgRamp !== null && <span>ø rampa <span className="text-[#065A82] font-medium">{fmtDuration(histSummary.avgRamp)}</span></span>}
                    </div>
                  )}
                  {/* Skupiny */}
                  <div className="overflow-y-auto">
                    {displayHistory.length === 0
                      ? <div className="text-center text-gray-400 text-sm py-10">Žádné výsledky</div>
                      : [...dayGroups.entries()].map(([dayLabel, rows]) => (
                        <div key={dayLabel}>
                          <div className="px-4 py-1.5 bg-gray-50 border-b border-gray-100 flex items-center gap-2">
                            <span className="text-xs font-semibold text-gray-500">{dayLabel}</span>
                            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-gray-200 text-gray-500 font-medium">{rows.length}</span>
                          </div>
                          <div className="divide-y divide-gray-50">
                            {rows.map(d => {
                              const rampMins = d.rampAssignedAt && d.doneAt
                                ? Math.round((parseDate(d.doneAt).getTime() - parseDate(d.rampAssignedAt).getTime()) / 60000) : null;
                              const waitMins = d.rampAssignedAt
                                ? Math.round((parseDate(d.rampAssignedAt).getTime() - parseDate(d.createdAt).getTime()) / 60000) : null;
                              const isCancelled = d.note === "Zrušeno operátorem";
                              const isOverdue = !isCancelled && rampMins !== null && rampMins > 120;
                              const statusIcon = isCancelled
                                ? <div className="w-5 h-5 rounded-full bg-red-100 text-red-500 flex items-center justify-center text-[10px] font-bold flex-shrink-0">✕</div>
                                : isOverdue
                                  ? <div className="w-5 h-5 rounded-full bg-orange-100 text-orange-500 flex items-center justify-center text-[10px] font-bold flex-shrink-0">⚠</div>
                                  : <div className="w-5 h-5 rounded-full bg-green-100 text-green-600 flex items-center justify-center text-[10px] font-bold flex-shrink-0">✓</div>;
                              return (
                                <button key={d.id} onClick={() => setHistoryDetailModal(d)}
                                  className="w-full text-left px-3 py-2.5 hover:bg-blue-50/40 transition flex items-start gap-2">
                                  {statusIcon}
                                  <div className="w-6 h-6 rounded-full bg-gray-200 text-gray-600 flex items-center justify-center font-bold text-[10px] flex-shrink-0 mt-0.5">
                                    {d.num}
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-1.5 flex-wrap">
                                      <span className="text-sm font-semibold text-gray-800 leading-tight">{d.name}</span>
                                      {isCancelled
                                        ? <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-red-100 text-red-600 font-medium">Zrušeno</span>
                                        : isOverdue
                                          ? <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-orange-100 text-orange-600 font-medium">Překročil čas</span>
                                          : <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-green-100 text-green-700 font-medium">Hotovo</span>
                                      }
                                    </div>
                                    <div className="text-[11px] text-gray-400 mt-0.5 truncate">
                                      {d.spz} · {d.firm} · {TYPE_LABELS[d.type]??d.type}{d.ramp && ` · R${d.ramp}`}
                                    </div>
                                    {!isCancelled && (waitMins !== null || rampMins !== null) && (
                                      <div className="flex gap-1.5 mt-1 flex-wrap">
                                        {waitMins !== null && (
                                          <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${waitMins > 30 ? "bg-red-50 text-red-600" : waitMins > 15 ? "bg-amber-50 text-amber-700" : "bg-gray-100 text-gray-500"}`}>
                                            ⏱ {fmtDuration(waitMins)}
                                          </span>
                                        )}
                                        {rampMins !== null && (
                                          <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${rampMins > 240 ? "bg-red-50 text-red-600" : rampMins > 60 ? "bg-amber-50 text-amber-700" : "bg-green-50 text-green-700"}`}>
                                            🏭 {fmtDuration(rampMins)}
                                          </span>
                                        )}
                                      </div>
                                    )}
                                  </div>
                                  <div className="text-[10px] text-gray-400 flex-shrink-0 mt-0.5">
                                    {parseDate(d.createdAt).toLocaleTimeString("cs-CZ", { hour: "2-digit", minute: "2-digit" })}
                                  </div>
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      ))
                    }
                  </div>
                </div>
              );
            })()}

            {/* Stats */}
            {tab === "stats" && (
              <div className="p-4 overflow-y-auto space-y-4">
                {/* Controls row */}
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex gap-1 flex-wrap">
                    {(["today","week","month","all"] as StatsPeriod[]).map(p => (
                      <button key={p} onClick={() => setStatsPeriod(p)}
                        className={`px-3 py-1 rounded-lg text-xs font-medium transition ${statsPeriod===p?"bg-[#065A82] text-white":"bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>
                        {PERIOD_LABELS[p]}
                      </button>
                    ))}
                  </div>
                  <div className="flex gap-1 flex-wrap">
                    {([["all","Vše"],["vyklada","Vykládka"],["naklada","Nakládka"],["obe","Vykl.+Nakl."]] as const).map(([v,l]) => (
                      <button key={v} onClick={() => setStatsTypeFilter(v)}
                        className={`px-2.5 py-1 rounded-lg text-xs font-medium transition ${statsTypeFilter===v?"bg-amber-500 text-white":"bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>
                        {l}
                      </button>
                    ))}
                  </div>
                  {stats && stats.rows.length > 0 && (
                    <button onClick={() => exportCsv(stats.rows)}
                      className="flex items-center gap-1 px-3 py-1 rounded-lg text-xs font-medium bg-green-600 text-white hover:bg-green-700 whitespace-nowrap">
                      ↓ Exportovat {stats.rows.length} záznamů jako CSV
                    </button>
                  )}
                </div>
                {!stats ? (
                  <p className="text-sm text-gray-400 text-center py-8">Načítám…</p>
                ) : (() => {
                  // KPI výpočty
                  const nonCancelledRows = stats.rows.filter(r => r.status !== "cancelled");
                  const completedRows = nonCancelledRows.filter(r => r.doneAt && r.rampAssignedAt);
                  const avgRamp = completedRows.length
                    ? Math.round(completedRows.reduce((s,r) => s + (parseDate(r.doneAt).getTime() - parseDate(r.rampAssignedAt!).getTime()), 0) / completedRows.length / 60000)
                    : null;
                  const waitRows = nonCancelledRows.filter(r => r.rampAssignedAt);
                  const avgWait = waitRows.length
                    ? Math.round(waitRows.reduce((s,r) => s + (parseDate(r.rampAssignedAt!).getTime() - parseDate(r.createdAt).getTime()), 0) / waitRows.length / 60000)
                    : null;
                  const rampsUsed = new Set(nonCancelledRows.filter(r => r.ramp).map(r => r.ramp)).size;
                  const totalRamps = rampRows.length;

                  // Barva čekání
                  const waitColor = avgWait === null ? "text-gray-400" : avgWait <= 10 ? "text-green-600" : avgWait <= 30 ? "text-amber-600" : "text-red-600";
                  const waitArrow = avgWait === null ? null : avgWait <= 10 ? <span className="text-green-500 text-xs ml-1" title="Čekání je v normě">↓</span> : avgWait <= 30 ? <span className="text-amber-500 text-xs ml-1" title="Čekání je vyšší">→</span> : <span className="text-red-500 text-xs ml-1 animate-pulse" title="Čekání je nadměrné">↑</span>;

                  // Peak hours
                  const hourMap = new Map<number, number>();
                  for (const r of stats.rows) {
                    const h = parseDate(r.createdAt).getHours();
                    hourMap.set(h, (hourMap.get(h) ?? 0) + 1);
                  }
                  const peakHours = [...hourMap.entries()].sort((a,b) => a[0]-b[0]);
                  const maxPeak = Math.max(...peakHours.map(([,c]) => c), 1);

                  // Barva dle minut na rampě
                  const rampTimeColor = (mins: number | null) =>
                    mins === null ? "bg-gray-300" : mins < 60 ? "bg-green-500" : mins < 240 ? "bg-amber-400" : "bg-red-500";
                  const rampTimeBadgeColor = (mins: number | null) =>
                    mins === null ? "bg-gray-100 text-gray-400" : mins < 60 ? "bg-green-100 text-green-700" : mins < 240 ? "bg-amber-100 text-amber-700" : "bg-red-100 text-red-600";

                  return (
                  <div className="space-y-5">
                    {/* KPI karty */}
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                      <div className="bg-gray-50 rounded-xl p-3 text-center border border-gray-100">
                        <div className="text-lg font-bold text-[#065A82]">{stats.totalDone}<span className="text-xs font-normal text-gray-400 ml-1">jízd</span></div>
                        <div className="text-xs text-gray-500 mt-0.5">Dokončeno</div>
                      </div>
                      <div className="bg-gray-50 rounded-xl p-3 text-center border border-gray-100">
                        <div className="text-lg font-bold text-green-700">{avgRamp !== null ? fmtDuration(avgRamp) : "—"}</div>
                        <div className="text-xs text-gray-500 mt-0.5">Ø čas na rampě</div>
                      </div>
                      <div className="bg-gray-50 rounded-xl p-3 text-center border border-gray-100" title="Od registrace po přidělení rampy">
                        <div className={`text-lg font-bold flex items-center justify-center ${waitColor}`}>
                          {avgWait !== null ? fmtDuration(avgWait) : "—"}{waitArrow}
                        </div>
                        <div className="text-xs text-gray-500 mt-0.5">Ø čekání</div>
                      </div>
                      <div className="bg-gray-50 rounded-xl p-3 text-center border border-gray-100">
                        <div className="flex items-center justify-center gap-2">
                          <span className="text-lg font-bold text-gray-700">{rampsUsed}<span className="text-xs font-normal text-gray-400">/{totalRamps}</span></span>
                        </div>
                        <div className="w-full bg-gray-200 rounded-full h-1.5 mt-1.5">
                          <div className="bg-[#065A82] h-1.5 rounded-full transition-all" style={{ width: totalRamps > 0 ? `${Math.round((rampsUsed/totalRamps)*100)}%` : "0%" }}/>
                        </div>
                        <div className="text-xs text-gray-500 mt-1">Ramp využito</div>
                      </div>
                    </div>

                    {/* Využití ramp */}
                    <div>
                      <h3 className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2">Využití ramp</h3>
                      {stats.perRamp.length === 0 ? <p className="text-xs text-gray-400">Žádná data</p> : (() => {
                        const activeRamps = stats.perRamp.filter(r => r.count > 0);
                        const inactiveRamps = stats.perRamp.filter(r => r.count === 0);
                        const maxCount = Math.max(...activeRamps.map(r => r.count), 1);
                        return (
                          <div className="space-y-1.5">
                            {activeRamps.map(r => {
                              const barColor = rampTimeColor(r.avgMinutes);
                              const badgeColor = rampTimeBadgeColor(r.avgMinutes);
                              const isAnomaly = r.avgMinutes !== null && r.avgMinutes > 480;
                              const tooltip = `R${r.ramp}: ${r.count} návštěv, ø ${fmtDuration(r.avgMinutes)} na rampě${isAnomaly ? " — nadprůměrné!" : ""}`;
                              return (
                                <div key={r.ramp} className="flex items-center gap-2" title={tooltip}>
                                  <span className="text-xs font-bold text-[#065A82] w-6 text-right flex-shrink-0">R{r.ramp}</span>
                                  <div className="flex-1 bg-gray-100 rounded h-5 overflow-hidden">
                                    <div className={`h-5 flex items-center px-2 transition-all ${barColor}`}
                                      style={{ width: `${Math.max((r.count / maxCount) * 100, 6)}%` }}>
                                      <span className="text-[10px] text-white font-bold whitespace-nowrap">{r.count}×</span>
                                    </div>
                                  </div>
                                  <span className={`text-xs px-1.5 py-0.5 rounded font-medium flex-shrink-0 ${badgeColor}`}>
                                    {isAnomaly && "⚠ "}ø {fmtDuration(r.avgMinutes)}
                                  </span>
                                </div>
                              );
                            })}
                            {inactiveRamps.length > 0 && (
                              <div className="pt-2 flex flex-wrap gap-1.5">
                                {inactiveRamps.map(r => (
                                  <span key={r.ramp} className="text-[10px] px-2 py-0.5 rounded bg-gray-100 text-gray-400 border border-gray-200">R{r.ramp} —</span>
                                ))}
                              </div>
                            )}
                            <div className="flex gap-3 mt-1 text-[10px] text-gray-400">
                              <span><span className="inline-block w-2 h-2 rounded-full bg-green-500 mr-1"/>{"< 1h"}</span>
                              <span><span className="inline-block w-2 h-2 rounded-full bg-amber-400 mr-1"/>1–4h</span>
                              <span><span className="inline-block w-2 h-2 rounded-full bg-red-500 mr-1"/>{">4h"}</span>
                            </div>
                          </div>
                        );
                      })()}
                    </div>

                    {/* Firmy */}
                    <div>
                      <div className="flex items-center gap-2 mb-2 flex-wrap">
                        <h3 className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Firmy</h3>
                        <span className="text-[10px] text-gray-400 ml-1">kliknutím zobrazíš historii</span>
                        <input value={statsFirmSearch} onChange={e => setStatsFirmSearch(e.target.value)}
                          placeholder="Hledat…"
                          className="ml-auto text-xs border border-gray-200 rounded-lg px-2 py-1 w-28 focus:outline-none focus:ring-1 focus:ring-[#065A82]"/>
                      </div>
                      {stats.perFirm.length === 0 ? <p className="text-xs text-gray-400">Žádná data</p> : (() => {
                        const filtered = stats.perFirm
                          .filter(f => f.count > 0 && (!statsFirmSearch || f.firm.toLowerCase().includes(statsFirmSearch.toLowerCase())))
                          .sort((a, b) => b.count - a.count || (b.avgMinutes ?? 0) - (a.avgMinutes ?? 0));
                        if (filtered.length === 0) return <p className="text-xs text-gray-400">Žádná shoda</p>;
                        const maxCount = Math.max(...filtered.map(f => f.count), 1);
                        return (
                          <div className="space-y-0.5">
                            {filtered.map(f => {
                              const badgeColor = rampTimeBadgeColor(f.avgMinutes);
                              const isAnomaly = f.avgMinutes !== null && f.avgMinutes > 480;
                              return (
                                <button key={f.firm}
                                  onClick={() => { setHistoryFirmFilter(f.firm); setTab("history"); }}
                                  className="w-full flex items-center gap-2 py-1.5 px-1 rounded hover:bg-blue-50 group text-left"
                                  title={`Zobrazit historii firmy ${f.firm}`}>
                                  <span className="text-xs text-gray-700 w-24 truncate flex-shrink-0 group-hover:text-[#065A82]" title={f.firm}>{f.firm}</span>
                                  <div className="flex-1 bg-gray-100 rounded h-4 overflow-hidden">
                                    <div className="h-4 bg-[#1D9E75]/70 rounded transition-all" style={{ width: `${Math.max((f.count / maxCount) * 100, 4)}%` }}/>
                                  </div>
                                  <span className="text-xs text-gray-500 w-5 text-right flex-shrink-0">{f.count}×</span>
                                  <span className={`text-xs px-1.5 py-0.5 rounded font-medium flex-shrink-0 ${badgeColor}`}>
                                    {isAnomaly && "⚠ "}ø {fmtDuration(f.avgMinutes)}
                                  </span>
                                </button>
                              );
                            })}
                          </div>
                        );
                      })()}
                    </div>

                    {/* Peak hours */}
                    {peakHours.length > 0 && (
                      <div>
                        <h3 className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2">Příjezdy dle hodiny</h3>
                        <div className="flex items-end gap-0.5 h-14">
                          {peakHours.map(([h, c]) => (
                            <div key={h} className="flex flex-col items-center flex-1 gap-0.5" title={`${String(h).padStart(2,"0")}:00 — ${c} příjezdů`}>
                              <div className="w-full bg-[#065A82]/70 rounded-t transition-all" style={{ height: `${Math.round((c/maxPeak)*48)+4}px` }}/>
                              <span className="text-[9px] text-gray-400 leading-none">{h}</span>
                            </div>
                          ))}
                        </div>
                        <p className="text-[10px] text-gray-400 mt-1">Hodina příjezdu (počet jízd)</p>
                      </div>
                    )}
                  </div>
                  );
                })()}
              </div>
            )}
            {/* Users tab (admin only) */}
            {tab === "users" && (
              <div className="p-4 overflow-y-auto">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="font-semibold text-gray-800">Správa uživatelů</h2>
                  <button onClick={() => { setAddOpForm({ username: "", password: "", role: "operator" }); setAddOpError(""); setAddOpModal(true); }}
                    className="text-sm bg-[#065A82] text-white px-3 py-1.5 rounded-lg hover:bg-[#054a6b] font-medium">
                    + Přidat uživatele
                  </button>
                </div>
                {opListLoading ? (
                  <div className="text-gray-400 text-sm text-center py-8">Načítám…</div>
                ) : (
                  <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
                    {opList.length === 0 && <div className="px-4 py-6 text-gray-400 text-sm text-center">Žádní uživatelé</div>}
                    {opList.map(op => (
                      <div key={op.id} className="flex items-center justify-between px-4 py-3 gap-3">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="font-medium text-gray-900">{op.username}</span>
                          {op.username === operatorUsername && <span className="text-xs text-gray-400">(já)</span>}
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${op.role === "admin" ? "bg-purple-100 text-purple-700" : "bg-blue-100 text-blue-700"}`}>
                            {op.role === "admin" ? "admin" : "operátor"}
                          </span>
                        </div>
                        <div className="flex gap-1.5 flex-shrink-0">
                          <button onClick={() => { setChangePassModal({ id: op.id, username: op.username }); setChangePassValue(""); setChangePassError(""); }}
                            className="text-xs px-2 py-1 rounded border border-gray-200 text-gray-500 hover:border-[#065A82] hover:text-[#065A82]">
                            Heslo
                          </button>
                          <button onClick={() => toggleRole(op)}
                            disabled={op.username === operatorUsername}
                            className="text-xs px-2 py-1 rounded border border-gray-200 text-gray-500 hover:border-[#065A82] hover:text-[#065A82] disabled:opacity-40 disabled:cursor-not-allowed">
                            {op.role === "admin" ? "→ Operátor" : "→ Admin"}
                          </button>
                          <button onClick={() => setDeleteOpId(op.id)}
                            disabled={op.username === operatorUsername}
                            className="text-xs px-2 py-1 rounded border border-red-200 text-red-500 hover:bg-red-50 disabled:opacity-40 disabled:cursor-not-allowed">
                            Smazat
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Add operator modal */}
                {addOpModal && (
                  <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
                    <div className="bg-white rounded-2xl p-6 w-80 shadow-xl">
                      <h3 className="font-semibold text-gray-900 mb-4">Nový uživatel</h3>
                      <input type="text" value={addOpForm.username} onChange={e => setAddOpForm(f => ({ ...f, username: e.target.value }))}
                        placeholder="Uživatelské jméno (a-z, 0-9, . - _)"
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 mb-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#065A82]" />
                      <input type="password" value={addOpForm.password} onChange={e => setAddOpForm(f => ({ ...f, password: e.target.value }))}
                        placeholder="Heslo (min. 6 znaků)"
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 mb-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#065A82]" />
                      <select value={addOpForm.role} onChange={e => setAddOpForm(f => ({ ...f, role: e.target.value }))}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 mb-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#065A82]">
                        <option value="operator">Operátor</option>
                        <option value="admin">Admin</option>
                      </select>
                      {addOpError && <p className="text-red-500 text-sm mb-3">{addOpError}</p>}
                      <div className="flex gap-2">
                        <button onClick={() => setAddOpModal(false)} className="flex-1 py-2 rounded-xl border border-gray-200 text-sm text-gray-600">Zrušit</button>
                        <button onClick={addOperator} disabled={addOpSending}
                          className="flex-1 py-2 rounded-xl bg-[#065A82] text-white text-sm font-medium disabled:opacity-60">
                          {addOpSending ? "Ukládám…" : "Přidat"}
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* Delete operator confirm */}
                {deleteOpId && (
                  <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
                    <div className="bg-white rounded-2xl p-6 w-72 shadow-xl">
                      <h3 className="font-semibold text-gray-900 mb-2">Smazat uživatele?</h3>
                      <p className="text-sm text-gray-500 mb-4">Tato akce je nevratná. Uživatel bude odhlášen.</p>
                      <div className="flex gap-2">
                        <button onClick={() => setDeleteOpId(null)} className="flex-1 py-2 rounded-xl border border-gray-200 text-sm">Zrušit</button>
                        <button onClick={() => deleteOperator(deleteOpId)} className="flex-1 py-2 rounded-xl bg-red-600 text-white text-sm font-medium">Smazat</button>
                      </div>
                    </div>
                  </div>
                )}

                {/* Change password modal */}
                {changePassModal && (
                  <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
                    <div className="bg-white rounded-2xl p-6 w-80 shadow-xl">
                      <h3 className="font-semibold text-gray-900 mb-1">Změna hesla</h3>
                      <p className="text-sm text-gray-500 mb-4">{changePassModal.username}</p>
                      <input type="password" value={changePassValue} onChange={e => setChangePassValue(e.target.value)}
                        placeholder="Nové heslo (min. 6 znaků)"
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 mb-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#065A82]" />
                      {changePassError && <p className="text-red-500 text-sm mb-3">{changePassError}</p>}
                      <div className="flex gap-2">
                        <button onClick={() => setChangePassModal(null)} className="flex-1 py-2 rounded-xl border border-gray-200 text-sm">Zrušit</button>
                        <button onClick={changePassword}
                          className="flex-1 py-2 rounded-xl bg-[#065A82] text-white text-sm font-medium">
                          Uložit
                        </button>
                      </div>
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
              {[...rampRows].sort((a, b) => Number(a.name) - Number(b.name)).map(r => {
                const driver = driverOnRamp.get(r.name);
                const isOccupied = occupiedRampNames.has(r.name);
                const isRepair = r.status === "repair";
                const shortName = driver ? driver.name.split(" ")[0].slice(0, 6) : null;
                return (
                  <button key={r.id} title={driver?`${driver.name} · ${driver.spz}`:isRepair?`R${r.name}: Oprava`:`R${r.name}: Volná`}
                    onClick={() => toggleRampRepair(r)}
                    className={`relative flex flex-col items-center justify-center h-14 rounded-lg font-bold text-xs transition gap-0.5 ${
                      isOccupied ? "bg-red-100 text-red-700 border border-red-300"
                      : isRepair ? "bg-gray-100 text-gray-400 border border-gray-200"
                      : "bg-green-50 text-green-700 border border-green-200 hover:bg-green-100"}`}>
                    <span className="text-sm font-bold leading-none">{r.name}</span>
                    {isOccupied && shortName && (
                      <span className="text-[9px] font-medium text-red-600 leading-tight truncate w-full text-center px-0.5">{shortName}</span>
                    )}
                    {isRepair && <span className="text-[9px] text-gray-400 leading-tight">oprava</span>}
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
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Interní poznámka <span className="text-gray-400 font-normal">(jen pro operátory)</span></label>
                <textarea value={editForm.note} onChange={e => setEditForm(f => ({ ...f, note: e.target.value }))} rows={2}
                  placeholder="např. čeká na nakládku ze skladu B…"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 resize-none"/>
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

      {/* History detail modal */}
      {historyDetailModal && (() => {
        const d = historyDetailModal;
        const driverAudit = auditData.filter(a => a.driverId === d.id).sort((a,b) => parseDate(a.createdAt).getTime() - parseDate(b.createdAt).getTime());
        const rampMins = d.rampAssignedAt && d.doneAt ? Math.round((parseDate(d.doneAt).getTime() - parseDate(d.rampAssignedAt).getTime()) / 60000) : null;
        const waitMins = d.rampAssignedAt ? Math.round((parseDate(d.rampAssignedAt).getTime() - parseDate(d.createdAt).getTime()) / 60000) : null;
        const isCancelled = d.note === "Zrušeno operátorem";
        const isOverdue = !isCancelled && rampMins !== null && rampMins > 120;
        return (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setHistoryDetailModal(null)}>
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
              <div className="flex items-start justify-between mb-4">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-lg font-bold text-gray-900">#{d.num} {d.name}</h3>
                    {isCancelled
                      ? <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-red-100 text-red-600 font-medium">Zrušeno</span>
                      : isOverdue
                        ? <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-orange-100 text-orange-600 font-medium">Překročil čas</span>
                        : <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-green-100 text-green-700 font-medium">Hotovo</span>
                    }
                  </div>
                  <p className="text-sm text-gray-500 mt-0.5">{d.spz} · {d.firm} · {TYPE_LABELS[d.type]??d.type}</p>
                  {d.note && !isCancelled && <p className="text-xs text-amber-700 bg-amber-50 rounded px-2 py-1 mt-1.5">📝 {d.note}</p>}
                </div>
                <button onClick={() => setHistoryDetailModal(null)} className="text-gray-300 hover:text-gray-500 text-2xl leading-none ml-2">×</button>
              </div>

              {/* Timeline */}
              <div className="space-y-0">
                {[
                  { dot: "bg-blue-100 text-blue-600", label: "Registrace", time: d.createdAt, sub: null },
                  d.rampAssignedAt ? { dot: "bg-amber-100 text-amber-600", label: `Rampa R${d.ramp} přidělena${d.rampTime ? ` · ${d.rampTime}` : ""}`, time: d.rampAssignedAt, sub: waitMins !== null ? `⏱ čekání: ${fmtDuration(waitMins)}` : null } : null,
                  d.doneAt ? { dot: isCancelled ? "bg-red-100 text-red-500" : "bg-green-100 text-green-600", label: isCancelled ? "Zrušeno operátorem" : "Dokončeno", time: d.doneAt, sub: rampMins !== null && !isCancelled ? `🏭 čas na rampě: ${fmtDuration(rampMins)}` : null } : null,
                ].filter(Boolean).map((step, i) => (
                  <div key={i} className="flex gap-3">
                    <div className="flex flex-col items-center">
                      <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${step!.dot}`}>
                        {i === 0 ? "1" : i === 1 ? "2" : "3"}
                      </div>
                      {i < 2 && <div className="w-px flex-1 bg-gray-200 my-1" style={{minHeight:"12px"}}/>}
                    </div>
                    <div className="pb-3">
                      <div className="text-sm font-medium text-gray-800">{step!.label}</div>
                      <div className="text-xs text-gray-400">{fmtHistoryDate(step!.time)}</div>
                      {step!.sub && <div className="text-xs text-gray-600 mt-0.5">{step!.sub}</div>}
                    </div>
                  </div>
                ))}
              </div>

              {/* Audit log */}
              {driverAudit.length > 0 && (
                <div className="mt-2 pt-3 border-t border-gray-100">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Audit</p>
                  <div className="space-y-1.5">
                    {driverAudit.map(a => (
                      <div key={a.id} className="flex items-start gap-2">
                        <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium flex-shrink-0 mt-0.5 ${
                          a.action==="created"?"bg-blue-50 text-blue-600"
                          :a.action==="ramp_assigned"?"bg-green-50 text-green-600"
                          :a.action==="edited"?"bg-purple-50 text-purple-600"
                          :a.action==="cancelled"?"bg-red-50 text-red-500"
                          :"bg-gray-100 text-gray-500"}`}>
                          {ACTION_LABELS[a.action]??a.action}
                        </span>
                        <div className="flex-1 min-w-0">
                          {a.note && <div className="text-[10px] text-gray-500 italic leading-tight">{a.note}</div>}
                          <div className="text-[10px] text-gray-400">{fmtHistoryDate(a.createdAt)}{a.operatorName && ` · ${a.operatorName}`}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <button onClick={() => setHistoryDetailModal(null)}
                className="w-full mt-5 border border-gray-200 text-gray-600 py-2.5 rounded-xl font-medium hover:bg-gray-50 text-sm">
                Zavřít
              </button>
            </div>
          </div>
        );
      })()}

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
                  {[...rampRows].sort((a, b) => Number(a.name) - Number(b.name)).map(r => {
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

            {!skipSms && (
              <div className="bg-gray-50 rounded-lg p-3 mb-3 text-sm text-gray-700">
                {buildRampSms(rampModal.lang as "cs"|"sk"|"pl"|"de", rampModal.name, selectedRamp, selectedTime)}
              </div>
            )}

            <label className="flex items-center gap-2 mb-4 cursor-pointer select-none">
              <input type="checkbox" checked={skipSms} onChange={e => setSkipSms(e.target.checked)}
                className="w-4 h-4 rounded border-gray-300 text-[#065A82]"/>
              <span className="text-sm text-gray-600">Přidělit bez SMS</span>
            </label>

            <div className="flex gap-3">
              <button onClick={() => { setRampModal(null); setRampConflict(null); setSkipSms(false); }}
                className="flex-1 border border-gray-300 text-gray-700 py-2.5 rounded-xl font-medium hover:bg-gray-50">
                Zrušit
              </button>
              <button onClick={assignRamp} disabled={sending}
                className={`flex-1 text-white py-2.5 rounded-xl font-medium disabled:opacity-60 ${rampConflict?"bg-orange-500 hover:bg-orange-600":"bg-[#1D9E75] hover:bg-[#178a64]"}`}>
                {sending ? "Přiděluji…" : skipSms ? (rampConflict ? "Přidělit ⚠" : "Přidělit") : (rampConflict ? "Odeslat SMS ⚠" : "Odeslat SMS")}
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
