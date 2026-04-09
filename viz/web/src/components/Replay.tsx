import { useState, useEffect, useRef, useCallback } from 'react';

interface ReplayProps {
  eventCount: number;
  onReplay: (position: number) => void;
}

export function Replay({ eventCount, onReplay }: ReplayProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [position, setPosition] = useState(-1); // -1 = live mode
  const [speed, setSpeed] = useState(1);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const isLive = position === -1;

  const stop = useCallback(() => {
    setIsPlaying(false);
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const goLive = useCallback(() => {
    stop();
    setPosition(-1);
  }, [stop]);

  const play = useCallback(() => {
    if (position === -1) setPosition(0);
    setIsPlaying(true);
  }, [position]);

  useEffect(() => {
    if (!isPlaying) return;
    timerRef.current = setInterval(() => {
      setPosition(prev => {
        const next = prev + 1;
        if (next >= eventCount) {
          stop();
          return eventCount - 1;
        }
        return next;
      });
    }, 200 / speed);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isPlaying, speed, eventCount, stop]);

  useEffect(() => {
    if (position >= 0) onReplay(position);
  }, [position, onReplay]);

  const handleSlider = (e: React.ChangeEvent<HTMLInputElement>) => {
    stop();
    setPosition(Number(e.target.value));
  };

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      padding: '8px 16px',
      background: '#0f172a',
      borderTop: '1px solid #1e293b',
      fontSize: 12,
      fontFamily: 'monospace',
    }}>
      <button onClick={isLive ? play : goLive} style={btnStyle}>
        {isLive ? 'Replay' : 'Live'}
      </button>

      {!isLive && (
        <>
          <button onClick={isPlaying ? stop : play} style={btnStyle}>
            {isPlaying ? 'Pause' : 'Play'}
          </button>

          <button onClick={() => setPosition(p => Math.max(0, p - 1))} style={btnStyle} disabled={isPlaying}>
            {'<'}
          </button>
          <button onClick={() => setPosition(p => Math.min(eventCount - 1, p + 1))} style={btnStyle} disabled={isPlaying}>
            {'>'}
          </button>

          <input
            type="range"
            min={0}
            max={Math.max(0, eventCount - 1)}
            value={position}
            onChange={handleSlider}
            style={{ flex: 1 }}
          />

          <span style={{ color: '#64748b', minWidth: 60 }}>
            {position + 1} / {eventCount}
          </span>

          <select
            value={speed}
            onChange={e => setSpeed(Number(e.target.value))}
            style={{ background: '#1e293b', color: '#e2e8f0', border: '1px solid #334155', borderRadius: 4, padding: '2px 4px', fontSize: 11 }}
          >
            <option value={0.5}>0.5x</option>
            <option value={1}>1x</option>
            <option value={2}>2x</option>
            <option value={5}>5x</option>
          </select>
        </>
      )}

      {isLive && (
        <span style={{ color: '#22c55e', display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#22c55e', animation: 'pulse 2s infinite' }} />
          LIVE — {eventCount} events
        </span>
      )}
    </div>
  );
}

const btnStyle: React.CSSProperties = {
  background: '#1e293b',
  color: '#e2e8f0',
  border: '1px solid #334155',
  borderRadius: 4,
  padding: '4px 10px',
  cursor: 'pointer',
  fontSize: 11,
  fontFamily: 'monospace',
};
