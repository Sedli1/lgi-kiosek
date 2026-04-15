"use client";

import { useEffect, useState, useCallback } from "react";

interface PlombaDriver {
  id: number;
  num: number;
  name: string;
  firm: string;
  spz: string;
  ramp: string | null;
  vehicleType: string | null;
  warehouseConfirmedAt: string | null;
  plombaType: string | null;
  plombaNum: string | null;
  plombaConfirmedAt: string | null;
  verifyToken: string | null;
}

interface PlombaModal {
  driver: PlombaDriver;
  type: "bezna" | "celni" | "";
  num: string;
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
    const t = setInterval(load, 15_000); // auto-refresh every 15s
    return () => clearInterval(t);
  }, [load]);

  async function confirm() {
    if (!modal || !modal.type) return;
    if (modal.type === "celni" && !modal.num.trim()) return;
    setModal(m => m ? { ...m, sending: true } : null);

    const res = await fetch(`/api/drivers/${modal.driver.id}/plomba`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        token: modal.driver.verifyToken,
        plombaType: modal.type,
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

        {awaiting.map(d => (
          <div key={d.id} className="bg-white rounded-2xl shadow border-2 border-amber-300 p-4">
            <div className="flex items-start justify-between mb-3">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="bg-[#065A82] text-white text-sm font-black px-2 py-0.5 rounded-lg">#{d.num}</span>
                  <span className="font-bold text-gray-900">{d.name}</span>
                </div>
                <div className="text-sm text-gray-500">{d.firm}</div>
              </div>
              <div className="text-right">
                <div className="font-mono font-bold text-gray-900">{d.spz}</div>
                {d.ramp && <div className="text-sm text-[#1D9E75] font-semibold">Rampa {d.ramp}</div>}
              </div>
            </div>

            {d.warehouseConfirmedAt && (
              <div className="text-xs text-gray-400 mb-3">
                Nakládka hotova: {new Date(d.warehouseConfirmedAt).toLocaleTimeString("cs-CZ", { hour: "2-digit", minute: "2-digit" })}
              </div>
            )}

            <button
              onClick={() => setModal({ driver: d, type: "", num: "", sending: false })}
              className="w-full bg-amber-500 hover:bg-amber-400 text-white font-bold py-3 rounded-xl transition text-sm"
            >
              🔒 Zapsat plombu
            </button>
          </div>
        ))}

        {done.length > 0 && (
          <div className="mt-6">
            <div className="text-xs text-gray-400 uppercase tracking-wider mb-2">Nedávno plombováno</div>
            <div className="space-y-2">
              {done.map(d => (
                <div key={d.id} className="bg-white rounded-xl border border-gray-200 px-4 py-3 flex items-center justify-between">
                  <div>
                    <span className="font-medium text-gray-900">{d.spz}</span>
                    <span className="text-gray-400 text-sm ml-2">{d.firm}</span>
                  </div>
                  <div className="text-right text-sm">
                    <div className={`font-medium ${d.plombaType === "celni" ? "text-purple-600" : "text-green-600"}`}>
                      {d.plombaType === "celni" ? `Celní č. ${d.plombaNum}` : "Běžná"}
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
      {modal && (
        <div className="fixed inset-0 bg-black/50 flex items-end justify-center z-50 p-0">
          <div className="bg-white rounded-t-3xl w-full max-w-lg p-6 pb-8">
            <div className="text-center mb-1">
              <div className="text-2xl font-black text-gray-900">Typ plomby</div>
              <div className="text-gray-500 text-sm">{modal.driver.spz} · Rampa {modal.driver.ramp}</div>
            </div>

            <div className="grid grid-cols-2 gap-3 my-5">
              <button
                onClick={() => setModal(m => m ? { ...m, type: "bezna", num: "" } : null)}
                className={`py-5 rounded-2xl border-2 font-bold text-lg transition ${modal.type === "bezna" ? "bg-green-600 text-white border-green-600" : "bg-white text-gray-700 border-gray-200 hover:border-green-400"}`}
              >
                🔒<br /><span className="text-sm">Běžná</span>
              </button>
              <button
                onClick={() => setModal(m => m ? { ...m, type: "celni" } : null)}
                className={`py-5 rounded-2xl border-2 font-bold text-lg transition ${modal.type === "celni" ? "bg-purple-600 text-white border-purple-600" : "bg-white text-gray-700 border-gray-200 hover:border-purple-400"}`}
              >
                🛃<br /><span className="text-sm">Celní</span>
              </button>
            </div>

            {modal.type === "celni" && (
              <div className="mb-4">
                <label className="block text-sm font-semibold text-gray-700 mb-2">Číslo celní plomby *</label>
                <input
                  value={modal.num}
                  onChange={e => setModal(m => m ? { ...m, num: e.target.value } : null)}
                  placeholder="např. CZ12345678"
                  className="w-full border-2 border-purple-300 rounded-xl px-4 py-3 text-lg font-mono focus:outline-none focus:border-purple-500"
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
                disabled={!modal.type || (modal.type === "celni" && !modal.num.trim()) || modal.sending}
                className="flex-1 bg-[#065A82] text-white py-3 rounded-xl font-bold disabled:opacity-40"
              >
                {modal.sending ? "Ukládám…" : "Potvrdit plombu"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
