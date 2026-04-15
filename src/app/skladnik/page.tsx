"use client";

import { useState, useRef, useEffect } from "react";
import { TruckDiagram, type GridState } from "@/components/TruckDiagram";

interface DriverInfo {
  id: number;
  num: number;
  name: string;
  firm: string;
  spz: string;
  spzTrailer?: string;
  vehicleType?: string;
  ramp?: string;
  status: string;
  warehouseConfirmedAt?: string;
  palletCount?: number;
  palletArrangement?: string;
  plombaType?: string;
}

const VEHICLE_LABELS: Record<string, string> = {
  tahac_navis: "Tahač + návěs",
  tahac: "Tahač solo",
  "dodavka_privěs": "Dodávka + přívěs",
  dodavka: "Dodávka",
  dodavka_plachta: "Dodávka plachta",
  jine: "Jiné",
};

export default function SkladnikPage() {
  const [token, setToken] = useState("");
  const [driver, setDriver] = useState<DriverInfo | null>(null);
  const [status, setStatus] = useState<"idle" | "ok" | "err" | "loading" | "done">("idle");
  const [errMsg, setErrMsg] = useState("");
  const [photos, setPhotos] = useState<string[]>([]);
  const [confirming, setConfirming] = useState(false);
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Auto-focus input on load
  useEffect(() => { inputRef.current?.focus(); }, []);

  async function handleScan(e: React.FormEvent) {
    e.preventDefault();
    const t = token.trim();
    if (!t) return;
    setStatus("loading");
    setDriver(null);
    setPhotos([]);
    setErrMsg("");

    try {
      const res = await fetch(`/api/verify/${encodeURIComponent(t)}`);
      const data = await res.json() as DriverInfo & { error?: string };
      if (!res.ok) {
        setStatus("err");
        setErrMsg(data.error ?? "Chyba");
        return;
      }
      // Check if driver is on ramp
      if (data.status !== "ramp") {
        setStatus("err");
        setErrMsg(`Řidič není na rampě (stav: ${data.status})`);
        return;
      }
      setDriver(data);
      setStatus(data.warehouseConfirmedAt ? "done" : "ok");
    } catch {
      setStatus("err");
      setErrMsg("Nepodařilo se ověřit");
    }
  }

  async function handlePhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !driver) return;

    setUploading(true);
    try {
      // Compress image client-side
      const compressed = await compressImage(file, 1200, 0.75);
      const base64 = compressed.split(",")[1]; // strip data:image/jpeg;base64,

      const res = await fetch(`/api/drivers/${driver.id}/photos`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: token.trim(), photoData: base64 }),
      });

      if (res.ok) {
        setPhotos((p) => [...p, compressed]);
      } else {
        const d = await res.json() as { error?: string };
        alert(d.error ?? "Chyba při nahrávání fotky");
      }
    } catch {
      alert("Nepodařilo se nahrát fotku");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function handleConfirm() {
    if (!driver) return;
    setConfirming(true);
    try {
      const res = await fetch(`/api/drivers/${driver.id}/warehouse-done`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: token.trim() }),
      });
      if (res.ok) {
        setStatus("done");
      } else {
        const d = await res.json() as { error?: string };
        alert(d.error ?? "Chyba");
      }
    } catch {
      alert("Chyba při potvrzování");
    } finally {
      setConfirming(false);
    }
  }

  function reset() {
    setToken("");
    setDriver(null);
    setStatus("idle");
    setErrMsg("");
    setPhotos([]);
    setTimeout(() => inputRef.current?.focus(), 100);
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white flex flex-col">
      {/* Header */}
      <header className="bg-gray-800 px-4 py-3 flex items-center gap-3 border-b border-gray-700">
        <div className="w-8 h-8 rounded-lg bg-[#065A82] flex items-center justify-center text-white font-bold text-sm">S</div>
        <div>
          <div className="font-bold text-sm">LGI Logistics — Pohled skladníka</div>
          <div className="text-xs text-gray-400">Naskenujte QR kód štítku řidiče</div>
        </div>
      </header>

      <main className="flex-1 p-4 max-w-lg mx-auto w-full">

        {/* Scan form */}
        <form onSubmit={handleScan} className="mb-6">
          <label className="block text-xs text-gray-400 uppercase tracking-wider mb-2">
            QR kód / ověřovací kód
          </label>
          <div className="flex gap-2">
            <input
              ref={inputRef}
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="Naskenujte nebo zadejte kód…"
              className="flex-1 bg-gray-800 border border-gray-600 rounded-xl px-4 py-3 text-white font-mono text-sm placeholder:text-gray-500 focus:outline-none focus:border-[#065A82]"
              autoComplete="off"
              autoCapitalize="none"
            />
            <button
              type="submit"
              disabled={status === "loading" || !token.trim()}
              className="bg-[#065A82] text-white px-4 py-3 rounded-xl font-bold disabled:opacity-50 transition hover:bg-blue-700"
            >
              {status === "loading" ? "…" : "Ověřit"}
            </button>
          </div>
        </form>

        {/* Error */}
        {status === "err" && (
          <div className="bg-red-900/60 border border-red-500 rounded-2xl p-6 text-center mb-4">
            <div className="text-6xl mb-3">🔴</div>
            <div className="text-2xl font-black text-red-400 mb-1">STOP</div>
            <div className="text-red-300">{errMsg}</div>
            <button onClick={reset} className="mt-4 text-sm text-gray-400 underline">Zkusit znovu</button>
          </div>
        )}

        {/* OK / Done */}
        {(status === "ok" || status === "done") && driver && (
          <div className={`rounded-2xl border-2 p-5 mb-4 ${status === "done" ? "bg-green-900/30 border-green-500" : "bg-gray-800 border-green-400"}`}>
            {/* Status banner */}
            <div className={`flex items-center gap-3 mb-4 pb-4 border-b ${status === "done" ? "border-green-700" : "border-gray-700"}`}>
              <div className="text-5xl">{status === "done" ? "✅" : "🟢"}</div>
              <div>
                <div className={`text-2xl font-black ${status === "done" ? "text-green-400" : "text-green-400"}`}>
                  {status === "done" ? "NAKLÁDKA POTVRZENA" : "SPRÁVNÝ KAMION"}
                </div>
                <div className="text-gray-400 text-sm">Rampa {driver.ramp ?? "—"}</div>
              </div>
            </div>

            {/* Driver details */}
            <div className="space-y-2 text-sm mb-4">
              <InfoRow label="Řidič" value={driver.name} />
              <InfoRow label="Firma" value={driver.firm} />
              <InfoRow label="SPZ tahač" value={driver.spz} mono />
              {driver.spzTrailer && <InfoRow label="SPZ přívěs" value={driver.spzTrailer} mono />}
              {driver.vehicleType && <InfoRow label="Typ vozidla" value={VEHICLE_LABELS[driver.vehicleType] ?? driver.vehicleType} />}
              <InfoRow label="Pořadové č." value={String(driver.num)} />
            </div>

            {/* Photos */}
            {status === "ok" && (
              <div className="mb-4">
                <div className="text-xs text-gray-400 uppercase tracking-wider mb-2">
                  Fotodokumentace nakládky ({photos.length}/5)
                </div>
                {photos.length > 0 && (
                  <div className="grid grid-cols-3 gap-2 mb-3">
                    {photos.map((src, i) => (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img key={i} src={src} alt={`foto ${i + 1}`} className="w-full aspect-square object-cover rounded-lg" />
                    ))}
                  </div>
                )}
                {photos.length < 5 && (
                  <>
                    <input
                      ref={fileRef}
                      type="file"
                      accept="image/*"
                      capture="environment"
                      onChange={handlePhoto}
                      className="hidden"
                    />
                    <button
                      onClick={() => fileRef.current?.click()}
                      disabled={uploading}
                      className="w-full border-2 border-dashed border-gray-600 rounded-xl py-3 text-gray-400 text-sm hover:border-gray-500 transition disabled:opacity-50"
                    >
                      {uploading ? "Nahrávám…" : "📷 Přidat fotku"}
                    </button>
                  </>
                )}
              </div>
            )}

            {/* Pallet arrangement */}
            {driver.palletArrangement && (() => {
              let grid: GridState = [];
              try { grid = JSON.parse(driver.palletArrangement) as GridState; } catch {}
              if (!grid.some(c => c === 1)) return null;
              return (
                <div className="mb-4 pt-4 border-t border-gray-700">
                  <div className="text-xs text-gray-400 uppercase tracking-wider mb-2">
                    Požadované rozložení palet
                    {driver.palletCount && <span className="ml-2 text-amber-400">({driver.palletCount} pal.)</span>}
                  </div>
                  <div className="bg-gray-800 rounded-xl p-3">
                    <TruckDiagram grid={grid} readonly compact />
                  </div>
                </div>
              );
            })()}

            {/* Plomba info */}
            {driver.plombaType && (
              <div className={`mb-4 px-3 py-2 rounded-lg text-sm font-medium ${driver.plombaType === "celni" ? "bg-purple-900/50 text-purple-300 border border-purple-700" : "bg-gray-700 text-gray-300"}`}>
                {driver.plombaType === "celni" ? "🛃 Celní plomba — kontaktujte zodpovědnou osobu" : "🔒 Bude plombováno běžnou plombou"}
              </div>
            )}

            {/* Confirm button */}
            {status === "ok" && (
              <button
                onClick={handleConfirm}
                disabled={confirming}
                className="w-full bg-green-600 hover:bg-green-500 text-white font-black text-lg py-4 rounded-xl transition disabled:opacity-50"
              >
                {confirming ? "Potvrzuji…" : "✓ Nakládka hotova — uvolnit rampu"}
              </button>
            )}

            {status === "done" && (
              <div className="mt-2 text-center">
                <div className="text-green-400 text-sm font-medium mb-3">✅ Nakládka potvrzena</div>
                {driver.plombaType && (
                  <div className="text-amber-400 text-xs mb-3">
                    ⚠ Vyčkejte příchodu plombovačky
                  </div>
                )}
                <button onClick={reset} className="w-full bg-gray-700 hover:bg-gray-600 text-white font-bold py-3 rounded-xl transition text-sm">
                  Další kamion →
                </button>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}

function InfoRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex justify-between gap-2">
      <span className="text-gray-500">{label}:</span>
      <span className={`font-semibold text-right ${mono ? "font-mono text-yellow-300" : "text-white"}`}>{value}</span>
    </div>
  );
}

// Compress image client-side before upload
function compressImage(file: File, maxWidth: number, quality: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const scale = Math.min(1, maxWidth / img.width);
        canvas.width = img.width * scale;
        canvas.height = img.height * scale;
        const ctx = canvas.getContext("2d")!;
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.onerror = reject;
      img.src = e.target?.result as string;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
