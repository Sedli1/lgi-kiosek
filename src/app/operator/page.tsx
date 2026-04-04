"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { buildRampSms } from "@/lib/sms-client";

interface SmsLog {
  id: number;
  type: string;
  phone: string;
  message: string;
  sentAt: string;
}

interface Driver {
  id: number;
  num: number;
  name: string;
  phone: string;
  spz: string;
  firm: string;
  order: string | null;
  type: string;
  lang: string;
  status: string;
  ramp: string | null;
  rampTime: string | null;
  rampAssignedAt: string | null;
  doneAt: string | null;
  createdAt: string;
  smsLogs: SmsLog[];
}

interface Ramp {
  id: number;
  name: string;
  status: string; // available | repair
  note: string | null;
}

interface AuditLog {
  id: number;
  driverId: number | null;
  action: string;
  ramp: string | null;
  note: string | null;
  createdAt: string;
}

interface Stats {
  perRamp: { ramp: string; count: number; avgMinutes: number | null }[];
  perFirm: { firm: string; count: number; avgMinutes: number | null }[];
  totalDone: number;
}

const STATUS_LABELS: Record<string, string> = {
  wait: "Čeká",
  ramp: "Na rampě",
  done: "Hotovo",
};

const TYPE_LABELS: Record<string, string> = {
  vyklada: "Vykládka",
  naklada: "Nakládka",
  obe: "Vykl. + Nakl.",
};

const ACTION_LABELS: Record<string, string> = {
  created: "Registrace",
  ramp_assigned: "Přidělena rampa",
  done: "Dokončeno",
};

function nowTime() {
  return new Date().toLocaleTimeString("cs-CZ", { hour: "2-digit", minute: "2-digit" });
}

function fmtDuration(mins: number | null) {
  if (mins === null) return "—";
  if (mins < 60) return `${mins} min`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
}

export default function OperatorPage() {
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [rampRows, setRampRows] = useState<Ramp[]>([]);
  const [auditData, setAuditData] = useState<AuditLog[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [tab, setTab] = useState<"active" | "history" | "stats" | "audit">("active");
  const [password, setPassword] = useState(() => {
    if (typeof window !== "undefined") {
      return new URLSearchParams(window.location.search).get("pass") ?? "";
    }
    return "";
  });
  const [authed, setAuthed] = useState(false);
  const [authError, setAuthError] = useState(false);
  const [rampModal, setRampModal] = useState<Driver | null>(null);
  const [selectedRamp, setSelectedRamp] = useState("1");
  const [selectedTime, setSelectedTime] = useState(nowTime());
  const [rampConflict, setRampConflict] = useState<Driver | null>(null);
  const [sending, setSending] = useState(false);
  const [connected, setConnected] = useState(false);
  const prevDriverIds = useRef<Set<number>>(new Set());
  const notifGranted = useRef(false);

  // Request notification permission once authed
  useEffect(() => {
    if (!authed) return;
    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission().then((p) => {
        notifGranted.current = p === "granted";
      });
    } else if ("Notification" in window && Notification.permission === "granted") {
      notifGranted.current = true;
    }
  }, [authed]);

  // SSE connection
  useEffect(() => {
    if (!authed) return;
    let es: EventSource | null = null;

    const connect = () => {
      es = new EventSource(`/api/stream?pass=${encodeURIComponent(password)}`);

      es.onopen = () => setConnected(true);

      es.onmessage = (event) => {
        const data = JSON.parse(event.data) as {
          drivers: Driver[];
          ramps: Ramp[];
          auditLogs: AuditLog[];
        };

        // Detect new drivers for push notification
        const newIds = new Set(data.drivers.map((d) => d.id));
        for (const d of data.drivers) {
          if (!prevDriverIds.current.has(d.id) && prevDriverIds.current.size > 0) {
            if (notifGranted.current) {
              new Notification("Nový řidič", {
                body: `${d.name} · ${d.spz} · ${d.firm}`,
                icon: "/icon-192.png",
              });
            }
          }
        }
        prevDriverIds.current = newIds;

        setDrivers(data.drivers.map((d) => ({ ...d, smsLogs: (d as any).smsLogs ?? [] })));
        setRampRows(data.ramps);
        setAuditData(data.auditLogs);
      };

      es.onerror = () => {
        setConnected(false);
        es?.close();
        // Auto-reconnect after 3s
        setTimeout(connect, 3000);
      };
    };

    connect();
    return () => { es?.close(); };
  }, [authed, password]);

  // Load stats when stats tab opens
  useEffect(() => {
    if (tab !== "stats" || !authed) return;
    fetch(`/api/stats?pass=${encodeURIComponent(password)}`, {
      headers: { "x-operator-pass": password },
    })
      .then((r) => r.json())
      .then((d) => setStats(d as Stats))
      .catch(() => {});
  }, [tab, authed, password]);

  // Check for ramp conflict
  useEffect(() => {
    if (!rampModal) return;
    const conflict =
      drivers.find(
        (d) => d.status === "ramp" && d.ramp === selectedRamp && d.id !== rampModal.id
      ) ?? null;
    setRampConflict(conflict);
  }, [selectedRamp, rampModal, drivers]);

  // Auto-login from URL
  useEffect(() => {
    const urlPass = new URLSearchParams(window.location.search).get("pass");
    if (urlPass && urlPass.length >= 3 && !authed) setAuthed(true);
  }, [authed]);

  function openRampModal(driver: Driver) {
    setRampModal(driver);
    setSelectedRamp("1");
    setSelectedTime(nowTime());
  }

  function handleAuth(e: React.FormEvent) {
    e.preventDefault();
    if (password.length >= 3) { setAuthed(true); setAuthError(false); }
    else setAuthError(true);
  }

  async function assignRamp() {
    if (!rampModal) return;
    setSending(true);
    await fetch(`/api/drivers/${rampModal.id}/ramp?pass=${encodeURIComponent(password)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", "x-operator-pass": password },
      body: JSON.stringify({ ramp: selectedRamp, rampTime: selectedTime }),
    });
    setSending(false);
    setRampModal(null);
    setRampConflict(null);
  }

  async function markDone(id: number) {
    await fetch(`/api/drivers/${id}/done?pass=${encodeURIComponent(password)}`, {
      method: "PATCH",
      headers: { "x-operator-pass": password },
    });
  }

  async function toggleRampRepair(ramp: Ramp) {
    const newStatus = ramp.status === "repair" ? "available" : "repair";
    await fetch(`/api/ramps?pass=${encodeURIComponent(password)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", "x-operator-pass": password },
      body: JSON.stringify({ id: ramp.id, status: newStatus }),
    });
  }

  if (!authed) {
    return (
      <div className="min-h-screen bg-[#065A82] flex items-center justify-center">
        <form onSubmit={handleAuth} className="bg-white rounded-2xl p-8 w-80 shadow-xl">
          <h1 className="text-xl font-bold text-gray-900 mb-1">Operátorský panel</h1>
          <p className="text-gray-500 text-sm mb-6">Zadejte heslo pro přístup</p>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Heslo"
            className="w-full border border-gray-300 rounded-lg px-4 py-3 mb-3 focus:outline-none focus:ring-2 focus:ring-[#065A82]"
          />
          {authError && <p className="text-red-500 text-sm mb-3">Nesprávné heslo</p>}
          <button type="submit" className="w-full bg-[#065A82] text-white font-semibold py-3 rounded-xl hover:bg-[#054a6b] transition">
            Přihlásit
          </button>
        </form>
      </div>
    );
  }

  const active = drivers.filter((d) => d.status !== "done");
  const history = drivers.filter((d) => d.status === "done");
  const waiting = active.filter((d) => d.status === "wait").length;
  const onRamp = active.filter((d) => d.status === "ramp").length;

  const allLogs = drivers
    .flatMap((d) => (d.smsLogs ?? []).map((l) => ({ ...l, driverName: d.name, spz: d.spz })))
    .sort((a, b) => new Date(b.sentAt).getTime() - new Date(a.sentAt).getTime())
    .slice(0, 20);

  // Build effective ramp status: driver-occupied overrides table status
  const driverOnRamp = new Map(
    drivers.filter((d) => d.status === "ramp" && d.ramp).map((d) => [d.ramp!, d])
  );
  const occupiedRampNames = new Set(driverOnRamp.keys());

  return (
    <div className="min-h-screen bg-gray-100">
      <header className="bg-[#065A82] text-white px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-bold">LGI – Operátorský panel</h1>
          <span className={`w-2 h-2 rounded-full ${connected ? "bg-green-400" : "bg-red-400"}`} title={connected ? "Připojeno" : "Odpojeno"} />
        </div>
        <button onClick={() => setAuthed(false)} className="text-blue-200 text-sm hover:text-white">Odhlásit</button>
      </header>

      <div className="max-w-6xl mx-auto p-6 space-y-6">
        {/* Summary cards */}
        <div className="grid grid-cols-3 gap-4">
          <StatCard label="Čeká" value={waiting} color="amber" />
          <StatCard label="Na rampě" value={onRamp} color="green" />
          <StatCard label="Hotovo dnes" value={history.length} color="gray" />
        </div>

        {/* Ramp status grid */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-gray-900 text-sm uppercase tracking-wide">Přehled ramp</h2>
            <div className="flex gap-3 text-xs text-gray-400">
              <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-green-400 inline-block" />Volná</span>
              <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-red-400 inline-block" />Obsazená</span>
              <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-gray-400 inline-block" />Oprava</span>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {rampRows.map((r) => {
              const driver = driverOnRamp.get(r.name);
              const isOccupied = occupiedRampNames.has(r.name);
              const isRepair = r.status === "repair";
              return (
                <button
                  key={r.id}
                  title={
                    driver
                      ? `${driver.name} · ${driver.spz} · ${driver.rampTime ?? ""}`
                      : isRepair
                      ? `Rampa ${r.name}: Oprava/údržba`
                      : `Rampa ${r.name}: Volná`
                  }
                  onClick={() => toggleRampRepair(r)}
                  className={`relative flex flex-col items-center justify-center w-14 h-14 rounded-xl font-bold text-sm transition border-2 ${
                    isOccupied
                      ? "bg-red-100 border-red-300 text-red-700"
                      : isRepair
                      ? "bg-gray-100 border-gray-300 text-gray-400"
                      : "bg-green-50 border-green-300 text-green-700 hover:bg-green-100"
                  }`}
                >
                  <span className="text-base font-black">{r.name}</span>
                  {isOccupied && (
                    <span className="text-[9px] leading-none mt-0.5 font-normal truncate max-w-[52px] px-1">
                      {driver?.name.split(" ")[0]}
                    </span>
                  )}
                  {isRepair && !isOccupied && (
                    <span className="text-[9px] leading-none mt-0.5">oprava</span>
                  )}
                </button>
              );
            })}
          </div>
          <p className="text-xs text-gray-400 mt-2">Kliknutím na volnou rampu označíte oprava/údržba (a zpět).</p>
        </div>

        {/* Tabs */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="flex border-b border-gray-100">
            {(["active", "history", "stats", "audit"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`flex-1 py-3 text-sm font-medium transition ${
                  tab === t
                    ? "text-[#065A82] border-b-2 border-[#065A82] bg-blue-50"
                    : "text-gray-500 hover:text-gray-700"
                }`}
              >
                {t === "active" && `Aktivní (${active.length})`}
                {t === "history" && `Historie (${history.length})`}
                {t === "stats" && "Statistiky"}
                {t === "audit" && "Audit"}
              </button>
            ))}
          </div>

          {/* Active drivers */}
          {tab === "active" && (
            <>
              {active.length === 0 ? (
                <div className="px-6 py-10 text-center text-gray-400">Žádní aktivní řidiči</div>
              ) : (
                <div className="divide-y divide-gray-100">
                  {active.map((d) => (
                    <DriverRow
                      key={d.id}
                      driver={d}
                      occupiedRamps={occupiedRampNames}
                      onAssign={() => openRampModal(d)}
                      onDone={() => markDone(d.id)}
                    />
                  ))}
                </div>
              )}
            </>
          )}

          {/* History */}
          {tab === "history" && (
            <>
              {history.length === 0 ? (
                <div className="px-6 py-10 text-center text-gray-400">Žádné dokončené vykládky dnes</div>
              ) : (
                <div className="divide-y divide-gray-100">
                  {history.map((d) => {
                    const durationMins =
                      d.rampAssignedAt && d.doneAt
                        ? Math.round(
                            (new Date(d.doneAt).getTime() - new Date(d.rampAssignedAt).getTime()) /
                              60000
                          )
                        : null;
                    return (
                      <div key={d.id} className="px-6 py-4 flex items-center gap-4 opacity-70">
                        <div className="w-10 h-10 rounded-full bg-gray-300 text-gray-600 flex items-center justify-center font-bold text-sm flex-shrink-0">
                          {d.num}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-gray-700">{d.name}</div>
                          <div className="text-sm text-gray-400 flex gap-2 flex-wrap">
                            <span>{d.spz}</span>
                            <span>·</span>
                            <span>{d.firm}</span>
                            <span>·</span>
                            <span>{TYPE_LABELS[d.type] ?? d.type}</span>
                            {d.ramp && <><span>·</span><span className="text-green-600 font-medium">Rampa {d.ramp}</span></>}
                            {d.order && <><span>·</span><span>#{d.order}</span></>}
                          </div>
                        </div>
                        <div className="text-xs text-gray-400 text-right flex-shrink-0 space-y-0.5">
                          <div>Příjezd {new Date(d.createdAt).toLocaleTimeString("cs-CZ", { hour: "2-digit", minute: "2-digit" })}</div>
                          {d.rampTime && <div>Rampa {d.rampTime}</div>}
                          {durationMins !== null && (
                            <div className="text-[#065A82] font-medium">{fmtDuration(durationMins)}</div>
                          )}
                        </div>
                        <span className="text-xs px-2.5 py-1 rounded-full font-medium bg-gray-100 text-gray-500">Hotovo</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}

          {/* Stats */}
          {tab === "stats" && (
            <div className="p-6">
              {!stats ? (
                <div className="text-center text-gray-400 py-8">Načítám statistiky…</div>
              ) : (
                <div className="space-y-6">
                  <div className="text-sm text-gray-500">Celkem dokončeno: <strong className="text-gray-800">{stats.totalDone}</strong></div>

                  {/* Per ramp */}
                  <div>
                    <h3 className="font-semibold text-gray-800 mb-3">Průměr na rampu</h3>
                    {stats.perRamp.length === 0 ? (
                      <p className="text-sm text-gray-400">Žádná data</p>
                    ) : (
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        {stats.perRamp.map((r) => (
                          <div key={r.ramp} className="bg-gray-50 border border-gray-200 rounded-xl p-3 text-center">
                            <div className="text-2xl font-black text-[#065A82]">R{r.ramp}</div>
                            <div className="text-xs text-gray-500 mt-1">{r.count}× · ø {fmtDuration(r.avgMinutes)}</div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Per firm */}
                  <div>
                    <h3 className="font-semibold text-gray-800 mb-3">Top firmy</h3>
                    {stats.perFirm.length === 0 ? (
                      <p className="text-sm text-gray-400">Žádná data</p>
                    ) : (
                      <div className="divide-y divide-gray-100 rounded-xl border border-gray-200 overflow-hidden">
                        {stats.perFirm.map((f) => (
                          <div key={f.firm} className="flex items-center gap-4 px-4 py-2.5">
                            <div className="flex-1 text-sm font-medium text-gray-800 truncate">{f.firm}</div>
                            <div className="text-sm text-gray-500">{f.count}×</div>
                            <div className="text-sm text-[#065A82] font-medium w-16 text-right">ø {fmtDuration(f.avgMinutes)}</div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Audit log */}
          {tab === "audit" && (
            <>
              {auditData.length === 0 ? (
                <div className="px-6 py-10 text-center text-gray-400">Žádné záznamy</div>
              ) : (
                <div className="divide-y divide-gray-100">
                  {auditData.map((a) => {
                    const driver = drivers.find((d) => d.id === a.driverId);
                    return (
                      <div key={a.id} className="px-6 py-3 flex items-start gap-3">
                        <span className={`mt-0.5 text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0 ${
                          a.action === "created"
                            ? "bg-blue-100 text-blue-700"
                            : a.action === "ramp_assigned"
                            ? "bg-green-100 text-green-700"
                            : "bg-gray-100 text-gray-600"
                        }`}>
                          {ACTION_LABELS[a.action] ?? a.action}
                        </span>
                        <div className="flex-1 min-w-0">
                          {driver && (
                            <div className="text-sm font-medium text-gray-800">
                              {driver.name} · {driver.spz}
                            </div>
                          )}
                          {a.ramp && <div className="text-xs text-gray-500">Rampa {a.ramp}{a.note ? ` · ${a.note}` : ""}</div>}
                        </div>
                        <div className="text-xs text-gray-400 flex-shrink-0">
                          {new Date(a.createdAt).toLocaleTimeString("cs-CZ", { hour: "2-digit", minute: "2-digit" })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>

        {/* SMS Log */}
        {allLogs.length > 0 && tab === "active" && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100">
              <h2 className="font-semibold text-gray-900">Log SMS</h2>
            </div>
            <div className="divide-y divide-gray-100">
              {allLogs.map((l) => (
                <div key={l.id} className="px-6 py-3 flex items-start gap-3">
                  <span className={`mt-0.5 text-xs px-2 py-0.5 rounded-full font-medium ${
                    l.type === "confirm" ? "bg-blue-100 text-blue-700" : "bg-green-100 text-green-700"
                  }`}>
                    {l.type === "confirm" ? "Potvrzení" : "Rampa"}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-gray-800">{l.driverName} · {l.spz} · {l.phone}</div>
                    <div className="text-xs text-gray-500 mt-0.5">{l.message}</div>
                  </div>
                  <div className="text-xs text-gray-400 flex-shrink-0">
                    {new Date(l.sentAt).toLocaleTimeString("cs-CZ", { hour: "2-digit", minute: "2-digit" })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Ramp assignment modal */}
      {rampModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
            <h3 className="text-lg font-bold text-gray-900 mb-1">Přidělit rampu</h3>
            <p className="text-gray-500 text-sm mb-4">{rampModal.name} · {rampModal.spz} · {TYPE_LABELS[rampModal.type] ?? rampModal.type}</p>

            <div className="grid grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Číslo rampy</label>
                <div className="flex gap-2 flex-wrap">
                  {rampRows.map((r) => {
                    const occupied = occupiedRampNames.has(r.name) && driverOnRamp.get(r.name)?.id !== rampModal.id;
                    const repair = r.status === "repair";
                    return (
                      <button
                        key={r.name}
                        onClick={() => setSelectedRamp(r.name)}
                        title={repair ? "Oprava/údržba" : occupied ? "Obsazena" : ""}
                        className={`w-10 h-10 rounded-lg font-bold text-sm transition relative ${
                          selectedRamp === r.name
                            ? "bg-[#065A82] text-white ring-2 ring-[#065A82] ring-offset-1"
                            : repair
                            ? "bg-gray-100 text-gray-300 cursor-default"
                            : occupied
                            ? "bg-red-100 text-red-600 border-2 border-red-300"
                            : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                        }`}
                      >
                        {r.name}
                        {occupied && !repair && <span className="absolute -top-1 -right-1 w-2 h-2 bg-red-500 rounded-full" />}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Čas příjezdu</label>
                <input
                  type="time"
                  value={selectedTime}
                  onChange={(e) => setSelectedTime(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-base focus:outline-none focus:ring-2 focus:ring-[#065A82]"
                />
              </div>
            </div>

            {rampConflict && (
              <div className="bg-red-50 border border-red-200 rounded-xl p-3 mb-4 flex items-start gap-2">
                <svg className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                </svg>
                <div>
                  <div className="text-sm font-semibold text-red-700">Rampa {selectedRamp} je obsazena!</div>
                  <div className="text-xs text-red-600 mt-0.5">
                    {rampConflict.name} · {rampConflict.spz} od {rampConflict.rampTime}
                  </div>
                </div>
              </div>
            )}

            <div className="bg-gray-50 rounded-xl p-3 mb-5">
              <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">Náhled SMS</div>
              <p className="text-sm text-gray-800">
                {buildRampSms(rampModal.lang as "cs" | "sk" | "pl" | "de", rampModal.name, selectedRamp, selectedTime)}
              </p>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => { setRampModal(null); setRampConflict(null); }}
                className="flex-1 border border-gray-300 text-gray-700 py-2.5 rounded-xl font-medium hover:bg-gray-50"
              >
                Zrušit
              </button>
              <button
                onClick={assignRamp}
                disabled={sending}
                className={`flex-1 text-white py-2.5 rounded-xl font-medium disabled:opacity-60 transition ${
                  rampConflict ? "bg-orange-500 hover:bg-orange-600" : "bg-[#1D9E75] hover:bg-[#178a64]"
                }`}
              >
                {sending ? "Odesílám..." : rampConflict ? "Přesto odeslat ⚠" : "Odeslat SMS"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function DriverRow({
  driver: d,
  occupiedRamps,
  onAssign,
  onDone,
}: {
  driver: Driver;
  occupiedRamps: Set<string>;
  onAssign: () => void;
  onDone: () => void;
}) {
  return (
    <div className="px-6 py-4 flex items-center gap-4 hover:bg-gray-50">
      <div className="w-10 h-10 rounded-full bg-[#065A82] text-white flex items-center justify-center font-bold text-sm flex-shrink-0">
        {d.num}
      </div>
      <div className="flex-1 min-w-0">
        <div className="font-medium text-gray-900">{d.name}</div>
        <div className="text-sm text-gray-500 flex gap-3 flex-wrap">
          <span>{d.spz}</span>
          <span>·</span>
          <span>{d.firm}</span>
          <span>·</span>
          <span>{TYPE_LABELS[d.type] ?? d.type}</span>
          {d.order && <><span>·</span><span>#{d.order}</span></>}
        </div>
      </div>
      <div className="flex items-center gap-3 flex-shrink-0">
        <div className="text-xs text-gray-400">
          {new Date(d.createdAt).toLocaleTimeString("cs-CZ", { hour: "2-digit", minute: "2-digit" })}
        </div>
        <StatusBadge status={d.status} ramp={d.ramp} rampTime={d.rampTime} />
        {d.status === "wait" && (
          <button
            onClick={onAssign}
            className="bg-[#065A82] text-white text-sm px-3 py-1.5 rounded-lg hover:bg-[#054a6b] transition"
          >
            Přidělit rampu
          </button>
        )}
        {d.status === "ramp" && (
          <button
            onClick={onDone}
            className="bg-gray-500 text-white text-sm px-3 py-1.5 rounded-lg hover:bg-gray-600 transition"
          >
            Hotovo ✓
          </button>
        )}
      </div>
    </div>
  );
}

function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
  const colors: Record<string, string> = {
    amber: "bg-amber-50 border-amber-200 text-amber-700",
    green: "bg-green-50 border-green-200 text-green-700",
    gray: "bg-gray-50 border-gray-200 text-gray-600",
  };
  return (
    <div className={`rounded-xl border p-4 ${colors[color]}`}>
      <div className="text-3xl font-black">{value}</div>
      <div className="text-sm font-medium mt-1">{label}</div>
    </div>
  );
}

function StatusBadge({ status, ramp, rampTime }: { status: string; ramp: string | null; rampTime: string | null }) {
  const styles: Record<string, string> = {
    wait: "bg-amber-100 text-amber-700",
    ramp: "bg-green-100 text-green-700",
    done: "bg-gray-100 text-gray-500",
  };
  return (
    <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${styles[status] ?? ""}`}>
      {status === "ramp" && ramp
        ? `Rampa ${ramp}${rampTime ? " · " + rampTime : ""}`
        : STATUS_LABELS[status] ?? status}
    </span>
  );
}
