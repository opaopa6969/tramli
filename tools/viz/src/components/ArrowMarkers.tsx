import { useEffect, useRef } from 'react';

const COLORS: Record<string, string> = {
  gray: '#64748b',
  amber: '#f59e0b',
  red: '#ef4444',
};

/**
 * Inject custom arrow markers directly into React Flow's edge SVG.
 * Uses a compact viewBox (0 0 4 4) so arrows render cleanly even at small sizes.
 * markerUnits=strokeWidth → size scales with line thickness automatically.
 */
export function useCustomArrowMarkers() {
  const injected = useRef(false);

  useEffect(() => {
    function inject() {
      // Find the SVG that contains edge paths
      const edgePath = document.querySelector('.react-flow__edge-path');
      if (!edgePath) return false;
      const svg = edgePath.closest('svg');
      if (!svg) return false;

      let defs = svg.querySelector('defs.tramli-arrows');
      if (!defs) {
        defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
        defs.setAttribute('class', 'tramli-arrows');
        svg.prepend(defs);
      }

      for (const [name, color] of Object.entries(COLORS)) {
        const id = `tarrow-${name}`;
        if (defs.querySelector(`#${id}`)) continue;

        const marker = document.createElementNS('http://www.w3.org/2000/svg', 'marker');
        marker.setAttribute('id', id);
        // Compact viewBox: triangle fits in 4×4 units
        marker.setAttribute('viewBox', '0 0 4 4');
        marker.setAttribute('refX', '4');   // tip at path endpoint
        marker.setAttribute('refY', '2');   // centered vertically
        marker.setAttribute('markerWidth', '4');
        marker.setAttribute('markerHeight', '4');
        // strokeWidth units → visual size = markerWidth × edge strokeWidth
        // so 4 × 2px line = 8px visual, 4 × 8px line = 32px visual
        marker.setAttribute('orient', 'auto-start-reverse');

        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('d', 'M 0 0 L 4 2 L 0 4 Z');
        path.setAttribute('fill', color);
        marker.appendChild(path);
        defs.appendChild(marker);
      }
      injected.current = true;
      return true;
    }

    if (inject()) return;
    // Retry until edges render
    const timer = setInterval(() => {
      if (inject()) clearInterval(timer);
    }, 200);
    return () => clearInterval(timer);
  }, []);
}

export function arrowMarkerId(edgeType: string): string {
  if (edgeType === 'error') return 'url(#tarrow-red)';
  if (edgeType === 'external') return 'url(#tarrow-amber)';
  return 'url(#tarrow-gray)';
}
