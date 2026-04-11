export type ScenarioKind = 'happy' | 'error' | 'guard_rejection' | 'timeout';
export interface FlowScenario {
    name: string;
    kind: ScenarioKind;
    steps: string[];
}
export interface FlowTestPlan {
    scenarios: readonly FlowScenario[];
}
