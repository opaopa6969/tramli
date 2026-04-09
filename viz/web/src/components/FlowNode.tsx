import { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import type { NodeProps } from '@xyflow/react';

export interface FlowNodeData {
  label: string;
  initial: boolean;
  terminal: boolean;
  count: number;       // active flows at this state
  throughput: number;   // total arrivals at this state
}

function FlowNodeComponent({ data }: NodeProps) {
  const d = data as unknown as FlowNodeData;
  const bg = d.initial
    ? '#3b82f6'
    : d.terminal
      ? '#22c55e'
      : '#475569';

  return (
    <div
      style={{
        background: bg,
        color: '#fff',
        padding: '8px 16px',
        borderRadius: 8,
        fontSize: 12,
        fontWeight: 600,
        fontFamily: 'monospace',
        minWidth: 120,
        textAlign: 'center',
        position: 'relative',
        border: '2px solid rgba(255,255,255,0.2)',
        boxShadow: d.count > 0 ? `0 0 12px ${bg}` : 'none',
      }}
    >
      <Handle type="target" position={Position.Top} style={handleStyle} />
      <Handle type="target" position={Position.Left} id="left-target" style={handleStyle} />
      <Handle type="target" position={Position.Right} id="right-target" style={handleStyle} />
      {d.label}
      {/* Active count badge (top-right, amber) */}
      {d.count > 0 && (
        <span style={{ ...badgeStyle, top: -8, right: -8, background: '#f59e0b', color: '#000' }}>
          {d.count}
        </span>
      )}
      {/* Throughput counter (bottom-left, subtle) */}
      {d.throughput > 0 && (
        <span style={{
          position: 'absolute',
          bottom: -7,
          left: -4,
          background: '#1e293b',
          color: '#94a3b8',
          borderRadius: 4,
          padding: '0 4px',
          fontSize: 9,
          fontWeight: 400,
          border: '1px solid #334155',
          lineHeight: '14px',
        }}>
          {d.throughput}
        </span>
      )}
      <Handle type="source" position={Position.Bottom} style={handleStyle} />
      <Handle type="source" position={Position.Left} id="left-source" style={handleStyle} />
      <Handle type="source" position={Position.Right} id="right-source" style={handleStyle} />
    </div>
  );
}

const handleStyle: React.CSSProperties = { background: '#94a3b8', width: 6, height: 6 };
const badgeStyle: React.CSSProperties = {
  position: 'absolute',
  borderRadius: '50%',
  width: 20,
  height: 20,
  fontSize: 10,
  fontWeight: 700,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
};

export const FlowNode = memo(FlowNodeComponent);
