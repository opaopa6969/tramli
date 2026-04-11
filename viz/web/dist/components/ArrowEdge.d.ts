import { type EdgeProps } from '@xyflow/react';
/**
 * Custom edge: line stops at arrow base, triangle rendered at exact
 * path position + tangent angle. No SVG markers — pure geometry.
 */
declare function ArrowEdgeComponent(props: EdgeProps): import("react/jsx-runtime").JSX.Element;
export declare const ArrowEdge: typeof ArrowEdgeComponent;
export {};
