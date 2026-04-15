"use client";

import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";

interface DriverInfo {
  id: number;
  num: number;
  name: string;
  firm: string;
  spz: string;
  spzTrailer?: string;
  vehicleType?: string;
  ramp?: string;
  verifyToken: string;
}

const VEHICLE_LABELS: Record<string, string> = {
  tahac_navis: "Tahač + návěs",
  tahac: "Tahač solo",
  dodavka_privěs: "Dodávka + přívěs",
  dodavka: "Dodávka",
  dodavka_plachta: "Dodávka plachta",
  jine: "Jiné",
};

export default function PrintPage() {
  const { id } = useParams<{ id: string }>();
  const [driver, setDriver] = useState<DriverInfo | null>(null);
  const [error, setError] = useState("");
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    fetch(`/api/print/${id}`)
      .then((r) => r.json())
      .then((d: unknown) => {
        const data = d as DriverInfo & { error?: string };
        if (data.error) { setError(data.error); return; }
        setDriver(data);
      })
      .catch(() => setError("Nepodařilo se načíst data"));
  }, [id]);

  useEffect(() => {
    if (!driver?.verifyToken || !canvasRef.current) return;

    // Generate QR code then auto-print
    import("qrcode").then((QRCode) => {
      QRCode.toCanvas(canvasRef.current!, driver.verifyToken, {
        width: 200,
        margin: 2,
        color: { dark: "#000000", light: "#ffffff" },
      }).then(() => {
        setTimeout(() => {
          window.print();
          // If opened as popup from kiosk, close after print dialog dismisses
          if (window.opener) setTimeout(() => window.close(), 500);
        }, 300);
      });
    });
  }, [driver]);

  if (error) return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center text-red-600">
        <p className="text-xl font-bold">Chyba</p>
        <p className="text-sm mt-1">{error}</p>
      </div>
    </div>
  );

  if (!driver) return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-gray-500">Načítám…</div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col items-center justify-center p-6 print:bg-white print:p-0">
      {/* Print button — hidden when printing */}
      <div className="mb-6 flex gap-3 print:hidden">
        <button
          onClick={() => window.print()}
          className="bg-[#065A82] text-white px-6 py-3 rounded-xl font-bold text-lg shadow hover:bg-blue-800 transition"
        >
          🖨 Vytisknout štítek
        </button>
        <button
          onClick={() => window.history.back()}
          className="bg-gray-200 text-gray-700 px-6 py-3 rounded-xl font-bold text-lg hover:bg-gray-300 transition"
        >
          ← Zpět
        </button>
      </div>

      {/* Ticket */}
      <div
        id="ticket"
        className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-sm border-2 border-gray-200 print:shadow-none print:rounded-none print:border-0 print:max-w-full print:p-4"
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-4 pb-3 border-b-2 border-gray-200">
          <div>
            <div className="text-xs text-gray-400 uppercase tracking-widest">LGI Logistics</div>
            <div className="text-2xl font-black text-[#065A82]">Štítek nakládky</div>
          </div>
          <div className="bg-[#065A82] text-white rounded-xl px-3 py-2 text-center">
            <div className="text-xs opacity-70">č.</div>
            <div className="text-3xl font-black leading-none">{driver.num}</div>
          </div>
        </div>

        {/* Driver info */}
        <div className="space-y-2 mb-4 text-sm">
          <Row label="Řidič" value={driver.name} />
          <Row label="Firma" value={driver.firm} />
          <Row label="SPZ tahač" value={driver.spz} mono />
          {driver.spzTrailer && <Row label="SPZ přívěs" value={driver.spzTrailer} mono />}
          {driver.vehicleType && <Row label="Typ vozidla" value={VEHICLE_LABELS[driver.vehicleType] ?? driver.vehicleType} />}
          {driver.ramp && <Row label="Rampa" value={driver.ramp} highlight />}
        </div>

        {/* QR code */}
        <div className="flex flex-col items-center mt-4 pt-4 border-t border-gray-200">
          <canvas ref={canvasRef} className="rounded-lg" />
          <p className="text-xs text-gray-400 mt-2 text-center">
            Naskenujte pro ověření nakládky
          </p>
          <p className="text-[10px] text-gray-300 font-mono mt-1">{driver.verifyToken}</p>
        </div>

        {/* Date */}
        <div className="text-center text-xs text-gray-400 mt-3">
          {new Date().toLocaleDateString("cs-CZ", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })}
        </div>
      </div>

      <style>{`
        @media print {
          body { margin: 0; }
          .print\\:hidden { display: none !important; }
        }
      `}</style>
    </div>
  );
}

function Row({ label, value, mono, highlight }: { label: string; value: string; mono?: boolean; highlight?: boolean }) {
  return (
    <div className="flex justify-between items-baseline gap-2">
      <span className="text-gray-500 flex-shrink-0">{label}:</span>
      <span className={`font-semibold text-right ${mono ? "font-mono" : ""} ${highlight ? "text-[#1D9E75] text-base" : "text-gray-900"}`}>
        {value}
      </span>
    </div>
  );
}
