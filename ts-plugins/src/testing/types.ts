export interface FlowScenario {
  name: string;
  steps: string[];
}

export interface FlowTestPlan {
  scenarios: readonly FlowScenario[];
}
