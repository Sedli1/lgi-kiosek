"use client";

import { useState } from "react";
import { LANGS, T, Lang } from "@/lib/i18n";

interface ConfirmData {
  num: number;
  confirmSms: string;
}

export default function KioskPage() {
  const [lang, setLang] = useState<Lang>("cs");
  const [confirmed, setConfirmed] = useState<ConfirmData | null>(null);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const t = T[lang];

  function validate(form: FormData) {
    const errs: Record<string, string> = {};
    for (const field of ["name", "phone", "spz", "firm", "type"]) {
      if (!form.get(field)) errs[field] = t.required;
    }
    return errs;
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const errs = validate(form);
    if (Object.keys(errs).length > 0) { setErrors(errs); return; }
    setErrors({});
    setLoading(true);

    const res = await fetch("/api/drivers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: form.get("name"),
        phone: form.get("phone"),
        spz: form.get("spz"),
        firm: form.get("firm"),
        order: form.get("order") || "",
        type: form.get("type"),
        lang,
      }),
    });

    setLoading(false);
    if (res.ok) {
      const data = (await res.json()) as { num: number; confirmSms: string };
      setConfirmed({ num: data.num, confirmSms: data.confirmSms });
    }
  }

  if (confirmed) {
    return (
      <div className="min-h-screen bg-white flex flex-col items-center justify-center p-6">
        <div className="max-w-lg w-full text-center">
          <div className="w-28 h-28 rounded-full bg-[#1D9E75] flex items-center justify-center mx-auto mb-6">
            <svg className="w-16 h-16 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
            </svg>
          </div>

          <h1 className="text-3xl font-bold text-gray-900 mb-2">{t.confirmTitle}</h1>

          <div className="bg-[#065A82] text-white rounded-2xl px-8 py-5 my-6 inline-block">
            <div className="text-sm uppercase tracking-widest opacity-80">{t.confirmNum}</div>
            <div className="text-7xl font-black leading-none mt-1">{confirmed.num}</div>
          </div>

          <p className="text-xl text-gray-700 mb-8 leading-relaxed">{t.confirmInstr}</p>

          <div className="bg-gray-100 rounded-xl p-4 text-left">
            <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">{t.confirmSmsLabel}</div>
            <p className="text-gray-800 text-sm leading-relaxed">{confirmed.confirmSms}</p>
          </div>

          <button
            onClick={() => setConfirmed(null)}
            className="mt-8 text-[#065A82] underline text-sm"
          >
            ← Nová registrace
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <header className="bg-[#065A82] text-white px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">LGI Logistics</h1>
          <p className="text-blue-200 text-sm">{t.subtitle}</p>
        </div>
        <div className="flex gap-2">
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

      <main className="flex-1 flex items-start justify-center p-6">
        <form
          onSubmit={handleSubmit}
          className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8 w-full max-w-2xl space-y-5"
        >
          <h2 className="text-2xl font-semibold text-gray-900">{t.title}</h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <Field label={t.name} name="name" error={errors.name} required />
            <Field label={t.phone} name="phone" type="tel" error={errors.phone} required />
            <Field label={t.spz} name="spz" error={errors.spz} required />
            <Field label={t.firm} name="firm" error={errors.firm} required />
          </div>

          <Field label={t.order} name="order" />

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {t.type} <span className="text-red-500">*</span>
            </label>
            <select
              name="type"
              defaultValue=""
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
    </div>
  );
}

function Field({
  label,
  name,
  type = "text",
  error,
  required,
}: {
  label: string;
  name: string;
  type?: string;
  error?: string;
  required?: boolean;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      <input
        name={name}
        type={type}
        className={`w-full border rounded-lg px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-[#065A82] ${
          error ? "border-red-400" : "border-gray-300"
        }`}
      />
      {error && <p className="text-red-500 text-sm mt-1">{error}</p>}
    </div>
  );
}
