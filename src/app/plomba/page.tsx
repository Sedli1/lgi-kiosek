"use client";

import { useEffect, useState, useCallback } from "react";

interface PlombaDriver {
  id: number;
  num: number;
  name: string;
  firm: string;
  spz: string;
  ramp: string | null;
  plombaType: string | null;
  plombaNum: string | null;
  plombaConfirmedAt: string | null;
  warehouseConfirmedAt: string | null;
  verifyToken: string | null;
}

interface PlombaModal {
  driver: PlombaDriver;
  num: string;   // plomba number — pre-filled from system, editable
  sending: boolean;
}

export default function PlombaPage() {
  const [awaiting, setAwaiting] = useState<PlombaDriver[]>([]);
  const [done, setDone] = useState<PlombaDriver[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<PlombaModal | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/plomba");
    if (res.ok) {
      const d = await res.json() as { awaiting: PlombaDriver[]; done: PlombaDriver[] };
      setAwaiting(d.awaiting);
      setDone(d.done);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 15_000);
    return () => clearInterval(t);
  }, [load]);

  function openModal(d: PlombaDriver) {
    setModal({ driver: d, num: d.plombaNum ?? "", sending: false });
  }

  async function confirm() {
    if (!modal) return;
    const type = modal.driver.plombaType;
    if (!type || type === "zadna") return;
    if (type === "celni" && !modal.num.trim()) return;

    setModal(m => m ? { ...m, sending: true } : null);

    const res = await fetch(`/api/drivers/${modal.driver.id}/plomba`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        token: modal.driver.verifyToken,
        plombaType: type,
        plombaNum: modal.num.trim() || undefined,
      }),
    });

    if (res.ok) {
      setModal(null);
      load();
    } else {
      const d = await res.json() as { error?: string };
      alert(d.error ?? "Chyba");
      setModal(m => m ? { ...m, sending: false } : null);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-[#065A82] text-white px-4 py-4">
        <div className="max-w-lg mx-auto">
          <div className="text-xs text-blue-200 uppercase tracking-widest mb-0.5">LGI Logistics</div>
          <h1 className="text-2xl font-black">Plombování</h1>
          <p className="text-blue-200 text-sm">Kamiony čekající na plombu</p>
        </div>
      </header>

      <main className="max-w-lg mx-auto p-4 space-y-4">
        {loading && <div className="text-center text-gray-400 py-8">Načítám…</div>}

        {!loading && awaiting.length === 0 && (
          <div className="text-center py-12">
            <div className="text-5xl mb-3">✅</div>
            <div className="text-gray-500 font-medium">Žádné kamiony nečekají na plombu</div>
            <div className="text-gray-400 text-sm mt-1">Stránka se obnoví automaticky</div>
          </div>
        )}

        {awaiting.map(d => {
          const isCelni = d.plombaType === "celni";
          return (
            <div key={d.id} className={`bg-white rounded-2xl shadow border-2 p-4 ${isCelni ? "border-purple-400" : "border-amber-300"}`}>
              {/* Ramp — biggest element */}
              <div className={`rounded-xl px-4 py-3 mb-3 flex items-center justify-between ${isCelni ? "bg-purple-700" : "bg-[#065A82]"}`}>
                <div className="text-white">
                  <div className="text-xs uppercase tracking-widest opacity-70">Jděte na rampu</div>
                  <div className="text-5xl font-black leading-none">{d.ramp ?? "—"}</div>
                </div>
                <div className="text-right">
                  <div className={`inline-flex items-center gap-1.5 text-sm font-bold px-3 py-1.5 rounded-lg ${isCelni ? "bg-purple-500 text-white" : "bg-white/20 text-white"}`}>
                    {isCelni ? "🛃 Celní" : "🔒 Běžná"}
                  </div>
                </div>
              </div>

              {/* Driver info */}
              <div className="flex items-start justify-between mb-3">
                <div>
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="bg-gray-200 text-gray-700 text-xs font-black px-2 py-0.5 rounded-lg">#{d.num}</span>
                    <span className="font-bold text-gray-900">{d.name}</span>
                  </div>
                  <div className="text-sm text-gray-500">{d.firm}</div>
                </div>
                <div className="font-mono font-bold text-gray-900 text-sm">{d.spz}</div>
              </div>

              {d.warehouseConfirmedAt && (
                <div className="text-xs text-gray-400 mb-3">
                  Nakládka hotova: {new Date(d.warehouseConfirmedAt).toLocaleTimeString("cs-CZ", { hour: "2-digit", minute: "2-digit" })}
                </div>
              )}

              <button
                onClick={() => openModal(d)}
                className={`w-full text-white font-bold py-3 rounded-xl transition text-sm ${isCelni ? "bg-purple-600 hover:bg-purple-500" : "bg-amber-500 hover:bg-amber-400"}`}
              >
                {isCelni ? "🛃 Zapsat celní plombu" : "🔒 Potvrdit plombu"}
              </button>
            </div>
          );
        })}

        {done.length > 0 && (
          <div className="mt-6">
            <div className="text-xs text-gray-400 uppercase tracking-wider mb-2">Nedávno plombováno</div>
            <div className="space-y-2">
              {done.map(d => (
                <div key={d.id} className="bg-white rounded-xl border border-gray-200 px-4 py-3 flex items-center justify-between">
                  <div>
                    <span className="font-medium text-gray-900">{d.spz}</span>
                    <span className="text-gray-400 text-sm ml-2">{d.firm}</span>
                    {d.ramp && <span className="text-gray-400 text-sm ml-2">· Rampa {d.ramp}</span>}
                  </div>
                  <div className="text-right text-sm">
                    <div className={`font-medium ${d.plombaType === "celni" ? "text-purple-600" : "text-green-600"}`}>
                      {d.plombaType === "celni" ? `Celní ${d.plombaNum ? `č. ${d.plombaNum}` : ""}` : "Běžná"}
                    </div>
                    {d.plombaConfirmedAt && (
                      <div className="text-gray-400 text-xs">
                        {new Date(d.plombaConfirmedAt).toLocaleTimeString("cs-CZ", { hour: "2-digit", minute: "2-digit" })}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>

      {/* Modal */}
      {modal && (() => {
        const d = modal.driver;
        const isCelni = d.plombaType === "celni";
        const canConfirm = !isCelni || modal.num.trim().length > 0;

        return (
          <div className="fixed inset-0 bg-black/50 flex items-end justify-center z-50">
            <div className="bg-white rounded-t-3xl w-full max-w-lg p-6 pb-8">

              {/* Destination */}
              <div className={`rounded-2xl px-5 py-4 mb-5 text-center ${isCelni ? "bg-purple-700" : "bg-[#065A82]"}`}>
                <div className="text-white/70 text-xs uppercase tracking-widest mb-1">Jděte na rampu</div>
                <div className="text-white text-7xl font-black leading-none">{d.ramp ?? "—"}</div>
                <div className="text-white/80 text-sm mt-1">{d.spz} · {d.name}</div>
              </div>

              {/* Type badge */}
              <div className="flex items-center justify-center gap-2 mb-4">
                <span className={`text-sm font-bold px-4 py-2 rounded-full ${isCelni ? "bg-purple-100 text-purple-700" : "bg-green-100 text-green-700"}`}>
                  {isCelni ? "🛃 Celní plomba" : "🔒 Běžná plomba"}
                </span>
              </div>

              {/* Plomba number */}
              {isCelni && (
                <div className="mb-5">
                  <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                    Číslo celní plomby
                    {d.plombaNum && <span className="ml-2 text-xs font-normal text-gray-400">(přednastaveno operátorem)</span>}
                  </label>
                  <input
                    value={modal.num}
                    onChange={e => setModal(m => m ? { ...m, num: e.target.value } : null)}
                    placeholder="např. CZ12345678"
                    className="w-full border-2 border-purple-300 rounded-xl px-4 py-3 text-xl font-mono font-bold tracking-widest focus:outline-none focus:border-purple-500"
                    autoFocus
                  />
                </div>
              )}

              <div className="flex gap-3">
                <button
                  onClick={() => setModal(null)}
                  className="flex-1 border border-gray-300 text-gray-700 py-3 rounded-xl font-medium"
                >
                  Zrušit
                </button>
                <button
                  onClick={confirm}
                  disabled={!canConfirm || modal.sending}
                  className={`flex-1 text-white py-3 rounded-xl font-bold disabled:opacity-40 ${isCelni ? "bg-purple-600 hover:bg-purple-500" : "bg-green-600 hover:bg-green-500"}`}
                >
                  {modal.sending ? "Ukládám…" : "✓ Potvrdit plombu"}
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
