export interface VersionedTransitionEvent {
    flowId: string;
    version: number;
    type: 'TRANSITION' | 'COMPENSATION';
    from: string | null;
    to: string;
    trigger: string;
    timestamp: Date;
    stateSnapshot: string;
}
export interface CompensationPlan {
    action: string;
    metadata: Record<string, string>;
}
export type CompensationResolver = (event: VersionedTransitionEvent, cause: Error) => CompensationPlan | null;
export interface ProjectionReducer<T> {
    initialState(): T;
    apply(current: T, event: VersionedTransitionEvent): T;
}
