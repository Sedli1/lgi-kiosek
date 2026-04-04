"use client";

import { useEffect, useState, useCallback } from "react";
import { buildRampSms, buildConfirmSms } from "@/lib/sms-client";

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
  createdAt: string;
  smsLogs: SmsLog[];
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

export default function OperatorPage() {
  const [drivers, setDrivers] = useState<Driver[]>([]);
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
  const [sending, setSending] = useState(false);

  const fetchDrivers = useCallback(async () => {
    const res = await fetch(`/api/drivers?pass=${encodeURIComponent(password)}`, {
      headers: { "x-operator-pass": password },
    });
    if (res.ok) setDrivers(await res.json());
  }, [authed, password]);

  // Auto-login when ?pass= is in the URL
  useEffect(() => {
    const urlPass = new URLSearchParams(window.location.search).get("pass");
    if (urlPass && urlPass.length >= 3 && !authed) {
      setAuthed(true);
    }
  }, [authed]);

  useEffect(() => {
    if (!authed) return;
    fetchDrivers();
    const interval = setInterval(fetchDrivers, 5000);
    return () => clearInterval(interval);
  }, [authed, fetchDrivers]);

  function handleAuth(e: React.FormEvent) {
    e.preventDefault();
    // Simple client-side check; server validates too
    if (password.length >= 3) {
      setAuthed(true);
      setAuthError(false);
    } else {
      setAuthError(true);
    }
  }

  async function assignRamp() {
    if (!rampModal) return;
    setSending(true);
    await fetch(`/api/drivers/${rampModal.id}/ramp?pass=${encodeURIComponent(password)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", "x-operator-pass": password },
      body: JSON.stringify({ ramp: selectedRamp }),
    });
    setSending(false);
    setRampModal(null);
    fetchDrivers();
  }

  async function markDone(id: number) {
    await fetch(`/api/drivers/${id}/done?pass=${encodeURIComponent(password)}`, {
      method: "PATCH",
      headers: { "x-operator-pass": password },
    });
    fetchDrivers();
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
          <button
            type="submit"
            className="w-full bg-[#065A82] text-white font-semibold py-3 rounded-xl hover:bg-[#054a6b] transition"
          >
            Přihlásit
          </button>
        </form>
      </div>
    );
  }

  const waiting = drivers.filter((d) => d.status === "wait").length;
  const onRamp = drivers.filter((d) => d.status === "ramp").length;
  const done = drivers.filter((d) => d.status === "done").length;

  const allLogs = drivers
    .flatMap((d) => d.smsLogs.map((l) => ({ ...l, driverName: d.name, spz: d.spz })))
    .sort((a, b) => new Date(b.sentAt).getTime() - new Date(a.sentAt).getTime())
    .slice(0, 20);

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Header */}
      <header className="bg-[#065A82] text-white px-6 py-4 flex items-center justify-between">
        <h1 className="text-xl font-bold">LGI – Operátorský panel</h1>
        <button onClick={() => setAuthed(false)} className="text-blue-200 text-sm hover:text-white">
          Odhlásit
        </button>
      </header>

      <div className="max-w-6xl mx-auto p-6 space-y-6">
        {/* Stats */}
        <div className="grid grid-cols-3 gap-4">
          <StatCard label="Čeká" value={waiting} color="amber" />
          <StatCard label="Na rampě" value={onRamp} color="green" />
          <StatCard label="Hotovo dnes" value={done} color="gray" />
        </div>

        {/* Driver list */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
            <h2 className="font-semibold text-gray-900">Registrovaní řidiči</h2>
            <button onClick={fetchDrivers} className="text-sm text-[#065A82] hover:underline">
              Obnovit
            </button>
          </div>
          {drivers.length === 0 ? (
            <div className="px-6 py-10 text-center text-gray-400">Žádní registrovaní řidiči</div>
          ) : (
            <div className="divide-y divide-gray-100">
              {drivers.map((d) => (
                <div key={d.id} className="px-6 py-4 flex items-center gap-4 hover:bg-gray-50">
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
                    <StatusBadge status={d.status} ramp={d.ramp} />
                    {d.status === "wait" && (
                      <button
                        onClick={() => { setRampModal(d); setSelectedRamp("1"); }}
                        className="bg-[#065A82] text-white text-sm px-3 py-1.5 rounded-lg hover:bg-[#054a6b] transition"
                      >
                        Přidělit rampu
                      </button>
                    )}
                    {d.status === "ramp" && (
                      <button
                        onClick={() => markDone(d.id)}
                        className="bg-gray-500 text-white text-sm px-3 py-1.5 rounded-lg hover:bg-gray-600 transition"
                      >
                        Hotovo
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* SMS Log */}
        {allLogs.length > 0 && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100">
              <h2 className="font-semibold text-gray-900">Log odeslaných SMS</h2>
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
            <p className="text-gray-500 text-sm mb-4">
              {rampModal.name} · {rampModal.spz}
            </p>

            <label className="block text-sm font-medium text-gray-700 mb-2">Číslo rampy</label>
            <div className="flex gap-2 mb-5">
              {["1", "2", "3", "4", "5", "6"].map((r) => (
                <button
                  key={r}
                  onClick={() => setSelectedRamp(r)}
                  className={`w-10 h-10 rounded-lg font-bold text-sm transition ${
                    selectedRamp === r
                      ? "bg-[#065A82] text-white"
                      : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                  }`}
                >
                  {r}
                </button>
              ))}
            </div>

            <div className="bg-gray-50 rounded-xl p-3 mb-5">
              <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">Náhled SMS</div>
              <p className="text-sm text-gray-800">
                {buildRampSms(
                  rampModal.lang as "cs" | "sk" | "pl" | "de",
                  rampModal.name,
                  selectedRamp,
                  new Date().toLocaleTimeString("cs-CZ", { hour: "2-digit", minute: "2-digit" })
                )}
              </p>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setRampModal(null)}
                className="flex-1 border border-gray-300 text-gray-700 py-2.5 rounded-xl font-medium hover:bg-gray-50"
              >
                Zrušit
              </button>
              <button
                onClick={assignRamp}
                disabled={sending}
                className="flex-1 bg-[#1D9E75] text-white py-2.5 rounded-xl font-medium hover:bg-[#178a64] disabled:opacity-60 transition"
              >
                {sending ? "Odesílám..." : "Odeslat SMS"}
              </button>
            </div>
          </div>
        </div>
      )}
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

function StatusBadge({ status, ramp }: { status: string; ramp: string | null }) {
  const styles: Record<string, string> = {
    wait: "bg-amber-100 text-amber-700",
    ramp: "bg-green-100 text-green-700",
    done: "bg-gray-100 text-gray-500",
  };
  return (
    <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${styles[status] ?? ""}`}>
      {status === "ramp" && ramp ? `Rampa ${ramp}` : STATUS_LABELS[status] ?? status}
    </span>
  );
}
