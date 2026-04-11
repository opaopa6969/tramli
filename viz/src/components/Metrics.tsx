interface MetricsProps {
  throughput: number;
  errorRate: number;
  avgLatencyMicros: number;
  connected: boolean;
}

function MetricCard({ label, value, unit, color }: { label: string; value: string; unit: string; color: string }) {
  return (
    <div style={{
      background: '#1e293b',
      borderRadius: 8,
      padding: '8px 12px',
      flex: 1,
    }}>
      <div style={{ fontSize: 10, color: '#64748b', marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 700, color, fontFamily: 'monospace' }}>
        {value}
        <span style={{ fontSize: 10, fontWeight: 400, color: '#64748b', marginLeft: 4 }}>{unit}</span>
      </div>
    </div>
  );
}

export function Metrics({ throughput, errorRate, avgLatencyMicros, connected }: MetricsProps) {
  return (
    <div style={{ padding: 12 }}>
      <h3 style={{ margin: '0 0 8px', fontSize: 13, color: '#94a3b8', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
        Metrics
        <span style={{
          width: 8, height: 8, borderRadius: '50%',
          background: connected ? '#22c55e' : '#ef4444',
        }} />
      </h3>
      <div style={{ display: 'flex', gap: 8, flexDirection: 'column' }}>
        <MetricCard
          label="Throughput"
          value={throughput.toFixed(1)}
          unit="tx/s"
          color="#60a5fa"
        />
        <MetricCard
          label="Error Rate"
          value={(errorRate * 100).toFixed(1)}
          unit="%"
          color={errorRate > 0.1 ? '#ef4444' : '#22c55e'}
        />
        <MetricCard
          label="Avg Latency"
          value={avgLatencyMicros > 1000 ? (avgLatencyMicros / 1000).toFixed(1) : avgLatencyMicros.toString()}
          unit={avgLatencyMicros > 1000 ? 'ms' : 'us'}
          color="#f59e0b"
        />
      </div>
    </div>
  );
}
