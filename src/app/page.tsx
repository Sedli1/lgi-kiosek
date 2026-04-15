"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { T, Lang } from "@/lib/i18n";
import { TruckDiagram, emptyGrid, type GridState } from "@/components/TruckDiagram";
import { VehicleIcon } from "@/components/VehicleIcon";

// ── Types ─────────────────────────────────────────────────

interface ConfirmData { num: number; confirmSms: string; driverId: number; }
type FormField = "name" | "phone" | "spz" | "firm" | "order";

const VEHICLE_TYPES = [
  { value: "tahac_navis",    label: "Tahač + návěs"    },
  { value: "tahac",          label: "Tahač solo"        },
  { value: "dodavka_privěs", label: "Dodávka + přívěs" },
  { value: "dodavka",        label: "Dodávka"           },
  { value: "dodavka_plachta",label: "Plachta"           },
  { value: "jine",           label: "Jiné"              },
] as const;
type FormValues = Record<FormField, string>;
const RESET_SECONDS = 90;
const OFFLINE_QUEUE_KEY = "lgi-offline-queue";

// ── Language metadata ──────────────────────────────────────

const LANG_META: Record<Lang, { name: string; dialCode: string }> = {
  cs: { name: "Čeština",    dialCode: "+420" },
  sk: { name: "Slovenčina", dialCode: "+421" },
  pl: { name: "Polski",     dialCode: "+48"  },
  de: { name: "Deutsch",    dialCode: "+49"  },
};

// ── Flag SVGs ─────────────────────────────────────────────

function FlagIcon({ code, size = 40 }: { code: string; size?: number }) {
  const h = Math.round(size * 0.667);
  const flags: Record<string, React.ReactNode> = {
    cs: (
      <svg width={size} height={h} viewBox="0 0 3 2" xmlns="http://www.w3.org/2000/svg">
        <rect width="3" height="1" fill="#fff"/>
        <rect y="1" width="3" height="1" fill="#D7141A"/>
        <polygon points="0,0 1.5,1 0,2" fill="#11457E"/>
      </svg>
    ),
    sk: (
      <svg width={size} height={h} viewBox="0 0 3 2" xmlns="http://www.w3.org/2000/svg">
        <rect width="3" height="0.667" fill="#fff"/>
        <rect y="0.667" width="3" height="0.667" fill="#0B4EA2"/>
        <rect y="1.333" width="3" height="0.667" fill="#EE1C25"/>
        <rect x="0.2" y="0.3" width="0.25" height="0.9" fill="#fff"/>
        <rect x="0.075" y="0.625" width="0.5" height="0.25" fill="#fff"/>
      </svg>
    ),
    pl: (
      <svg width={size} height={h} viewBox="0 0 3 2" xmlns="http://www.w3.org/2000/svg">
        <rect width="3" height="1" fill="#fff"/>
        <rect y="1" width="3" height="1" fill="#DC143C"/>
      </svg>
    ),
    de: (
      <svg width={size} height={h} viewBox="0 0 3 2" xmlns="http://www.w3.org/2000/svg">
        <rect width="3" height="0.667" fill="#000"/>
        <rect y="0.667" width="3" height="0.667" fill="#DD0000"/>
        <rect y="1.333" width="3" height="0.667" fill="#FFCE00"/>
      </svg>
    ),
  };
  return (
    <span className="rounded overflow-hidden inline-flex border border-black/10 flex-shrink-0">
      {flags[code] ?? null}
    </span>
  );
}

// ── Validation ────────────────────────────────────────────

function validateField(field: FormField, value: string): string | null {
  if (field === "name" && (!value || value.trim().length < 2)) return "Jméno musí mít alespoň 2 znaky";
  if (field === "phone" && value.replace(/\D/g, "").length < 7) return "Neplatné číslo";
  if (field === "spz" && (!value || value.trim().length < 2)) return "Neplatná SPZ";
  if (field === "firm" && (!value || value.trim().length < 2)) return "Povinné pole";
  return null;
}

// ── Main component ────────────────────────────────────────

export default function KioskPage() {
  const router = useRouter();
  const [lang, setLang] = useState<Lang | null>(null);
  const [confirmed, setConfirmed] = useState<ConfirmData | null>(null);
  const [loading, setLoading] = useState(false);
  const [values, setValues] = useState<FormValues>({ name: "", phone: "", spz: "", firm: "", order: "" });
  const [spzTrailer, setSpzTrailer] = useState("");
  const [dialCode, setDialCode] = useState("+420");
  const [typeValue, setTypeValue] = useState("");
  const [vehicleType, setVehicleType] = useState("");
  const [palletGrid, setPalletGrid] = useState<GridState>(emptyGrid());
  const [touched, setTouched] = useState<Set<FormField>>(new Set());
  const [countdown, setCountdown] = useState(RESET_SECONDS);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isOnline, setIsOnline] = useState(true);

  const t = lang ? T[lang] : T.cs;

  // Service worker
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
    setIsOnline(navigator.onLine);
    const on = () => { setIsOnline(true); flushOfflineQueue(); };
    const off = () => setIsOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => { window.removeEventListener("online", on); window.removeEventListener("offline", off); };
  }, []);

  const flushOfflineQueue = useCallback(async () => {
    const raw = localStorage.getItem(OFFLINE_QUEUE_KEY);
    if (!raw) return;
    const queue: object[] = JSON.parse(raw);
    const remaining: object[] = [];
    for (const item of queue) {
      try {
        const res = await fetch("/api/drivers", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(item) });
        if (!res.ok) remaining.push(item);
      } catch { remaining.push(item); }
    }
    localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(remaining));
  }, []);

  // Fullscreen listener
  useEffect(() => {
    const h = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", h);
    return () => document.removeEventListener("fullscreenchange", h);
  }, []);

  // Auto-reset countdown
  useEffect(() => {
    if (!confirmed) return;
    setCountdown(RESET_SECONDS);
    const interval = setInterval(() => {
      setCountdown((s) => {
        if (s <= 1) { clearInterval(interval); resetAll(); return RESET_SECONDS; }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [confirmed]);

  function resetAll() {
    setConfirmed(null);
    setLang(null);
    setValues({ name: "", phone: "", spz: "", firm: "", order: "" });
    setSpzTrailer("");
    setTypeValue("");
    setVehicleType("");
    setPalletGrid(emptyGrid());
    setTouched(new Set());
  }

  function toggleFullscreen() {
    if (!document.fullscreenElement) document.documentElement.requestFullscreen().catch(() => {});
    else document.exitFullscreen().catch(() => {});
  }

  // When language changes, auto-set dial code
  function selectLang(l: Lang) {
    setLang(l);
    setDialCode(LANG_META[l].dialCode);
  }

  // Direct input typing (hardware keyboard / native)
  function handleInputChange(field: FormField, raw: string) {
    let val = raw;
    if (field === "spz") val = val.toUpperCase();
    setValues((v) => ({ ...v, [field]: val }));
    setTouched((t) => new Set(t).add(field));
  }

  // Submit
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!lang) return;
    const requiredFields: FormField[] = ["name", "phone", "spz", "firm"];
    const allTouched = new Set([...touched, ...requiredFields]);
    setTouched(allTouched);

    const hasErrors = requiredFields.some((f) => validateField(f, values[f]) !== null) || !typeValue;
    if (hasErrors) return;

    setLoading(true);

    const phone = values.phone.startsWith("+") ? values.phone : `${dialCode}${values.phone}`;
    const palletArrangement = palletGrid.some(c => c === 1) ? JSON.stringify(palletGrid) : undefined;
    const payload = { name: values.name.trim(), phone, spz: values.spz.trim(), spzTrailer: spzTrailer.trim() || undefined, firm: values.firm.trim(), order: values.order.trim(), type: typeValue, lang, vehicleType: vehicleType || undefined, palletArrangement };

    if (!navigator.onLine) {
      const queue = JSON.parse(localStorage.getItem(OFFLINE_QUEUE_KEY) ?? "[]");
      queue.push(payload);
      localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(queue));
      setLoading(false);
      setConfirmed({ num: 0, confirmSms: "Registrace uložena offline. Bude odeslaná po obnovení připojení.", driverId: 0 });
      return;
    }

    try {
      const res = await fetch("/api/drivers", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      if (res.ok) {
        const data = (await res.json()) as { id: number; num: number; confirmSms: string };
        // Open print in new window (auto-prints, auto-closes) — kiosk resets immediately
        window.open(`/print/${data.id}`, "_blank");
        resetAll();
      }
    } finally {
      setLoading(false);
    }
  }

  // ── Language selection screen ──────────────────────────

  if (!lang) {
    return (
      <div className="min-h-screen bg-[#065A82] flex flex-col items-center justify-center p-8 relative">
        <button
          onClick={toggleFullscreen}
          className="absolute top-4 right-4 p-2 rounded-lg bg-blue-700/60 text-white"
          title="Kiosk mód"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15" />
          </svg>
        </button>

        <div className="text-center mb-8">
          {/* Truck icon */}
          <div className="mb-6 flex justify-center">
            <div className="w-24 h-24 rounded-3xl bg-white/10 flex items-center justify-center">
              <svg className="w-14 h-14 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 18.75a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 01-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h1.125c.621 0 1.129-.504 1.09-1.124a17.902 17.902 0 00-3.213-9.193 2.056 2.056 0 00-1.58-.86H14.25M16.5 18.75h-2.25m0-11.177v-.958c0-.568-.422-1.048-.987-1.106a48.554 48.554 0 00-10.026 0 1.106 1.106 0 00-.987 1.106v7.635m12-6.677v6.677m0 4.5v-4.5m0 0h-12" />
              </svg>
            </div>
          </div>
          <div className="text-white/60 text-xs uppercase tracking-widest mb-2">LGI Logistics · Driver Registration</div>
          <h1 className="text-white text-5xl font-black mb-3">Vítejte!</h1>
          <p className="text-blue-100 text-xl font-medium mb-1">Zaregistrujte se k vykládce nebo nakládce.</p>
          <p className="text-blue-300 text-base mb-4">Prosím zvolte jazyk / Please select your language</p>
          <div className="text-blue-200/60 text-sm space-y-0.5">
            <div>Witamy! Zarejestruj się do rozładunku.</div>
            <div>Willkommen! Bitte melden Sie sich zur Be-/Entladung an.</div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 w-full max-w-lg">
          {(["cs","sk","pl","de"] as Lang[]).map((code) => (
            <button
              key={code}
              onClick={() => selectLang(code)}
              className="flex flex-col items-center gap-3 bg-white rounded-2xl p-6 shadow-lg active:scale-95 transition-transform hover:bg-blue-50"
            >
              <FlagIcon code={code} size={64} />
              <div className="text-xl font-bold text-gray-900">{LANG_META[code].name}</div>
            </button>
          ))}
        </div>

        {!isOnline && (
          <div className="mt-6 text-orange-300 text-sm">⚠ Offline režim</div>
        )}
      </div>
    );
  }

  // ── Confirmation screen ────────────────────────────────

  if (confirmed) {
    const pct = (countdown / RESET_SECONDS) * 100;
    const r = 48;
    const circ = 2 * Math.PI * r;
    const dash = (pct / 100) * circ;

    return (
      <div className="min-h-screen bg-[#065A82] flex flex-col items-center justify-center p-6">
        <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg p-8 text-center">
          <div className="w-24 h-24 rounded-full bg-[#1D9E75] flex items-center justify-center mx-auto mb-6 shadow-lg">
            <svg className="w-14 h-14 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
            </svg>
          </div>

          <h1 className="text-3xl font-bold text-gray-900 mb-2">{t.confirmTitle}</h1>

          {confirmed.num > 0 && (
            <div className="bg-[#065A82] text-white rounded-2xl px-10 py-5 my-5 inline-block">
              <div className="text-sm uppercase tracking-widest opacity-70 mb-1">{t.confirmNum}</div>
              <div className="text-8xl font-black leading-none">{confirmed.num}</div>
            </div>
          )}

          <p className="text-xl text-gray-700 mb-5 leading-relaxed">{t.confirmInstr}</p>


          <div className="flex flex-col items-center gap-1 mb-4">
            <svg width="108" height="108" className="-rotate-90">
              <circle cx="54" cy="54" r={r} fill="none" stroke="#e5e7eb" strokeWidth="5" />
              <circle cx="54" cy="54" r={r} fill="none" stroke="#065A82" strokeWidth="5"
                strokeDasharray={`${dash} ${circ}`} strokeLinecap="round"
                style={{ transition: "stroke-dasharray 1s linear" }}
              />
              <text x="54" y="54" textAnchor="middle" dominantBaseline="central"
                style={{ transform: "rotate(90deg)", transformOrigin: "54px 54px", fontSize: "20px", fontWeight: 700, fill: "#065A82" }}>
                {countdown}s
              </text>
            </svg>
            <p className="text-sm text-gray-400">Automatický reset</p>
          </div>

          {confirmed.driverId > 0 && (
            <button
              onClick={() => router.push(`/print/${confirmed.driverId}`)}
              className="w-full bg-[#065A82] text-white font-bold py-4 rounded-2xl text-lg mb-3 flex items-center justify-center gap-2 hover:bg-blue-800 transition"
            >
              🖨 Vytisknout štítek
            </button>
          )}

          <button onClick={resetAll} className="text-[#065A82] underline text-sm">
            ← Nová registrace ihned
          </button>
        </div>
      </div>
    );
  }

  // ── Form screen ────────────────────────────────────────

  function fieldState(f: FormField): "idle" | "ok" | "err" {
    if (!touched.has(f)) return "idle";
    return validateField(f, values[f]) === null ? "ok" : "err";
  }

  function inputClass(f: FormField) {
    const st = fieldState(f);
    return [
      "w-full border-2 rounded-xl px-4 py-4 text-lg focus:outline-none transition-colors placeholder:text-gray-400",
      st === "ok" ? "border-green-400 bg-green-50/30" :
      st === "err" ? "border-red-400 bg-red-50/30" :
      "border-gray-200 focus:border-[#065A82]",
    ].join(" ");
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <header className="bg-[#065A82] text-white px-4 py-3 flex items-center justify-between flex-shrink-0">
        <div>
          <h1 className="text-xl font-bold leading-tight">LGI Logistics</h1>
          <p className="text-blue-200 text-xs">{t.subtitle}</p>
        </div>
        <div className="flex items-center gap-2">
          {!isOnline && <span className="text-xs bg-orange-500 px-2 py-1 rounded-lg">Offline</span>}
          <button onClick={toggleFullscreen} className="p-2 rounded-lg bg-blue-700 hover:bg-blue-600 transition" title="Kiosk mód">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15" />
            </svg>
          </button>
          {/* Language change */}
          <button onClick={() => setLang(null)}
            className="flex items-center gap-1.5 bg-blue-700 hover:bg-blue-600 px-3 py-2 rounded-lg transition">
            <FlagIcon code={lang} size={22} />
            <span className="text-sm font-medium">{LANG_META[lang].name}</span>
          </button>
        </div>
      </header>

      {/* Form */}
      <main className="flex-1 p-4 overflow-y-auto">
        <form onSubmit={handleSubmit} className="max-w-xl mx-auto space-y-4">
          <div className="mb-2">
            <h2 className="text-3xl font-black text-gray-900 leading-tight">{t.title}</h2>
            <p className="text-gray-500 text-sm mt-1">{t.subtitle}</p>
          </div>

          {/* Type operation — FIRST, large tap buttons */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              {t.type} <span className="text-red-500">*</span>
            </label>
            <div className="grid grid-cols-3 gap-2">
              {(["vyklada","naklada","obe"] as const).map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setTypeValue(v)}
                  className={`py-4 rounded-xl font-semibold text-sm border-2 transition active:scale-95 ${
                    typeValue === v
                      ? "bg-[#065A82] text-white border-[#065A82] shadow-md"
                      : "bg-white text-gray-700 border-gray-200 hover:border-[#065A82]"
                  }`}
                >
                  {t.typeOptions[v]}
                </button>
              ))}
            </div>
            {touched.has("name") && !typeValue && (
              <p className="text-red-500 text-sm mt-1">{t.required}</p>
            )}
          </div>

          {/* Vehicle type */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              Typ vozidla
            </label>
            <div className="grid grid-cols-3 gap-2">
              {VEHICLE_TYPES.map((vt) => {
                const selected = vehicleType === vt.value;
                return (
                  <button
                    key={vt.value}
                    type="button"
                    onClick={() => setVehicleType(vt.value)}
                    className={`py-3 px-2 rounded-xl border-2 transition active:scale-95 flex flex-col items-center gap-1.5 ${
                      selected
                        ? "bg-[#065A82] border-[#065A82] shadow-md"
                        : "bg-white text-gray-700 border-gray-200 hover:border-[#065A82]"
                    }`}
                  >
                    <div style={selected ? { filter: "brightness(0) invert(1)" } : undefined}>
                      <VehicleIcon type={vt.value} size={52} />
                    </div>
                    <span className={`text-xs font-medium leading-tight text-center ${selected ? "text-white" : "text-gray-700"}`}>
                      {vt.label}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Name */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">
              {t.name} <span className="text-red-500">*</span>
            </label>
            <input
              name="name"
              autoComplete="name"
              maxLength={100}
              value={values.name}
              placeholder="Jan Novák"
              onChange={(e) => handleInputChange("name", e.target.value)}
              className={inputClass("name")}
            />
            {fieldState("name") === "err" && <p className="text-red-500 text-xs mt-1">{validateField("name", values.name)}</p>}
          </div>

          {/* Phone + dial code */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">
              {t.phone} <span className="text-red-500">*</span>
            </label>
            <div className="flex gap-2">
              <select
                value={dialCode}
                onChange={(e) => setDialCode(e.target.value)}
                className="border-2 border-gray-200 rounded-xl px-2 py-4 text-base font-medium bg-white focus:border-[#065A82] focus:outline-none"
              >
                <option value="+420">🇨🇿 +420</option>
                <option value="+421">🇸🇰 +421</option>
                <option value="+48">🇵🇱 +48</option>
                <option value="+49">🇩🇪 +49</option>
                <option value="+36">+36</option>
                <option value="+43">+43</option>
                <option value="+40">+40</option>
              </select>
              <input
                name="phone"
                autoComplete="tel"
                maxLength={30}
                value={values.phone}
                placeholder="123 456 789"
                onChange={(e) => handleInputChange("phone", e.target.value)}
                className={`flex-1 ${inputClass("phone")}`}
                inputMode="tel"
              />
            </div>
            {fieldState("phone") === "err" && <p className="text-red-500 text-xs mt-1">{validateField("phone", values.phone)}</p>}
          </div>

          {/* SPZ + Firm in row */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">
                {t.spz} (tahač) <span className="text-red-500">*</span>
              </label>
              <input
                name="spz"
                autoComplete="off"
                maxLength={15}
                value={values.spz}
                placeholder="1AB 2345"
                onChange={(e) => handleInputChange("spz", e.target.value)}
                className={inputClass("spz")}
                style={{ textTransform: "uppercase" }}
              />
              {fieldState("spz") === "err" && <p className="text-red-500 text-xs mt-1">{t.required}</p>}
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">
                SPZ přívěs / návěs
              </label>
              <input
                name="spzTrailer"
                autoComplete="off"
                maxLength={15}
                value={spzTrailer}
                placeholder="AB 1234"
                onChange={(e) => setSpzTrailer(e.target.value.toUpperCase())}
                className="w-full border-2 rounded-xl px-4 py-4 text-lg focus:outline-none transition-colors placeholder:text-gray-400 border-gray-200 focus:border-[#065A82]"
                style={{ textTransform: "uppercase" }}
              />
            </div>
          </div>

          {/* Firm */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">
              {t.firm} <span className="text-red-500">*</span>
            </label>
            <input
              name="firm"
              autoComplete="organization"
              maxLength={100}
              value={values.firm}
              placeholder="Dopravní firma s.r.o."
              onChange={(e) => handleInputChange("firm", e.target.value)}
              className={inputClass("firm")}
            />
            {fieldState("firm") === "err" && <p className="text-red-500 text-xs mt-1">{t.required}</p>}
          </div>

          {/* Order (optional) */}
          <div>
            <label className="block text-sm font-medium text-gray-600 mb-1">{t.order}</label>
            <input
              name="order"
              autoComplete="off"
              maxLength={100}
              value={values.order}
              placeholder="ORD-12345"
              onChange={(e) => handleInputChange("order", e.target.value)}
              className="w-full border-2 border-gray-200 rounded-xl px-4 py-4 text-lg focus:outline-none focus:border-[#065A82] transition-colors placeholder:text-gray-400"
            />
          </div>

          {/* Pallet arrangement — only for loading types */}
          {(typeValue === "naklada" || typeValue === "obe") && (
            <div className="bg-gray-50 rounded-2xl p-4 border border-gray-200">
              <label className="block text-sm font-semibold text-gray-700 mb-1">
                Kde chcete umístit náklad?
              </label>
              <p className="text-xs text-gray-400 mb-3">Klepněte na zónu v kamionu (lze vybrat více)</p>
              <TruckDiagram grid={palletGrid} onChange={setPalletGrid} />
              {palletGrid.every(c => c === 0) && (
                <p className="text-xs text-center text-gray-400 mt-2">Nevybráno — skladník rozhodne sám</p>
              )}
            </div>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-[#1D9E75] text-white text-xl font-bold py-5 rounded-2xl shadow-lg hover:bg-[#178a64] active:scale-[0.99] transition-all disabled:opacity-60 flex items-center justify-center gap-3"
          >
            {loading ? (
              <svg className="w-6 h-6 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
              </svg>
            ) : (
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
              </svg>
            )}
            {loading ? "…" : t.submit}
          </button>
        </form>
      </main>

    </div>
  );
}
