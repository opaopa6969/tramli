import { useMemo } from 'react';

interface CarPoolProps {
  flowPositions: Map<string, string>;
  flowStarted: Map<string, number>;
  selectedFlowId: string | null;
  onSelect: (flowId: string) => void;
}

export function CarPool({ flowPositions, flowStarted, selectedFlowId, onSelect }: CarPoolProps) {
  const entries = useMemo(() => {
    const now = Date.now();
    return [...flowPositions.entries()]
      .map(([flowId, state]) => ({
        flowId,
        state,
        age: Math.round((now - (flowStarted.get(flowId) ?? now)) / 1000),
      }))
      .sort((a, b) => b.age - a.age)
      .slice(0, 30);
  }, [flowPositions, flowStarted]);

  return (
    <div style={{ padding: 12, overflowY: 'auto', maxHeight: '100%' }}>
      <h3 style={{ margin: '0 0 8px', fontSize: 13, color: '#94a3b8', fontWeight: 600 }}>
        Active Flows ({flowPositions.size})
      </h3>
      {entries.map(e => (
        <div
          key={e.flowId}
          onClick={() => onSelect(e.flowId)}
          style={{
            padding: '4px 8px',
            marginBottom: 2,
            borderRadius: 4,
            background: e.flowId === selectedFlowId ? '#1e3a5f' : 'transparent',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            fontSize: 11,
            fontFamily: 'monospace',
          }}
        >
          <span style={{
            width: 8, height: 8, borderRadius: '50%',
            background: e.state.includes('ERROR') || e.state === 'BLOCKED' ? '#ef4444'
              : e.state === 'COMPLETE' || e.state === 'COMPLETE_MFA' ? '#22c55e'
              : e.state === 'REDIRECTED' ? '#f59e0b'
              : '#60a5fa',
            flexShrink: 0,
          }} />
          <span style={{ color: '#e2e8f0', flex: 1 }}>{e.flowId.slice(0, 8)}</span>
          <span style={{ color: '#64748b', fontSize: 10 }}>{e.state}</span>
          <span style={{ color: '#475569', fontSize: 10, minWidth: 28, textAlign: 'right' }}>{e.age}s</span>
        </div>
      ))}
      {entries.length === 0 && (
        <div style={{ color: '#475569', fontSize: 11, fontStyle: 'italic' }}>No active flows</div>
      )}
    </div>
  );
}
