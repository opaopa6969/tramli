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
import type { StateInfo, FlowDefinitionInfo, VizEvent } from '../types';
import type { TransitAnimation } from '../hooks/useVizSocket';

interface FlowBoardProps {
  flows: FlowDefinitionInfo[];
  flowPositions: Map<string, string>;
  flowOwner: Map<string, string>;
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
  if (!side) return undefined;
  return `${side}-${type}`;
}

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

// ── Layout calculation for multi-SM groups ──

const GROUP_PADDING = 40;
const GROUP_GAP = 60;

interface GroupLayout {
  flowName: string;
  layer: 1 | 2;
  x: number;
  y: number;
  width: number;
  height: number;
}

function computeGroupLayouts(flows: FlowDefinitionInfo[]): GroupLayout[] {
  const layouts: GroupLayout[] = [];
  const layer1 = flows.filter(f => f.layer === 1);
  const layer2 = flows.filter(f => f.layer === 2);

  let nextX = 0;

  // Layer 1: horizontal across the top
  for (const f of layer1) {
    const { w, h } = smBounds(f.states);
    layouts.push({
      flowName: f.flowName,
      layer: 1,
      x: nextX,
      y: 0,
      width: w + GROUP_PADDING * 2,
      height: h + GROUP_PADDING * 2 + 30, // +30 for label
    });
    nextX += w + GROUP_PADDING * 2 + GROUP_GAP;
  }

  // Layer 2: grid below layer 1
  const layer1MaxH = layouts.reduce((max, l) => Math.max(max, l.height), 0);
  const topY = layer1.length > 0 ? layer1MaxH + GROUP_GAP : 0;
  const cols = Math.ceil(Math.sqrt(layer2.length));
  for (let i = 0; i < layer2.length; i++) {
    const f = layer2[i];
    const { w, h } = smBounds(f.states);
    const col = i % cols;
    const row = Math.floor(i / cols);
    layouts.push({
      flowName: f.flowName,
      layer: 2,
      x: col * (500 + GROUP_GAP),
      y: topY + row * (600 + GROUP_GAP),
      width: Math.max(w + GROUP_PADDING * 2, 400),
      height: h + GROUP_PADDING * 2 + 30,
    });
  }

  return layouts;
}

function smBounds(states: StateInfo[]): { w: number; h: number } {
  if (states.length === 0) return { w: 200, h: 100 };
  let maxX = 0, maxY = 0;
  for (const s of states) {
    maxX = Math.max(maxX, s.x + 120);
    maxY = Math.max(maxY, s.y + 36);
  }
  return { w: maxX, h: maxY };
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

export function FlowBoard({ flows, flowPositions, flowOwner, transits, events, edgeCounts, nodeCounts, edgeHeat, selectedFlowId, onSelectFlow, traceMode, fadeAfterMs }: FlowBoardProps) {
  const [livePositions, setLivePositions] = useState<Map<string, { x: number; y: number }>>(new Map());
  const [handleOverrides, setHandleOverrides] = useState<Map<string, { source: HandleSide; target: HandleSide }>>(new Map());
  const isMulti = flows.length > 1;

  useEffect(() => {
    const saved = loadLayout();
    if (!saved) return;
    if (saved.positions) setLivePositions(new Map(Object.entries(saved.positions)));
    if (saved.handles) setHandleOverrides(new Map(Object.entries(saved.handles)));
  }, []);

  const doSave = useCallback(() => {
    const positions: Record<string, { x: number; y: number }> = {};
    for (const [k, v] of livePositions) positions[k] = v;
    const handles: Record<string, { source: HandleSide; target: HandleSide }> = {};
    for (const [k, v] of handleOverrides) handles[k] = v;
    saveLayout({ positions, handles });
  }, [livePositions, handleOverrides]);

  // Group layouts for multi-SM
  const groupLayouts = useMemo(() => isMulti ? computeGroupLayouts(flows) : [], [flows, isMulti]);

  // Active flow counts per qualified state name "flowName:stateName"
  const stateCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const [flowId, stateName] of flowPositions) {
      const fn = flowOwner.get(flowId) ?? '';
      const key = isMulti ? `${fn}:${stateName}` : stateName;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return counts;
  }, [flowPositions, flowOwner, isMulti]);

  // Build all nodes
  const rfNodes: Node[] = useMemo(() => {
    const nodes: Node[] = [];

    for (const f of flows) {
      const gl = groupLayouts.find(g => g.flowName === f.flowName);
      const offsetX = gl ? gl.x + GROUP_PADDING : 0;
      const offsetY = gl ? gl.y + GROUP_PADDING + 30 : 0;

      // Group node (multi-SM only)
      if (gl) {
        const groupId = `group:${f.flowName}`;
        const groupPos = livePositions.get(groupId) ?? { x: gl.x, y: gl.y };
        nodes.push({
          id: groupId,
          type: 'group',
          position: groupPos,
          data: {},
          style: {
            width: gl.width,
            height: gl.height,
            background: 'rgba(30, 41, 59, 0.4)',
            border: '1px solid #334155',
            borderRadius: 12,
            fontSize: 13,
            fontWeight: 700,
            color: f.layer === 1 ? '#f59e0b' : '#60a5fa',
            padding: 8,
          },
          draggable: true,
        });
      }

      // State nodes
      for (const s of f.states) {
        const nodeId = isMulti ? `${f.flowName}:${s.name}` : s.name;
        const pos = livePositions.get(nodeId) ?? { x: s.x + offsetX, y: s.y + offsetY };
        const countKey = isMulti ? `${f.flowName}:${s.name}` : s.name;
        const throughputKey = `${f.flowName}:${s.name}`;
        nodes.push({
          id: nodeId,
          type: 'flowNode',
          position: pos,
          parentId: gl ? `group:${f.flowName}` : undefined,
          extent: gl ? 'parent' as const : undefined,
          data: {
            label: s.name,
            initial: s.initial,
            terminal: s.terminal,
            count: stateCounts.get(countKey) ?? 0,
            throughput: nodeCounts.get(throughputKey) ?? 0,
          } satisfies FlowNodeData,
          draggable: true,
        });
      }
    }
    return nodes;
  }, [flows, groupLayouts, livePositions, stateCounts, nodeCounts, isMulti]);

  // Build effective state map for edge handle computation
  const effectiveStateMap = useMemo(() => {
    const map = new Map<string, StateInfo>();
    for (const f of flows) {
      for (const s of f.states) {
        const nodeId = isMulti ? `${f.flowName}:${s.name}` : s.name;
        const pos = livePositions.get(nodeId);
        map.set(nodeId, pos ? { ...s, x: pos.x, y: pos.y } : s);
      }
    }
    return map;
  }, [flows, livePositions, isMulti]);

  // Per-source outgoing totals
  const sourceOutTotals = useMemo(() => {
    const totals = new Map<string, number>();
    for (const f of flows) {
      for (const e of f.edges) {
        const edgeKey = `${f.flowName}:${e.from}->${e.to}`;
        const count = edgeCounts.get(edgeKey) ?? 0;
        const srcKey = isMulti ? `${f.flowName}:${e.from}` : e.from;
        totals.set(srcKey, (totals.get(srcKey) ?? 0) + count);
      }
    }
    return totals;
  }, [flows, edgeCounts, isMulti]);

  // Build all edges
  const rfEdges: Edge[] = useMemo(() => {
    const edges: Edge[] = [];
    let idx = 0;
    for (const f of flows) {
      for (const e of f.edges) {
        const srcId = isMulti ? `${f.flowName}:${e.from}` : e.from;
        const tgtId = isMulti ? `${f.flowName}:${e.to}` : e.to;
        const edgeKey = `${f.flowName}:${e.from}->${e.to}`;

        const fromState = effectiveStateMap.get(srcId);
        const toState = effectiveStateMap.get(tgtId);
        const override = handleOverrides.get(edgeKey);
        const auto = fromState && toState ? autoHandles(fromState, toState) : { source: undefined as HandleSide, target: undefined as HandleSide };
        const srcSide = override?.source ?? auto.source;
        const tgtSide = override?.target ?? auto.target;

        const edgeColor = e.type === 'error' ? '#ef4444'
          : e.type === 'external' ? '#f59e0b'
          : e.type === 'branch' ? '#e2e8f0'
          : '#64748b';
        const count = edgeCounts.get(edgeKey) ?? 0;
        const label = count > 0 ? `${e.label} (${count})` : e.label;

        const sourceTotal = sourceOutTotals.get(srcId) ?? 0;
        const ratio = sourceTotal > 0 ? count / sourceTotal : 0;
        const proportionalWidth = sourceTotal > 0 ? 1.5 + ratio * 3.9 : 1.5;

        const heat = edgeHeat.get(edgeKey) ?? 0;
        const heatIntensity = Math.min(heat / 3, 1);
        const glowWidth = proportionalWidth + heatIntensity * 2;
        const glowFilter = heatIntensity > 0.08
          ? `drop-shadow(0 0 ${3 + heatIntensity * 8}px ${edgeColor})`
          : undefined;

        edges.push({
          id: `e-${idx++}`,
          type: 'arrow',
          source: srcId,
          target: tgtId,
          data: { edgeKey, baseWidth: proportionalWidth, glowWidth, heatIntensity },
          label,
          sourceHandle: handleId(srcSide, 'source'),
          targetHandle: handleId(tgtSide, 'target'),
          style: {
            stroke: edgeColor,
            strokeDasharray: e.type === 'error' ? '8 3' : e.type === 'branch' ? '6 4' : undefined,
            strokeWidth: glowWidth,
            filter: glowFilter,
            transition: 'stroke-width 200ms, filter 200ms',
          },
          labelStyle: { fill: '#94a3b8', fontSize: 10, fontFamily: 'monospace' },
          labelBgStyle: { fill: '#0f172a', fillOpacity: 0.8 },
        } as Edge);
      }
    }
    return edges;
  }, [flows, effectiveStateMap, edgeCounts, edgeHeat, handleOverrides, sourceOutTotals, isMulti]);

  // Flatten all states with offsets for trace/car layers
  const allStates: StateInfo[] = useMemo(() => {
    const result: StateInfo[] = [];
    for (const f of flows) {
      const gl = groupLayouts.find(g => g.flowName === f.flowName);
      for (const s of f.states) {
        const nodeId = isMulti ? `${f.flowName}:${s.name}` : s.name;
        const pos = livePositions.get(nodeId);
        result.push({
          ...s,
          name: nodeId,
          x: pos?.x ?? (gl ? s.x + gl.x + GROUP_PADDING : s.x),
          y: pos?.y ?? (gl ? s.y + gl.y + GROUP_PADDING + 30 : s.y),
        });
      }
    }
    return result;
  }, [flows, groupLayouts, livePositions, isMulti]);

  // Map flowPositions to qualified names for car/trace layers
  const qualifiedPositions = useMemo(() => {
    if (!isMulti) return flowPositions;
    const map = new Map<string, string>();
    for (const [flowId, stateName] of flowPositions) {
      const fn = flowOwner.get(flowId) ?? '';
      map.set(flowId, `${fn}:${stateName}`);
    }
    return map;
  }, [flowPositions, flowOwner, isMulti]);

  // Qualify transit animations
  const qualifiedTransits = useMemo((): TransitAnimation[] => {
    if (!isMulti) return transits;
    return transits.map(t => ({
      ...t,
      from: `${t.flowName}:${t.from}`,
      to: `${t.flowName}:${t.to}`,
    }));
  }, [transits, isMulti]);

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

  const handleEdgeDoubleClick: EdgeMouseHandler = useCallback((_event, edge) => {
    const key = (edge.data as any)?.edgeKey as string | undefined;
    if (!key) return;
    setHandleOverrides(prev => {
      const next = new Map(prev);
      const current = next.get(key) ?? { source: undefined as HandleSide, target: undefined as HandleSide };
      next.set(key, { source: current.source, target: nextHandle(current.target) });
      return next;
    });
  }, []);

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
      <button
        onClick={doSave}
        style={{
          position: 'absolute', top: 8, right: 8, zIndex: 10,
          background: '#1e293b', color: '#94a3b8', border: '1px solid #334155',
          borderRadius: 4, padding: '4px 10px', fontSize: 11, cursor: 'pointer', fontFamily: 'monospace',
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
        minZoom={0.2}
        maxZoom={2}
      >
        <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="#1e293b" />
        {traceMode ? (
          <TraceLayer
            states={allStates}
            flowPositions={qualifiedPositions}
            transits={qualifiedTransits}
            events={events}
            selectedFlowId={selectedFlowId}
            onSelect={handleSelect}
            fadeAfterMs={fadeAfterMs}
          />
        ) : (
          <CarLayer
            states={allStates}
            flowPositions={qualifiedPositions}
            events={events}
            selectedFlowId={selectedFlowId}
            onSelect={handleSelect}
          />
        )}
      </ReactFlow>
    </div>
  );
}
