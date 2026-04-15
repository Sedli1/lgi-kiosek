"use client";

// 11 columns (length) × 2 rows (width) = 22 pallet positions
// Columns: 0 = near doors (rear), 10 = near cab (front)
const COLS = 11;
const ROWS = 2;

export type CellState = 0 | 1; // 0=empty, 1=selected
export type GridState = CellState[]; // length = COLS * ROWS

export function emptyGrid(): GridState {
  return Array(COLS * ROWS).fill(0) as GridState;
}

interface TruckDiagramProps {
  grid: GridState;
  onChange?: (grid: GridState) => void;
  readonly?: boolean;
  compact?: boolean;
}

export function TruckDiagram({ grid, onChange, readonly = false, compact = false }: TruckDiagramProps) {
  function toggle(idx: number) {
    if (readonly || !onChange) return;
    const next = [...grid] as GridState;
    next[idx] = next[idx] === 0 ? 1 : 0;
    onChange(next);
  }

  const CELL_W = compact ? 28 : 36;
  const CELL_H = compact ? 22 : 28;
  const GAP = 2;
  const PAD = 6;
  const CAB_W = compact ? 32 : 40;
  const CAB_H = compact ? 54 : 68;
  const DOOR_W = compact ? 10 : 13;

  const bodyW = COLS * (CELL_W + GAP) - GAP + PAD * 2;
  const bodyH = ROWS * (CELL_H + GAP) - GAP + PAD * 2;
  const totalW = DOOR_W + bodyW + CAB_W + 8;
  const totalH = bodyH + 28; // extra for wheels + labels

  const bodyX = DOOR_W;
  const bodyY = 20;
  const cabX = bodyX + bodyW + 4;
  const cabY = bodyY + (bodyH - CAB_H) / 2;

  // wheel x positions
  const wY1 = bodyY - 8;
  const wY2 = bodyY + bodyH;
  const wW = CELL_W * 1.5, wH = 7;

  const selectedCount = grid.filter(c => c === 1).length;

  return (
    <div className="select-none">
      <svg
        viewBox={`0 0 ${totalW} ${totalH}`}
        className="w-full"
        style={{ maxHeight: compact ? 110 : 140 }}
      >
        {/* Cargo body */}
        <rect x={bodyX} y={bodyY} width={bodyW} height={bodyH}
          fill="#f9fafb" stroke="#374151" strokeWidth="2.5" rx="2" />

        {/* Pallet cells */}
        {Array.from({ length: ROWS }, (_, row) =>
          Array.from({ length: COLS }, (_, col) => {
            const idx = row * COLS + col;
            const sel = grid[idx] === 1;
            const cx = bodyX + PAD + col * (CELL_W + GAP);
            const cy = bodyY + PAD + row * (CELL_H + GAP);
            return (
              <g key={idx} onClick={() => toggle(idx)} style={{ cursor: readonly ? "default" : "pointer" }}>
                <rect x={cx} y={cy} width={CELL_W} height={CELL_H}
                  fill={sel ? "#22c55e" : "#e5e7eb"}
                  stroke={sel ? "#16a34a" : "#d1d5db"}
                  strokeWidth="1" rx="2" />
                {sel && (
                  <text x={cx + CELL_W / 2} y={cy + CELL_H / 2 + 4}
                    textAnchor="middle" fontSize={compact ? 9 : 11} fontWeight="bold" fill="#fff">✓</text>
                )}
              </g>
            );
          })
        )}

        {/* Column numbers */}
        {Array.from({ length: COLS }, (_, col) => (
          <text key={col}
            x={bodyX + PAD + col * (CELL_W + GAP) + CELL_W / 2}
            y={bodyY + bodyH + 11}
            textAnchor="middle" fontSize={8} fill="#9ca3af">
            {col + 1}
          </text>
        ))}

        {/* Doors (left) */}
        <rect x={0} y={bodyY + 2} width={DOOR_W} height={bodyH - 4}
          fill="#374151" rx="2" />
        <rect x={1} y={bodyY + bodyH / 2 - 6} width={DOOR_W - 2} height={12}
          fill="#6b7280" rx="1" />
        <line x1={DOOR_W / 2} y1={bodyY + 4} x2={DOOR_W / 2} y2={bodyY + bodyH - 4}
          stroke="#9ca3af" strokeWidth="1" />

        {/* Cab (right) */}
        <rect x={cabX} y={cabY} width={CAB_W} height={CAB_H}
          fill="#1f2937" rx="5" />
        {/* Windshield */}
        <rect x={cabX + 2} y={cabY + 6} width={14} height={CAB_H - 24}
          fill="#bfdbfe" rx="2" />
        {/* Cab roof */}
        <rect x={cabX + 4} y={cabY - 5} width={CAB_W - 12} height={7}
          fill="#374151" rx="2" />

        {/* Wheels */}
        {[bodyX + 10, bodyX + bodyW - 10 - wW].map((wx, i) => [
          <rect key={`wt${i}`} x={wx} y={wY1} width={wW} height={wH} fill="#1f2937" rx="2" />,
          <rect key={`wb${i}`} x={wx} y={wY2} width={wW} height={wH} fill="#1f2937" rx="2" />,
        ])}
        {/* Cab wheel */}
        <rect x={cabX + 4} y={cabY + CAB_H - 10} width={CAB_W - 10} height={wH}
          fill="#1f2937" rx="2" />

        {/* Direction labels */}
        <text x={DOOR_W / 2} y={bodyY - 3} textAnchor="middle" fontSize={8} fill="#6b7280">← Dveře</text>
        <text x={cabX + CAB_W / 2} y={bodyY - 3} textAnchor="middle" fontSize={8} fill="#6b7280">Kabina →</text>
      </svg>

      {/* Summary */}
      {!readonly && (
        <div className="flex items-center justify-between mt-2 text-xs text-gray-500 px-1">
          <span>Klepněte na políčko pro označení místa</span>
          <span className={selectedCount > 0 ? "text-green-600 font-semibold" : ""}>
            {selectedCount > 0 ? `${selectedCount} vybraných` : "Nevybráno"}
          </span>
        </div>
      )}
      {readonly && selectedCount > 0 && (
        <div className="text-center text-xs text-green-400 mt-1">
          {selectedCount} preferovaných políček
        </div>
      )}
    </div>
  );
}
