import { useMemo, useCallback, useState, useEffect } from 'react';
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  type Node,
  type Edge,
  type NodeChange,
  type EdgeMouseHandler,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { FlowNode, type FlowNodeData } from './FlowNode';
import { CarLayer } from './CarLayer';
import { TraceLayer } from './TraceLayer';
import { ArrowEdge } from './ArrowEdge';
import { Legend } from './Legend';
import type { StateInfo, EdgeInfo, VizEvent } from '../types';
import type { TransitAnimation } from '../hooks/useVizSocket';

interface FlowBoardProps {
  states: StateInfo[];
  edges: EdgeInfo[];
  flowPositions: Map<string, string>;
  transits: TransitAnimation[];
  events: VizEvent[];
  edgeCounts: Map<string, number>;
  nodeCounts: Map<string, number>;
  edgeHeat: Map<string, number>;
  selectedFlowId: string | null;
  onSelectFlow: (flowId: string) => void;
  traceMode: boolean;
  fadeAfterMs: number;
}

const nodeTypes = { flowNode: FlowNode };
const edgeTypes = { arrow: ArrowEdge };

const HANDLE_CYCLE = [undefined, 'left', 'right'] as const;
type HandleSide = typeof HANDLE_CYCLE[number];

function nextHandle(current: HandleSide): HandleSide {
  const idx = HANDLE_CYCLE.indexOf(current);
  return HANDLE_CYCLE[(idx + 1) % HANDLE_CYCLE.length];
}

function handleId(side: HandleSide, type: 'source' | 'target'): string | undefined {
  if (!side) return undefined; // default top/bottom
  return `${side}-${type}`;
}

/** Auto-detect handle sides based on node positions. */
function autoHandles(from: StateInfo, to: StateInfo): { source: HandleSide; target: HandleSide } {
  const goingUp = to.y < from.y - 10;
  const sameRow = Math.abs(to.y - from.y) <= 10;
  if (goingUp) {
    const toLeft = to.x < from.x;
    return { source: toLeft ? 'left' : 'right', target: toLeft ? 'right' : 'left' };
  }
  if (sameRow) {
    const leftToRight = to.x > from.x;
    return { source: leftToRight ? 'right' : 'left', target: leftToRight ? 'left' : 'right' };
  }
  return { source: undefined, target: undefined };
}

// ── localStorage persistence ──


const STORAGE_KEY = 'tramli-viz-layout';

interface SavedLayout {
  positions: Record<string, { x: number; y: number }>;
  handles: Record<string, { source: HandleSide; target: HandleSide }>;
}

function loadLayout(): SavedLayout | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function saveLayout(layout: SavedLayout) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(layout));
}

// ── Component ──

export function FlowBoard({ states, edges, flowPositions, transits, events, edgeCounts, nodeCounts, edgeHeat, selectedFlowId, onSelectFlow, traceMode, fadeAfterMs }: FlowBoardProps) {
  const [livePositions, setLivePositions] = useState<Map<string, { x: number; y: number }>>(new Map());
  const [handleOverrides, setHandleOverrides] = useState<Map<string, { source: HandleSide; target: HandleSide }>>(new Map());

  // Load saved layout on mount
  useEffect(() => {
    const saved = loadLayout();
    if (!saved) return;
    if (saved.positions) {
      setLivePositions(new Map(Object.entries(saved.positions)));
    }
    if (saved.handles) {
      setHandleOverrides(new Map(Object.entries(saved.handles)));
    }
  }, []);

  const doSave = useCallback(() => {
    const positions: Record<string, { x: number; y: number }> = {};
    for (const [k, v] of livePositions) positions[k] = v;
    const handles: Record<string, { source: HandleSide; target: HandleSide }> = {};
    for (const [k, v] of handleOverrides) handles[k] = v;
    saveLayout({ positions, handles });
  }, [livePositions, handleOverrides]);

  const stateCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const [, stateName] of flowPositions) {
      counts.set(stateName, (counts.get(stateName) ?? 0) + 1);
    }
    return counts;
  }, [flowPositions]);

  const effectiveStates: StateInfo[] = useMemo(() =>
    states.map(s => {
      const pos = livePositions.get(s.name);
      return pos ? { ...s, x: pos.x, y: pos.y } : s;
    }),
    [states, livePositions],
  );

  const effectiveStateMap = useMemo(() => {
    const map = new Map<string, StateInfo>();
    for (const s of effectiveStates) map.set(s.name, s);
    return map;
  }, [effectiveStates]);

  const rfNodes: Node[] = useMemo(() =>
    effectiveStates.map(s => ({
      id: s.name,
      type: 'flowNode',
      position: { x: s.x, y: s.y },
      data: {
        label: s.name,
        initial: s.initial,
        terminal: s.terminal,
        count: stateCounts.get(s.name) ?? 0,
        throughput: nodeCounts.get(s.name) ?? 0,
      } satisfies FlowNodeData,
      draggable: true,
    })),
    [effectiveStates, stateCounts, nodeCounts],
  );

  // Per-source outgoing totals for proportional edge width
  const sourceOutTotals = useMemo(() => {
    const totals = new Map<string, number>();
    for (const e of edges) {
      const key = `${e.from}->${e.to}`;
      const count = edgeCounts.get(key) ?? 0;
      totals.set(e.from, (totals.get(e.from) ?? 0) + count);
    }
    return totals;
  }, [edges, edgeCounts]);

  const rfEdges: Edge[] = useMemo(() =>
    edges.map((e, i) => {
      const edgeKey = `${e.from}->${e.to}`;
      const fromState = effectiveStateMap.get(e.from);
      const toState = effectiveStateMap.get(e.to);
      const override = handleOverrides.get(edgeKey);
      const auto = fromState && toState ? autoHandles(fromState, toState) : { source: undefined as HandleSide, target: undefined as HandleSide };
      const srcSide = override?.source ?? auto.source;
      const tgtSide = override?.target ?? auto.target;

      // Color: error=red, external=amber, branch=white, auto=gray
      const edgeColor = e.type === 'error' ? '#ef4444'
        : e.type === 'external' ? '#f59e0b'
        : e.type === 'branch' ? '#e2e8f0'
        : '#64748b';
      const count = edgeCounts.get(edgeKey) ?? 0;
      const label = count > 0 ? `${e.label} (${count})` : e.label;

      // Proportional width: 60% of previous max
      const sourceTotal = sourceOutTotals.get(e.from) ?? 0;
      const ratio = sourceTotal > 0 ? count / sourceTotal : 0;
      const proportionalWidth = sourceTotal > 0 ? 1.5 + ratio * 3.9 : 1.5;

      const heat = edgeHeat.get(edgeKey) ?? 0;
      const heatIntensity = Math.min(heat / 3, 1);
      const glowWidth = proportionalWidth + heatIntensity * 2;
      const glowFilter = heatIntensity > 0.08
        ? `drop-shadow(0 0 ${3 + heatIntensity * 8}px ${edgeColor})`
        : undefined;

      return {
        id: `e-${i}`,
        type: 'arrow',
        source: e.from,
        target: e.to,
        data: { edgeKey, baseWidth: proportionalWidth, glowWidth, heatIntensity },
        label,
        sourceHandle: handleId(srcSide, 'source'),
        targetHandle: handleId(tgtSide, 'target'),
        style: {
          stroke: edgeColor,
          // error=dense red dash, branch=gray dash, auto/external=solid
          strokeDasharray: e.type === 'error' ? '8 3' : e.type === 'branch' ? '6 4' : undefined,
          strokeWidth: glowWidth,
          filter: glowFilter,
          transition: 'stroke-width 200ms, filter 200ms',
        },
        labelStyle: { fill: '#94a3b8', fontSize: 10, fontFamily: 'monospace' },
        labelBgStyle: { fill: '#0f172a', fillOpacity: 0.8 },
      } as Edge;
    }),
    [edges, effectiveStateMap, edgeCounts, edgeHeat, handleOverrides],
  );

  const handleSelect = useCallback((flowId: string) => onSelectFlow(flowId), [onSelectFlow]);

  const handleNodesChange = useCallback((changes: NodeChange[]) => {
    setLivePositions(prev => {
      const next = new Map(prev);
      for (const change of changes) {
        if (change.type === 'position' && change.position) {
          next.set(change.id, change.position);
        }
      }
      return next;
    });
  }, []);

  // Double-click edge to cycle handle sides
  const handleEdgeDoubleClick: EdgeMouseHandler = useCallback((_event, edge) => {
    const key = (edge.data as any)?.edgeKey as string | undefined;
    if (!key) return;
    setHandleOverrides(prev => {
      const next = new Map(prev);
      const current = next.get(key) ?? { source: undefined as HandleSide, target: undefined as HandleSide };
      // Cycle target handle first, then source
      const newTarget = nextHandle(current.target);
      next.set(key, { source: current.source, target: newTarget });
      return next;
    });
  }, []);

  // Right-click edge to cycle source handle
  const handleEdgeContextMenu: EdgeMouseHandler = useCallback((event, edge) => {
    event.preventDefault();
    const key = (edge.data as any)?.edgeKey as string | undefined;
    if (!key) return;
    setHandleOverrides(prev => {
      const next = new Map(prev);
      const current = next.get(key) ?? { source: undefined as HandleSide, target: undefined as HandleSide };
      next.set(key, { source: nextHandle(current.source), target: current.target });
      return next;
    });
  }, []);

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      <Legend />
      {/* Save button (floating) */}
      <button
        onClick={doSave}
        style={{
          position: 'absolute', top: 8, right: 8, zIndex: 10,
          background: '#1e293b', color: '#94a3b8', border: '1px solid #334155',
          borderRadius: 4, padding: '4px 10px', fontSize: 11, cursor: 'pointer',
          fontFamily: 'monospace',
        }}
      >
        Save Layout
      </button>
      <ReactFlow
        nodes={rfNodes}
        edges={rfEdges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodesChange={handleNodesChange}
        onEdgeDoubleClick={handleEdgeDoubleClick}
        onEdgeContextMenu={handleEdgeContextMenu}
        nodesConnectable={false}
        fitView
        proOptions={{ hideAttribution: true }}
        minZoom={0.3}
        maxZoom={2}
      >
        <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="#1e293b" />
        {traceMode ? (
          <TraceLayer
            states={effectiveStates}
            flowPositions={flowPositions}
            transits={transits}
            events={events}
            selectedFlowId={selectedFlowId}
            onSelect={handleSelect}
            fadeAfterMs={fadeAfterMs}
          />
        ) : (
          <CarLayer
            states={effectiveStates}
            flowPositions={flowPositions}
            events={events}
            selectedFlowId={selectedFlowId}
            onSelect={handleSelect}
          />
        )}
      </ReactFlow>
    </div>
  );
}
