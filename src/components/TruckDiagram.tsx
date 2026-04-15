"use client";

// Zone IDs: "A" = near doors (rear), "B" = middle, "C" = near cab (front)
export const TRUCK_ZONES = [
  { id: "A", label: "Dveře",  sublabel: "Nakládá se první", color: "#22c55e", textColor: "#fff" },
  { id: "B", label: "Střed",  sublabel: "Uprostřed",        color: "#f59e0b", textColor: "#fff" },
  { id: "C", label: "Kabina", sublabel: "Nakládá se poslední", color: "#3b82f6", textColor: "#fff" },
] as const;

export type ZoneId = "A" | "B" | "C";

interface TruckDiagramProps {
  zones: ZoneId[];
  onChange?: (zones: ZoneId[]) => void;
  readonly?: boolean;
  compact?: boolean;
}

export function TruckDiagram({ zones, onChange, readonly = false, compact = false }: TruckDiagramProps) {
  function toggle(id: ZoneId) {
    if (readonly || !onChange) return;
    if (zones.includes(id)) onChange(zones.filter(z => z !== id));
    else onChange([...zones, id]);
  }

  const W = 480, H = compact ? 140 : 180;
  const BODY_X = 30, BODY_W = 340, BODY_H = compact ? 100 : 130;
  const BODY_Y = (H - BODY_H) / 2;
  const ZONE_W = BODY_W / 3;
  const CAB_X = BODY_X + BODY_W + 4;
  const CAB_W = 70, CAB_H = compact ? 80 : 100;
  const CAB_Y = (H - CAB_H) / 2;
  const WH = compact ? 10 : 13, WW = compact ? 22 : 28; // wheel dims

  // Wheel positions [x, y]
  const wheels = [
    [BODY_X + 20, BODY_Y - WH],
    [BODY_X + BODY_W - 20 - WW, BODY_Y - WH],
    [BODY_X + 20, BODY_Y + BODY_H],
    [BODY_X + BODY_W - 20 - WW, BODY_Y + BODY_H],
    [CAB_X + 10, CAB_Y + CAB_H - WH * 2 - 2],
  ];

  return (
    <div className={compact ? "" : "select-none"}>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ maxHeight: compact ? 120 : 160 }}>
        {/* Cargo body outline */}
        <rect x={BODY_X} y={BODY_Y} width={BODY_W} height={BODY_H}
          fill="#f3f4f6" stroke="#374151" strokeWidth="3" rx="3" />

        {/* Clickable zones */}
        {TRUCK_ZONES.map((zone, i) => {
          const x = BODY_X + i * ZONE_W;
          const selected = zones.includes(zone.id);
          return (
            <g key={zone.id} onClick={() => toggle(zone.id)}
              style={{ cursor: readonly ? "default" : "pointer" }}>
              <rect x={x} y={BODY_Y} width={ZONE_W} height={BODY_H}
                fill={selected ? zone.color : "#e5e7eb"}
                opacity={selected ? 0.85 : 0.5}
                stroke="#374151" strokeWidth="1.5" />
              {/* Zone label */}
              <text x={x + ZONE_W / 2} y={BODY_Y + BODY_H / 2 - (compact ? 6 : 10)}
                textAnchor="middle" fontSize={compact ? 12 : 14}
                fontWeight="bold" fill={selected ? "#fff" : "#6b7280"}>
                {zone.label}
              </text>
              {!compact && (
                <text x={x + ZONE_W / 2} y={BODY_Y + BODY_H / 2 + 10}
                  textAnchor="middle" fontSize={10} fill={selected ? "#e5e7eb" : "#9ca3af"}>
                  {zone.sublabel}
                </text>
              )}
              {/* Checkmark if selected */}
              {selected && (
                <text x={x + ZONE_W / 2} y={BODY_Y + BODY_H - (compact ? 8 : 14)}
                  textAnchor="middle" fontSize={compact ? 14 : 18} fill="#fff">
                  ✓
                </text>
              )}
            </g>
          );
        })}

        {/* Zone dividers */}
        <line x1={BODY_X + ZONE_W} y1={BODY_Y} x2={BODY_X + ZONE_W} y2={BODY_Y + BODY_H}
          stroke="#374151" strokeWidth="2" />
        <line x1={BODY_X + ZONE_W * 2} y1={BODY_Y} x2={BODY_X + ZONE_W * 2} y2={BODY_Y + BODY_H}
          stroke="#374151" strokeWidth="2" />

        {/* Doors on left */}
        <rect x={BODY_X - 8} y={BODY_Y + 4} width={8} height={BODY_H - 8}
          fill="#374151" rx="2" />
        {/* Door handle */}
        <rect x={BODY_X - 6} y={BODY_Y + BODY_H / 2 - 8} width={4} height={16}
          fill="#9ca3af" rx="1" />
        {/* Door split line */}
        <line x1={BODY_X - 8} y1={BODY_Y + BODY_H / 2}
              x2={BODY_X} y2={BODY_Y + BODY_H / 2}
          stroke="#9ca3af" strokeWidth="1.5" />

        {/* Cab */}
        <rect x={CAB_X} y={CAB_Y} width={CAB_W} height={CAB_H}
          fill="#374151" rx="6" />
        {/* Windshield */}
        <rect x={CAB_X + 2} y={CAB_Y + 8} width={16} height={CAB_H - 30}
          fill="#bfdbfe" rx="3" />
        {/* Cab roof detail */}
        <rect x={CAB_X + 5} y={CAB_Y - 6} width={CAB_W - 15} height={8}
          fill="#1f2937" rx="2" />

        {/* Wheels */}
        {wheels.map(([wx, wy], i) => (
          <rect key={i} x={wx} y={wy} width={WW} height={WH}
            fill="#1f2937" rx="3" />
        ))}

        {/* Direction labels */}
        <text x={BODY_X - 2} y={BODY_Y - (compact ? 4 : 6)}
          textAnchor="middle" fontSize={9} fill="#6b7280">← Dveře</text>
        <text x={CAB_X + CAB_W / 2} y={BODY_Y - (compact ? 4 : 6)}
          textAnchor="middle" fontSize={9} fill="#6b7280">Kabina →</text>
      </svg>

      {/* Legend — only interactive mode */}
      {!readonly && (
        <div className="flex gap-3 justify-center mt-2 flex-wrap">
          {TRUCK_ZONES.map(z => (
            <button key={z.id} type="button" onClick={() => toggle(z.id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border-2 text-xs font-semibold transition active:scale-95 ${
                zones.includes(z.id)
                  ? "text-white border-transparent"
                  : "bg-white text-gray-600 border-gray-200 hover:border-gray-400"
              }`}
              style={zones.includes(z.id) ? { backgroundColor: z.color, borderColor: z.color } : {}}>
              {zones.includes(z.id) ? "✓ " : ""}{z.label}
            </button>
          ))}
        </div>
      )}

      {/* Read-only legend */}
      {readonly && zones.length > 0 && (
        <div className="flex gap-2 justify-center mt-1 flex-wrap">
          {TRUCK_ZONES.filter(z => zones.includes(z.id)).map(z => (
            <span key={z.id} className="px-2 py-0.5 rounded text-xs font-bold text-white"
              style={{ backgroundColor: z.color }}>
              {z.label}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
