/**
 * Inject custom arrow markers directly into React Flow's edge SVG.
 * Uses a compact viewBox (0 0 4 4) so arrows render cleanly even at small sizes.
 * markerUnits=strokeWidth → size scales with line thickness automatically.
 */
export declare function useCustomArrowMarkers(): void;
export declare function arrowMarkerId(edgeType: string): string;
