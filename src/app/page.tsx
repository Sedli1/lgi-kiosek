"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import dynamic from "next/dynamic";
import { LANGS, T, Lang } from "@/lib/i18n";

// Virtual keyboard — loaded only on client to avoid SSR issues
const Keyboard = dynamic(() => import("react-simple-keyboard"), { ssr: false });

interface ConfirmData {
  num: number;
  confirmSms: string;
}

const RESET_SECONDS = 90;

const OFFLINE_QUEUE_KEY = "lgi-offline-queue";

type FormValues = {
  name: string;
  phone: string;
  spz: string;
  firm: string;
  order: string;
};

export default function KioskPage() {
  const [lang, setLang] = useState<Lang>("cs");
  const [confirmed, setConfirmed] = useState<ConfirmData | null>(null);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [countdown, setCountdown] = useState(RESET_SECONDS);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isOnline, setIsOnline] = useState(true);
  const [showKb, setShowKb] = useState(false);
  const [activeField, setActiveField] = useState<keyof FormValues | null>(null);
  const [values, setValues] = useState<FormValues>({ name: "", phone: "", spz: "", firm: "", order: "" });
  const [typeValue, setTypeValue] = useState("");
  const keyboardRef = useRef<{ setInput: (val: string) => void } | null>(null);

  const t = T[lang];

  // Service worker registration
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
      navigator.serviceWorker.addEventListener("message", (e) => {
        if (e.data?.type === "flush-queue") flushOfflineQueue();
      });
    }
    setIsOnline(navigator.onLine);
    const onOnline = () => { setIsOnline(true); flushOfflineQueue(); };
    const onOffline = () => setIsOnline(false);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => { window.removeEventListener("online", onOnline); window.removeEventListener("offline", onOffline); };
  }, []);

  // Flush offline queue when back online
  const flushOfflineQueue = useCallback(async () => {
    const raw = localStorage.getItem(OFFLINE_QUEUE_KEY);
    if (!raw) return;
    const queue: object[] = JSON.parse(raw);
    if (!queue.length) return;
    const remaining: object[] = [];
    for (const item of queue) {
      try {
        const res = await fetch("/api/drivers", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(item),
        });
        if (!res.ok) remaining.push(item);
      } catch {
        remaining.push(item);
      }
    }
    localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(remaining));
  }, []);

  // Fullscreen change listener
  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", handler);
    return () => document.removeEventListener("fullscreenchange", handler);
  }, []);

  function toggleFullscreen() {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  }

  // Auto-reset countdown after registration
  useEffect(() => {
    if (!confirmed) return;
    setCountdown(RESET_SECONDS);
    const interval = setInterval(() => {
      setCountdown((s) => {
        if (s <= 1) {
          clearInterval(interval);
          setConfirmed(null);
          return RESET_SECONDS;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [confirmed]);

  function validate() {
    const errs: Record<string, string> = {};
    if (!values.name) errs.name = t.required;
    if (!values.phone) errs.phone = t.required;
    if (!values.spz) errs.spz = t.required;
    if (!values.firm) errs.firm = t.required;
    if (!typeValue) errs.type = t.required;
    return errs;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length > 0) { setErrors(errs); return; }
    setErrors({});
    setLoading(true);
    setShowKb(false);
    setActiveField(null);

    const payload = {
      name: values.name,
      phone: values.phone,
      spz: values.spz,
      firm: values.firm,
      order: values.order,
      type: typeValue,
      lang,
    };

    if (!navigator.onLine) {
      // Save offline
      const queue = JSON.parse(localStorage.getItem(OFFLINE_QUEUE_KEY) ?? "[]");
      queue.push(payload);
      localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(queue));
      setLoading(false);
      setConfirmed({ num: 0, confirmSms: "Registrace uložena offline. Bude odeslaná po obnovení připojení." });
      return;
    }

    const res = await fetch("/api/drivers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    setLoading(false);
    if (res.ok) {
      const data = (await res.json()) as { num: number; confirmSms: string };
      setConfirmed({ num: data.num, confirmSms: data.confirmSms });
      setValues({ name: "", phone: "", spz: "", firm: "", order: "" });
      setTypeValue("");
    }
  }

  function handleFieldFocus(field: keyof FormValues) {
    setActiveField(field);
    setShowKb(true);
    keyboardRef.current?.setInput(values[field]);
  }

  function handleKbChange(input: string) {
    if (!activeField) return;
    setValues((v) => ({ ...v, [activeField]: input }));
  }

  function handleKbKeyPress(button: string) {
    if (button === "{enter}") {
      setShowKb(false);
      setActiveField(null);
    }
  }

  if (confirmed) {
    const pct = (countdown / RESET_SECONDS) * 100;
    const r = 54;
    const circ = 2 * Math.PI * r;
    const dash = (pct / 100) * circ;

    return (
      <div className="min-h-screen bg-white flex flex-col items-center justify-center p-6">
        <div className="max-w-lg w-full text-center">
          <div className="w-28 h-28 rounded-full bg-[#1D9E75] flex items-center justify-center mx-auto mb-6">
            <svg className="w-16 h-16 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
            </svg>
          </div>

          <h1 className="text-3xl font-bold text-gray-900 mb-2">{t.confirmTitle}</h1>

          {confirmed.num > 0 && (
            <div className="bg-[#065A82] text-white rounded-2xl px-8 py-5 my-6 inline-block">
              <div className="text-sm uppercase tracking-widest opacity-80">{t.confirmNum}</div>
              <div className="text-7xl font-black leading-none mt-1">{confirmed.num}</div>
            </div>
          )}

          <p className="text-xl text-gray-700 mb-6 leading-relaxed">{t.confirmInstr}</p>

          <div className="bg-gray-100 rounded-xl p-4 text-left mb-8">
            <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">{t.confirmSmsLabel}</div>
            <p className="text-gray-800 text-sm leading-relaxed">{confirmed.confirmSms}</p>
          </div>

          {/* Countdown ring */}
          <div className="flex flex-col items-center gap-2">
            <svg width="120" height="120" className="-rotate-90">
              <circle cx="60" cy="60" r={r} fill="none" stroke="#e5e7eb" strokeWidth="6" />
              <circle
                cx="60" cy="60" r={r}
                fill="none"
                stroke="#065A82"
                strokeWidth="6"
                strokeDasharray={`${dash} ${circ}`}
                strokeLinecap="round"
                style={{ transition: "stroke-dasharray 1s linear" }}
              />
              <text
                x="60" y="60"
                textAnchor="middle"
                dominantBaseline="central"
                style={{ transform: "rotate(90deg)", transformOrigin: "60px 60px", fontSize: "22px", fontWeight: 700, fill: "#065A82" }}
              >
                {countdown}s
              </text>
            </svg>
            <p className="text-sm text-gray-400">Automatický reset</p>
          </div>

          <button
            onClick={() => setConfirmed(null)}
            className="mt-4 text-[#065A82] underline text-sm"
          >
            ← Nová registrace ihned
          </button>
        </div>
      </div>
    );
  }

  const kbLayout = activeField === "phone"
    ? {
        default: ["1 2 3", "4 5 6", "7 8 9", "+ 0 {bksp}", "{enter}"],
        shift: ["1 2 3", "4 5 6", "7 8 9", "+ 0 {bksp}", "{enter}"],
      }
    : {
        default: [
          "q w e r t y u i o p",
          "a s d f g h j k l",
          "{shift} z x c v b n m {bksp}",
          "{space} {enter}",
        ],
        shift: [
          "Q W E R T Y U I O P",
          "A S D F G H J K L",
          "{shift} Z X C V B N M {bksp}",
          "{space} {enter}",
        ],
      };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <header className="bg-[#065A82] text-white px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">LGI Logistics</h1>
          <p className="text-blue-200 text-sm">{t.subtitle}</p>
        </div>
        <div className="flex items-center gap-2">
          {/* Offline indicator */}
          {!isOnline && (
            <span className="text-xs bg-orange-500 text-white px-2 py-1 rounded-lg">Offline</span>
          )}

          {/* Fullscreen toggle */}
          <button
            onClick={toggleFullscreen}
            className="p-2 rounded-lg bg-blue-700 hover:bg-blue-600 text-white transition"
            title={isFullscreen ? "Ukončit kiosk mód" : "Kiosk mód (celá obrazovka)"}
          >
            {isFullscreen ? (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 9V4.5M9 9H4.5M9 9L3.75 3.75M9 15v4.5M9 15H4.5M9 15l-5.25 5.25M15 9h4.5M15 9V4.5M15 9l5.25-5.25M15 15h4.5M15 15v4.5m0-4.5l5.25 5.25" />
              </svg>
            ) : (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15" />
              </svg>
            )}
          </button>

          {/* Language switcher */}
          {LANGS.map((l) => (
            <button
              key={l.code}
              onClick={() => setLang(l.code)}
              className={`flex items-center gap-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                lang === l.code
                  ? "bg-white text-[#065A82]"
                  : "bg-blue-700 text-white hover:bg-blue-600"
              }`}
            >
              <span className="text-lg">{l.flag}</span>
              <span>{l.label}</span>
            </button>
          ))}
        </div>
      </header>

      <main className="flex-1 flex items-start justify-center p-6 pb-0">
        <form
          onSubmit={handleSubmit}
          className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8 w-full max-w-2xl space-y-5"
        >
          <h2 className="text-2xl font-semibold text-gray-900">{t.title}</h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <Field
              label={t.name} name="name" value={values.name} error={errors.name} required
              onFocus={() => handleFieldFocus("name")}
              onChange={(v) => setValues((prev) => ({ ...prev, name: v }))}
            />
            <Field
              label={t.phone} name="phone" type="tel" value={values.phone} error={errors.phone} required
              onFocus={() => handleFieldFocus("phone")}
              onChange={(v) => setValues((prev) => ({ ...prev, phone: v }))}
            />
            <Field
              label={t.spz} name="spz" value={values.spz} error={errors.spz} required
              onFocus={() => handleFieldFocus("spz")}
              onChange={(v) => setValues((prev) => ({ ...prev, spz: v }))}
            />
            <Field
              label={t.firm} name="firm" value={values.firm} error={errors.firm} required
              onFocus={() => handleFieldFocus("firm")}
              onChange={(v) => setValues((prev) => ({ ...prev, firm: v }))}
            />
          </div>

          <Field
            label={t.order} name="order" value={values.order}
            onFocus={() => handleFieldFocus("order")}
            onChange={(v) => setValues((prev) => ({ ...prev, order: v }))}
          />

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {t.type} <span className="text-red-500">*</span>
            </label>
            <select
              name="type"
              value={typeValue}
              onChange={(e) => { setTypeValue(e.target.value); setShowKb(false); setActiveField(null); }}
              className={`w-full border rounded-lg px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-[#065A82] ${
                errors.type ? "border-red-400" : "border-gray-300"
              }`}
            >
              <option value="" disabled>—</option>
              <option value="vyklada">{t.typeOptions.vyklada}</option>
              <option value="naklada">{t.typeOptions.naklada}</option>
              <option value="obe">{t.typeOptions.obe}</option>
            </select>
            {errors.type && <p className="text-red-500 text-sm mt-1">{errors.type}</p>}
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-[#065A82] text-white text-lg font-semibold py-4 rounded-xl hover:bg-[#054a6b] active:scale-[0.99] transition-all disabled:opacity-60"
          >
            {loading ? "..." : t.submit}
          </button>
        </form>
      </main>

      {/* Virtual keyboard */}
      {showKb && (
        <div className="sticky bottom-0 w-full bg-gray-100 border-t border-gray-200 shadow-lg z-40">
          <div className="flex justify-end px-4 pt-2">
            <button
              onClick={() => { setShowKb(false); setActiveField(null); }}
              className="text-xs text-gray-500 underline"
            >
              Zavřít klávesnici ✕
            </button>
          </div>
          <Keyboard
            keyboardRef={(r) => { keyboardRef.current = r; }}
            layoutName="default"
            layout={kbLayout}
            onChange={handleKbChange}
            onKeyPress={handleKbKeyPress}
            display={{
              "{bksp}": "⌫",
              "{enter}": "OK",
              "{shift}": "⇧",
              "{space}": "Mezera",
            }}
            theme="hg-theme-default hg-layout-default"
            buttonTheme={[
              { class: "hg-blue", buttons: "{enter}" },
            ]}
          />
        </div>
      )}
    </div>
  );
}

function Field({
  label,
  name,
  type = "text",
  value,
  error,
  required,
  onFocus,
  onChange,
}: {
  label: string;
  name: string;
  type?: string;
  value: string;
  error?: string;
  required?: boolean;
  onFocus?: () => void;
  onChange?: (v: string) => void;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      <input
        name={name}
        type={type}
        value={value}
        readOnly
        onFocus={onFocus}
        onChange={(e) => onChange?.(e.target.value)}
        className={`w-full border rounded-lg px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-[#065A82] cursor-pointer ${
          error ? "border-red-400" : "border-gray-300"
        }`}
      />
      {error && <p className="text-red-500 text-sm mt-1">{error}</p>}
    </div>
  );
}
