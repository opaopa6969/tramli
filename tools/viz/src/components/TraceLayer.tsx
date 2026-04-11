import { useMemo } from 'react';
import { useReactFlow } from '@xyflow/react';
import type { StateInfo, VizEvent } from '../types';
import type { TransitAnimation } from '../hooks/useVizSocket';
import { TRANSIT_DURATION } from '../hooks/useVizSocket';

interface TraceLayerProps {
  states: StateInfo[];
  flowPositions: Map<string, string>;
  transits: TransitAnimation[];
  events: VizEvent[];
  selectedFlowId: string | null;
  onSelect: (flowId: string) => void;
  fadeAfterMs: number;
}

const NODE_W = 120;
const NODE_H = 36;

// Base tail particles (delays will be scaled by speed factor)
const TAIL_PARTICLES = [
  { delayFrac: 0,     r: 8,  opacity: 1.0 },  // head
  { delayFrac: 0.04,  r: 7,  opacity: 0.8 },
  { delayFrac: 0.08,  r: 6,  opacity: 0.6 },
  { delayFrac: 0.13,  r: 5,  opacity: 0.4 },
  { delayFrac: 0.18,  r: 4,  opacity: 0.25 },
  { delayFrac: 0.24,  r: 3,  opacity: 0.15 },
  { delayFrac: 0.30,  r: 2.5, opacity: 0.08 },
  { delayFrac: 0.36,  r: 2,  opacity: 0.04 },
];

const EXHAUST_PARTICLES = [
  { delayFrac: 0.07, r: 12, opacity: 0.08 },
  { delayFrac: 0.14, r: 10, opacity: 0.06 },
  { delayFrac: 0.21, r: 8,  opacity: 0.03 },
];

function carColor(stateName: string, states: StateInfo[]): string {
  const info = states.find(s => s.name === stateName);
  if (!info) return '#94a3b8';
  if (info.terminal) return stateName === 'BLOCKED' || stateName === 'TERMINAL_ERROR' ? '#ef4444' : '#22c55e';
  if (stateName === 'REDIRECTED') return '#f59e0b';
  if (stateName === 'RETRIABLE_ERROR') return '#f97316';
  return '#60a5fa';
}

function coreColor(color: string): string {
  const map: Record<string, string> = {
    '#60a5fa': '#93c5fd',
    '#f59e0b': '#fbbf24',
    '#22c55e': '#86efac',
    '#ef4444': '#fca5a5',
    '#f97316': '#fdba74',
    '#94a3b8': '#cbd5e1',
  };
  return map[color] ?? '#ffffff';
}

/**
 * Smart edge path:
 * - Downward (normal): bottom of source → top of target via vertical bezier
 * - Upward (loop-back): side exit → arc → side entry, no figure-8 twist
 * - Horizontal (same y): side to side
 */
function edgePath(
  from: { x: number; y: number },
  to: { x: number; y: number },
): string {
  const fromCx = from.x + NODE_W / 2;
  const fromCy = from.y + NODE_H / 2;
  const toCx = to.x + NODE_W / 2;
  const toCy = to.y + NODE_H / 2;

  const goingUp = to.y < from.y - 10;
  const sameRow = Math.abs(to.y - from.y) <= 10;

  if (goingUp) {
    // Loop-back: exit from side, arc around, enter from side
    const exitRight = to.x < from.x; // target is to the left → exit left side
    const sx = exitRight ? from.x : from.x + NODE_W;
    const sy = fromCy;
    const tx = exitRight ? to.x + NODE_W : to.x;
    const ty = toCy;
    // Arc outward
    const dx = Math.abs(tx - sx);
    const dy = Math.abs(ty - sy);
    const bulge = Math.max(dx * 0.5, dy * 0.3, 60);
    const dir = exitRight ? -1 : 1;
    return `M${sx},${sy} C${sx + dir * bulge},${sy + bulge * 0.3} ${tx + dir * bulge},${ty - bulge * 0.3} ${tx},${ty}`;
  }

  if (sameRow) {
    // Horizontal: side to side with a gentle arc
    const leftToRight = to.x > from.x;
    const sx = leftToRight ? from.x + NODE_W : from.x;
    const sy = fromCy;
    const tx = leftToRight ? to.x : to.x + NODE_W;
    const ty = toCy;
    const mid = (sy + ty) / 2;
    const arc = 40;
    return `M${sx},${sy} C${(sx + tx) / 2},${mid - arc} ${(sx + tx) / 2},${mid - arc} ${tx},${ty}`;
  }

  // Normal downward: bottom center → top center
  const sx = fromCx;
  const sy = from.y + NODE_H;
  const tx = toCx;
  const ty = to.y;
  const dy = Math.abs(ty - sy);
  const cp = Math.max(dy * 0.4, 30);
  return `M${sx},${sy} C${sx},${sy + cp} ${tx},${ty - cp} ${tx},${ty}`;
}

/** Approximate path length for speed calculations. */
function approxPathLength(from: { x: number; y: number }, to: { x: number; y: number }): number {
  const dx = (to.x + NODE_W / 2) - (from.x + NODE_W / 2);
  const dy = (to.y + NODE_H / 2) - (from.y + NODE_H / 2);
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Speed factor: shorter path = faster = larger factor = longer tail.
 * Normalized so a "typical" 100px vertical hop = 1.0.
 * Very short hops (fast) → factor up to ~2.5
 * Long hops (slow) → factor down to ~0.4
 */
function speedFactor(pathLen: number): number {
  const reference = 120; // px, typical vertical hop
  return Math.max(0.4, Math.min(2.5, reference / Math.max(pathLen, 20)));
}

function isRejected(flowId: string, events: VizEvent[]): boolean {
  for (let i = events.length - 1; i >= Math.max(0, events.length - 20); i--) {
    const ev = events[i];
    if (ev.flowId === flowId && ev.type === 'guard' && ev.data.result === 'rejected') return true;
    if (ev.flowId === flowId && ev.type === 'transition') return false;
  }
  return false;
}

export function TraceLayer({ states, flowPositions, transits, events, selectedFlowId, onSelect, fadeAfterMs }: TraceLayerProps) {
  const { getViewport } = useReactFlow();
  const viewport = getViewport();

  const stateMap = useMemo(() => {
    const map = new Map<string, StateInfo>();
    for (const s of states) map.set(s.name, s);
    return map;
  }, [states]);

  const inTransitIds = useMemo(() => new Set(transits.map(t => t.flowId)), [transits]);

  const parkedCars = useMemo(() => {
    const result: Array<{
      flowId: string;
      x: number;
      y: number;
      color: string;
      bounce: boolean;
      fading: boolean;
    }> = [];
    const nodeCounts = new Map<string, number>();
    const nodeIndices = new Map<string, number>();
    for (const [, stateName] of flowPositions) {
      nodeCounts.set(stateName, (nodeCounts.get(stateName) ?? 0) + 1);
    }
    for (const [flowId, stateName] of flowPositions) {
      if (inTransitIds.has(flowId)) continue;
      const info = stateMap.get(stateName);
      if (!info) continue;
      // Skip terminal states — arrival count shown on node badge instead
      if (info.terminal) continue;
      const idx = nodeIndices.get(stateName) ?? 0;
      nodeIndices.set(stateName, idx + 1);
      const count = nodeCounts.get(stateName) ?? 1;
      const spread = 14;
      const offsetX = count > 1 ? (idx - (count - 1) / 2) * spread : 0;
      result.push({
        flowId,
        x: info.x + NODE_W / 2 + offsetX,
        y: info.y + NODE_H / 2,
        color: carColor(stateName, states),
        bounce: isRejected(flowId, events),
        fading: info.terminal,
      });
    }
    return result;
  }, [flowPositions, inTransitIds, stateMap, states, events]);

  const traceCars = useMemo(() => {
    return transits.map(t => {
      const fromInfo = stateMap.get(t.from);
      const toInfo = stateMap.get(t.to);
      if (!fromInfo || !toInfo) return null;
      const path = edgePath(fromInfo, toInfo);
      const color = carColor(t.to, states);
      const core = coreColor(color);
      const pathLen = approxPathLength(fromInfo, toInfo);
      const speed = speedFactor(pathLen);
      return { ...t, path, color, core, speed };
    }).filter(Boolean) as Array<TransitAnimation & { path: string; color: string; core: string; speed: number }>;
  }, [transits, stateMap, states]);

  return (
    <div
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
        transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.zoom})`,
        transformOrigin: '0 0',
      }}
    >
      <svg style={{ position: 'absolute', top: 0, left: 0, width: 9999, height: 9999, overflow: 'visible' }}>
        <defs>
          {traceCars.map(car => (
            <filter key={`glow-${car.flowId}`} id={`glow-${car.flowId}`} x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur in="SourceGraphic" stdDeviation="3" result="blur" />
              <feFlood floodColor={car.color} floodOpacity="0.6" result="color" />
              <feComposite in="color" in2="blur" operator="in" result="glow" />
              <feMerge>
                <feMergeNode in="glow" />
                <feMergeNode in="glow" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          ))}
        </defs>

        {/* Fireball trails — tail length scales with speed */}
        {traceCars.map(car => {
          // Scale delays by speed: fast (high speed) = larger delays = longer tail
          const tailScale = car.speed;
          return (
            <g key={`fireball-${car.flowId}`}>
              {TAIL_PARTICLES.map((p, i) => (
                <circle
                  key={i}
                  r={p.r}
                  fill={i === 0 ? car.core : car.color}
                  opacity={p.opacity}
                  filter={i === 0 ? `url(#glow-${car.flowId})` : undefined}
                  style={{
                    offsetPath: `path('${car.path}')`,
                    offsetDistance: '0%',
                    animation: `trace-move ${TRANSIT_DURATION}ms ease-in-out ${Math.round(p.delayFrac * TRANSIT_DURATION * tailScale)}ms forwards`,
                    willChange: 'offset-distance',
                  } as React.CSSProperties}
                />
              ))}
              {EXHAUST_PARTICLES.map((p, i) => (
                <circle
                  key={`ex-${i}`}
                  r={p.r * tailScale}
                  fill={car.color}
                  opacity={p.opacity}
                  style={{
                    offsetPath: `path('${car.path}')`,
                    offsetDistance: '0%',
                    animation: `trace-move ${TRANSIT_DURATION}ms ease-in-out ${Math.round(p.delayFrac * TRANSIT_DURATION * tailScale)}ms forwards`,
                    willChange: 'offset-distance',
                  } as React.CSSProperties}
                />
              ))}
            </g>
          );
        })}
      </svg>

      {/* Parked cars */}
      {parkedCars.map(car => (
        <div
          key={car.flowId}
          onClick={() => onSelect(car.flowId)}
          title={car.flowId.slice(0, 8)}
          style={{
            position: 'absolute',
            left: car.x - 6,
            top: car.y - 6,
            width: 12,
            height: 12,
            borderRadius: '50%',
            background: car.color,
            border: car.flowId === selectedFlowId ? '2px solid #fff' : '1px solid rgba(0,0,0,0.3)',
            opacity: car.fading ? 0.3 : 1,
            transition: `opacity ${fadeAfterMs}ms ease-out`,
            animation: car.bounce ? 'bounce 300ms ease' : undefined,
            pointerEvents: 'auto',
            cursor: 'pointer',
            boxShadow: `0 0 8px ${car.color}`,
          }}
        />
      ))}
    </div>
  );
}
