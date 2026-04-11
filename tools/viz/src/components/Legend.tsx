const isJa = typeof navigator !== 'undefined' && navigator.language.startsWith('ja');

const ITEMS = [
  { label: isJa ? 'Auto（自動遷移）' : 'Auto', color: '#64748b', dash: false },
  { label: isJa ? 'External（外部待ち）' : 'External', color: '#f59e0b', dash: false },
  { label: isJa ? 'Branch（条件分岐）' : 'Branch', color: '#e2e8f0', dash: true },
  { label: isJa ? 'Error（エラー遷移）' : 'Error', color: '#ef4444', dash: true },
];

export function Legend() {
  return (
    <div style={{
      position: 'absolute',
      bottom: 12,
      left: 12,
      zIndex: 10,
      background: 'rgba(15, 23, 42, 0.9)',
      border: '1px solid #1e293b',
      borderRadius: 6,
      padding: '8px 12px',
      fontSize: 11,
      fontFamily: 'monospace',
      display: 'flex',
      flexDirection: 'column',
      gap: 5,
    }}>
      {ITEMS.map(item => (
        <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <svg width={32} height={8}>
            <line
              x1={0} y1={4} x2={24} y2={4}
              stroke={item.color}
              strokeWidth={2}
              strokeDasharray={item.dash ? '4 2' : undefined}
            />
            <polygon
              points="24,0 32,4 24,8"
              fill={item.color}
            />
          </svg>
          <span style={{ color: '#94a3b8' }}>{item.label}</span>
        </div>
      ))}
    </div>
  );
}
