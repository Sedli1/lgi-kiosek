// Side-view SVG icons for vehicle types
export function VehicleIcon({ type, size = 56 }: { type: string; size?: number }) {
  const h = Math.round(size * 0.5);
  const icons: Record<string, React.ReactNode> = {
    tahac_navis: (
      // Semi truck with long trailer
      <svg width={size} height={h} viewBox="0 0 120 55" fill="none">
        {/* Trailer */}
        <rect x="2" y="12" width="72" height="28" rx="2" fill="#94a3b8" stroke="#475569" strokeWidth="1.5"/>
        <line x1="2" y1="20" x2="74" y2="20" stroke="#64748b" strokeWidth="1"/>
        {/* Trailer wheels */}
        <circle cx="18" cy="42" r="7" fill="#1e293b"/>
        <circle cx="18" cy="42" r="3.5" fill="#94a3b8"/>
        <circle cx="58" cy="42" r="7" fill="#1e293b"/>
        <circle cx="58" cy="42" r="3.5" fill="#94a3b8"/>
        {/* Cab */}
        <rect x="76" y="8" width="32" height="32" rx="4" fill="#1e40af"/>
        <rect x="77" y="10" width="12" height="20" rx="2" fill="#bfdbfe"/>
        <rect x="78" y="6" width="28" height="5" rx="2" fill="#1e3a8a"/>
        {/* Cab wheels */}
        <circle cx="88" cy="42" r="7" fill="#1e293b"/>
        <circle cx="88" cy="42" r="3.5" fill="#94a3b8"/>
        <circle cx="110" cy="42" r="7" fill="#1e293b"/>
        <circle cx="110" cy="42" r="3.5" fill="#94a3b8"/>
        {/* Hitch */}
        <rect x="73" y="34" width="5" height="4" fill="#64748b"/>
      </svg>
    ),
    tahac: (
      // Solo cab (no trailer)
      <svg width={size} height={h} viewBox="0 0 80 55" fill="none">
        <rect x="8" y="10" width="48" height="30" rx="4" fill="#1e40af"/>
        <rect x="9" y="13" width="18" height="18" rx="2" fill="#bfdbfe"/>
        <rect x="10" y="8" width="44" height="5" rx="2" fill="#1e3a8a"/>
        {/* Engine hood */}
        <rect x="56" y="20" width="16" height="20" rx="2" fill="#2563eb"/>
        {/* Wheels */}
        <circle cx="22" cy="43" r="8" fill="#1e293b"/>
        <circle cx="22" cy="43" r="4" fill="#94a3b8"/>
        <circle cx="58" cy="43" r="8" fill="#1e293b"/>
        <circle cx="58" cy="43" r="4" fill="#94a3b8"/>
      </svg>
    ),
    // eslint-disable-next-line @typescript-eslint/naming-convention
    "dodavka_privěs": (
      // Van with small trailer
      <svg width={size} height={h} viewBox="0 0 110 55" fill="none">
        {/* Small trailer */}
        <rect x="2" y="18" width="36" height="20" rx="2" fill="#94a3b8" stroke="#475569" strokeWidth="1.5"/>
        <circle cx="12" cy="40" r="6" fill="#1e293b"/>
        <circle cx="12" cy="40" r="3" fill="#94a3b8"/>
        <circle cx="30" cy="40" r="6" fill="#1e293b"/>
        <circle cx="30" cy="40" r="3" fill="#94a3b8"/>
        {/* Hitch */}
        <rect x="36" y="30" width="6" height="3" fill="#64748b"/>
        {/* Van */}
        <rect x="44" y="12" width="56" height="26" rx="3" fill="#2563eb"/>
        <rect x="45" y="14" width="22" height="16" rx="2" fill="#bfdbfe"/>
        <rect x="94" y="16" width="4" height="8" rx="1" fill="#1d4ed8"/>
        {/* Van wheels */}
        <circle cx="58" cy="40" r="7" fill="#1e293b"/>
        <circle cx="58" cy="40" r="3.5" fill="#94a3b8"/>
        <circle cx="90" cy="40" r="7" fill="#1e293b"/>
        <circle cx="90" cy="40" r="3.5" fill="#94a3b8"/>
      </svg>
    ),
    dodavka: (
      // Simple van
      <svg width={size} height={h} viewBox="0 0 80 55" fill="none">
        <rect x="6" y="12" width="62" height="26" rx="3" fill="#2563eb"/>
        <rect x="7" y="14" width="26" height="16" rx="2" fill="#bfdbfe"/>
        <rect x="64" y="16" width="3" height="8" rx="1" fill="#1d4ed8"/>
        <circle cx="22" cy="41" r="8" fill="#1e293b"/>
        <circle cx="22" cy="41" r="4" fill="#94a3b8"/>
        <circle cx="58" cy="41" r="8" fill="#1e293b"/>
        <circle cx="58" cy="41" r="4" fill="#94a3b8"/>
      </svg>
    ),
    dodavka_plachta: (
      // Curtainsider van — same shape, curtain lines on side
      <svg width={size} height={h} viewBox="0 0 80 55" fill="none">
        <rect x="6" y="12" width="62" height="26" rx="3" fill="#2563eb"/>
        <rect x="7" y="14" width="26" height="16" rx="2" fill="#bfdbfe"/>
        {/* Curtain lines on cargo area */}
        {[38, 45, 52, 59].map(x => (
          <line key={x} x1={x} y1="13" x2={x} y2="37" stroke="#93c5fd" strokeWidth="1.5" strokeDasharray="3,2"/>
        ))}
        <rect x="64" y="16" width="3" height="8" rx="1" fill="#1d4ed8"/>
        <circle cx="22" cy="41" r="8" fill="#1e293b"/>
        <circle cx="22" cy="41" r="4" fill="#94a3b8"/>
        <circle cx="58" cy="41" r="8" fill="#1e293b"/>
        <circle cx="58" cy="41" r="4" fill="#94a3b8"/>
      </svg>
    ),
    jine: (
      // Generic car/other
      <svg width={size} height={h} viewBox="0 0 80 55" fill="none">
        <rect x="8" y="22" width="60" height="18" rx="2" fill="#475569"/>
        <rect x="16" y="12" width="40" height="14" rx="4" fill="#64748b"/>
        <rect x="18" y="13" width="16" height="10" rx="2" fill="#bfdbfe"/>
        <rect x="40" y="13" width="14" height="10" rx="2" fill="#bfdbfe"/>
        <circle cx="22" cy="42" r="7" fill="#1e293b"/>
        <circle cx="22" cy="42" r="3.5" fill="#94a3b8"/>
        <circle cx="56" cy="42" r="7" fill="#1e293b"/>
        <circle cx="56" cy="42" r="3.5" fill="#94a3b8"/>
      </svg>
    ),
  };
  return icons[type] ?? icons["jine"];
}
