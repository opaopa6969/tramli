import { useState, useCallback } from 'react';
import { ReactFlowProvider } from '@xyflow/react';
import { useVizSocket } from './hooks/useVizSocket';
import { FlowBoard } from './components/FlowBoard';
import { CarPool } from './components/CarPool';
import { Metrics } from './components/Metrics';
import { Replay } from './components/Replay';

export default function App() {
  const { state, send, replay, setHeatDecay } = useVizSocket();
  const [selectedFlowId, setSelectedFlowId] = useState<string | null>(null);
  const [traceMode, setTraceMode] = useState(true);
  const [fadeAfterMs, setFadeAfterMs] = useState(3000);
  const [trailSeconds, setTrailSeconds] = useState(1.5);

  const handleTriggerStart = useCallback(() => {
    send({ type: 'trigger', action: 'start' });
  }, [send]);

  const handleTrailChange = useCallback((val: number) => {
    setTrailSeconds(val);
    setHeatDecay(val);
  }, [setHeatDecay]);

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100vh',
      background: '#0f172a',
      color: '#e2e8f0',
      fontFamily: 'system-ui, -apple-system, sans-serif',
    }}>
      {/* Header */}
      <header style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '8px 16px',
        background: '#0f172a',
        borderBottom: '1px solid #1e293b',
        flexWrap: 'wrap',
        gap: 8,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 16, fontWeight: 700 }}>tramli-viz</span>
          {state.flowName && (
            <span style={{ fontSize: 12, color: '#64748b' }}>/ {state.flowName}</span>
          )}

          <button
            onClick={() => setTraceMode(m => !m)}
            style={{
              background: traceMode ? '#7c3aed' : '#1e293b',
              color: '#fff',
              border: '1px solid',
              borderColor: traceMode ? '#7c3aed' : '#334155',
              borderRadius: 6,
              padding: '4px 10px',
              fontSize: 11,
              fontWeight: 600,
              cursor: 'pointer',
              fontFamily: 'monospace',
            }}
          >
            {traceMode ? 'Trace ON' : 'Trace OFF'}
          </button>

          <label style={labelStyle}>
            Fade
            <select value={fadeAfterMs} onChange={e => setFadeAfterMs(Number(e.target.value))} style={selectStyle}>
              <option value={1000}>1s</option>
              <option value={2000}>2s</option>
              <option value={3000}>3s</option>
              <option value={5000}>5s</option>
              <option value={10000}>10s</option>
              <option value={999999}>off</option>
            </select>
          </label>

          <label style={labelStyle}>
            Trail
            <select value={trailSeconds} onChange={e => handleTrailChange(Number(e.target.value))} style={selectStyle}>
              <option value={0.5}>0.5s</option>
              <option value={1}>1s</option>
              <option value={1.5}>1.5s</option>
              <option value={2}>2s</option>
              <option value={5}>5s</option>
              <option value={10}>10s</option>
              <option value={30}>30s</option>
              <option value={60}>1min</option>
              <option value={300}>5min</option>
              <option value={1800}>30min</option>
              <option value={3600}>1h</option>
              <option value={21600}>6h</option>
              <option value={86400}>1day</option>
            </select>
          </label>
        </div>

        <button
          onClick={handleTriggerStart}
          style={{
            background: '#3b82f6',
            color: '#fff',
            border: 'none',
            borderRadius: 6,
            padding: '6px 14px',
            fontSize: 12,
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          + Spawn Flow
        </button>
      </header>

      {/* Main content */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        <div style={{ flex: 1 }}>
          <ReactFlowProvider>
            <FlowBoard
              states={state.states}
              edges={state.edges}
              flowPositions={state.flowPositions}
              transits={state.transits}
              events={state.events}
              edgeCounts={state.edgeCounts}
              nodeCounts={state.nodeCounts}
              edgeHeat={state.edgeHeat}
              selectedFlowId={selectedFlowId}
              onSelectFlow={setSelectedFlowId}
              traceMode={traceMode}
              fadeAfterMs={fadeAfterMs}
            />
          </ReactFlowProvider>
        </div>

        <div style={{
          width: 260,
          borderLeft: '1px solid #1e293b',
          display: 'flex',
          flexDirection: 'column',
          background: '#0f172a',
        }}>
          <div style={{ flex: 1, overflow: 'auto' }}>
            <CarPool
              flowPositions={state.flowPositions}
              flowStarted={state.flowStarted}
              selectedFlowId={selectedFlowId}
              onSelect={setSelectedFlowId}
            />
          </div>
          <div style={{ borderTop: '1px solid #1e293b' }}>
            <Metrics
              throughput={state.metrics.throughput}
              errorRate={state.metrics.errorRate}
              avgLatencyMicros={state.metrics.avgLatencyMicros}
              connected={state.connected}
            />
          </div>
        </div>
      </div>

      <Replay eventCount={state.events.length} onReplay={replay} />
    </div>
  );
}

const labelStyle: React.CSSProperties = {
  fontSize: 11, color: '#64748b', display: 'flex', alignItems: 'center', gap: 4,
};
const selectStyle: React.CSSProperties = {
  background: '#1e293b', color: '#e2e8f0', border: '1px solid #334155',
  borderRadius: 4, padding: '2px 4px', fontSize: 11, fontFamily: 'monospace',
};
