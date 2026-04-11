import type { VizEvent } from '../types';
import '@xyflow/react/dist/style.css';
export interface VizDashboardProps {
    /** WebSocket URL (default: ws://localhost:3001) */
    wsUrl?: string;
    /** Layout mode (default: 'layered') */
    layout?: 'layered' | 'grid' | 'free';
    /** Theme (default: 'dark') */
    theme?: 'dark' | 'light';
    /** Show metrics panel (default: true) */
    showMetrics?: boolean;
    /** Show active flows list (default: true) */
    showCarPool?: boolean;
    /** Show replay controls (default: true) */
    showReplay?: boolean;
    /** Max events to keep in memory (default: 10000) */
    maxEvents?: number;
    /** Event callback */
    onEvent?: (event: VizEvent) => void;
}
export declare function VizDashboard({ wsUrl, showMetrics, showCarPool, showReplay, }: VizDashboardProps): import("react/jsx-runtime").JSX.Element;
