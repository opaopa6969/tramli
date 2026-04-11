import { useRef, useLayoutEffect, useState } from 'react';
import { getBezierPath, type EdgeProps } from '@xyflow/react';

/**
 * Custom edge: line stops at arrow base, triangle rendered at exact
 * path position + tangent angle. No SVG markers — pure geometry.
 */
function ArrowEdgeComponent(props: EdgeProps) {
  const {
    id,
    sourceX, sourceY, sourcePosition,
    targetX, targetY, targetPosition,
    style,
    data,
    label,
    labelStyle,
    labelShowBg,
    labelBgStyle,
  } = props;

  // Values from FlowBoard via data prop (more reliable than style parsing)
  const baseWidth: number = (data as any)?.baseWidth ?? 1.5;
  const glowWidth: number = (data as any)?.glowWidth ?? baseWidth;
  const heatIntensity: number = (data as any)?.heatIntensity ?? 0;

  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX, sourceY, sourcePosition,
    targetX, targetY, targetPosition,
  });

  const color = String(style?.stroke ?? '#64748b');
  const dashPattern = String(style?.strokeDasharray ?? '');
  const isDashed = dashPattern.length > 0;
  // Use glowWidth for line rendering (includes heat), baseWidth for arrow sizing
  const strokeWidth = glowWidth;
  const glowFilter = heatIntensity > 0.08
    ? `drop-shadow(0 0 ${3 + heatIntensity * 8}px ${color})`
    : undefined;

  // Arrow size based on baseWidth (transition ratio), NOT strokeWidth (which includes heat)
  // Equilateral triangle: halfWidth = height / √3
  const arrowLen = Math.max(baseWidth * 2.5 + 3, 8);
  const arrowHalfW = arrowLen / Math.sqrt(3);

  // Use ref + layoutEffect to read actual path geometry
  const pathRef = useRef<SVGPathElement>(null);
  const [arrowData, setArrowData] = useState<{
    tipX: number; tipY: number;
    lx: number; ly: number; rx: number; ry: number;
    totalLen: number;
  } | null>(null);

  useLayoutEffect(() => {
    const el = pathRef.current;
    if (!el) return;
    const totalLen = el.getTotalLength();
    if (totalLen < arrowLen + 2) return;

    const tip = el.getPointAtLength(totalLen);
    const base = el.getPointAtLength(totalLen - arrowLen);
    // Direction from base to tip — aligns triangle with the line's actual approach angle
    const angle = Math.atan2(tip.y - base.y, tip.x - base.x);

    const bx = base.x;
    const by = base.y;
    const px = -Math.sin(angle) * arrowHalfW;
    const py = Math.cos(angle) * arrowHalfW;

    setArrowData({
      tipX: tip.x, tipY: tip.y,
      lx: bx + px, ly: by + py,
      rx: bx - px, ry: by - py,
      totalLen,
    });
  }, [edgePath, arrowLen, arrowHalfW]);

  // Overlap line slightly into the triangle to eliminate gap
  const overlap = strokeWidth * 0.5;
  const showLen = arrowData ? arrowData.totalLen - arrowLen + overlap : undefined;
  const dashArray = showLen != null
    ? (isDashed ? dashPattern : `${showLen} 99999`)
    : (isDashed ? dashPattern : undefined);

  return (
    <g>
      {/* Hidden path for geometry measurement */}
      <path
        ref={pathRef}
        d={edgePath}
        fill="none"
        stroke="none"
      />
      {/* Visible edge line (shortened) */}
      <path
        d={edgePath}
        fill="none"
        className="react-flow__edge-path"
        style={{
          stroke: color,
          strokeWidth: `${strokeWidth}px`,
          strokeDasharray: dashArray,
          strokeLinecap: 'butt',
          filter: glowFilter,
          transition: 'stroke-width 200ms',
        }}
      />
      {/* Arrow triangle */}
      {arrowData && (
        <polygon
          points={`${arrowData.tipX},${arrowData.tipY} ${arrowData.lx},${arrowData.ly} ${arrowData.rx},${arrowData.ry}`}
          fill={color}
        />
      )}
      {/* Label */}
      {label && (
        <g transform={`translate(${labelX}, ${labelY})`}>
          {labelShowBg !== false && (
            <rect
              x={-30} y={-8} width={60} height={16} rx={3}
              fill={(labelBgStyle as any)?.fill ?? '#0f172a'}
              fillOpacity={(labelBgStyle as any)?.fillOpacity ?? 0.8}
            />
          )}
          <text
            textAnchor="middle"
            dominantBaseline="central"
            style={{
              fontSize: (labelStyle as any)?.fontSize ?? 10,
              fill: (labelStyle as any)?.fill ?? '#94a3b8',
              fontFamily: (labelStyle as any)?.fontFamily ?? 'monospace',
            }}
          >
            {String(label)}
          </text>
        </g>
      )}
      {/* Interaction area */}
      <path
        d={edgePath}
        fill="none"
        stroke="transparent"
        strokeWidth={Math.max(strokeWidth, 20)}
        className="react-flow__edge-interaction"
      />
    </g>
  );
}

export const ArrowEdge = ArrowEdgeComponent;
