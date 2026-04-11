import { useMemo } from 'react';
import { useReactFlow } from '@xyflow/react';
import type { StateInfo, VizEvent } from '../types';

interface CarLayerProps {
  states: StateInfo[];
  flowPositions: Map<string, string>;
  events: VizEvent[];
  selectedFlowId: string | null;
  onSelect: (flowId: string) => void;
}

/** Color based on the state the car is in. */
function carColor(stateName: string, states: StateInfo[]): string {
  const info = states.find(s => s.name === stateName);
  if (!info) return '#94a3b8';
  if (info.terminal) return stateName === 'BLOCKED' || stateName === 'TERMINAL_ERROR' ? '#ef4444' : '#22c55e';
  if (stateName === 'REDIRECTED') return '#f59e0b'; // waiting at external
  if (stateName === 'RETRIABLE_ERROR') return '#f97316';
  return '#60a5fa';
}

/** Check if a flow just had a guard rejection (look at last events). */
function isRejected(flowId: string, events: VizEvent[]): boolean {
  for (let i = events.length - 1; i >= Math.max(0, events.length - 20); i--) {
    const ev = events[i];
    if (ev.flowId === flowId && ev.type === 'guard' && ev.data.result === 'rejected') return true;
    if (ev.flowId === flowId && ev.type === 'transition') return false;
  }
  return false;
}

export function CarLayer({ states, flowPositions, events, selectedFlowId, onSelect }: CarLayerProps) {
  const { getViewport } = useReactFlow();
  const viewport = getViewport();

  const statePositionMap = useMemo(() => {
    const map = new Map<string, { x: number; y: number }>();
    for (const s of states) map.set(s.name, { x: s.x, y: s.y });
    return map;
  }, [states]);

  const cars = useMemo(() => {
    const result: Array<{
      flowId: string;
      x: number;
      y: number;
      color: string;
      bounce: boolean;
      fading: boolean;
    }> = [];

    // Spread cars at same node
    const nodeCounts = new Map<string, number>();
    const nodeIndices = new Map<string, number>();

    for (const [flowId, stateName] of flowPositions) {
      nodeCounts.set(stateName, (nodeCounts.get(stateName) ?? 0) + 1);
    }

    for (const [flowId, stateName] of flowPositions) {
      const pos = statePositionMap.get(stateName);
      if (!pos) continue;
      const stateInfo = states.find(s => s.name === stateName);
      const isFading = stateInfo?.terminal ?? false;
      const idx = nodeIndices.get(stateName) ?? 0;
      nodeIndices.set(stateName, idx + 1);
      // Spread horizontally around node center
      const spread = 16;
      const count = nodeCounts.get(stateName) ?? 1;
      const offsetX = count > 1 ? (idx - (count - 1) / 2) * spread : 0;

      result.push({
        flowId,
        x: pos.x + 60 + offsetX, // offset right of node center
        y: pos.y + 30, // below node top
        color: carColor(stateName, states),
        bounce: isRejected(flowId, events),
        fading: isFading,
      });
    }
    return result;
  }, [flowPositions, statePositionMap, states, events]);

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
      {cars.map(car => (
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
            transition: 'left 400ms ease-out, top 400ms ease-out, opacity 1s ease-out',
            opacity: car.fading ? 0.3 : 1,
            animation: car.bounce ? 'bounce 300ms ease' : undefined,
            pointerEvents: 'auto',
            cursor: 'pointer',
            boxShadow: `0 0 6px ${car.color}`,
          }}
        />
      ))}
    </div>
  );
}
