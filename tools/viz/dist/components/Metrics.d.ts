interface MetricsProps {
    throughput: number;
    errorRate: number;
    avgLatencyMicros: number;
    connected: boolean;
}
export declare function Metrics({ throughput, errorRate, avgLatencyMicros, connected }: MetricsProps): import("react/jsx-runtime").JSX.Element;
export {};
