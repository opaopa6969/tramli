import { createContext, useContext, type ReactNode } from 'react';
import type { FlowDefinition } from '@unlaxer/tramli';
import { useFlow, type UseFlowResult } from './use-flow.js';
import type { DataInput } from './data-input.js';

export interface FlowProviderProps<S extends string> {
  definition: FlowDefinition<S>;
  initialData?: DataInput;
  sessionId?: string;
  children: ReactNode;
}

const FlowReactContext = createContext<UseFlowResult<any> | null>(null);

export function FlowProvider<S extends string>({
  definition,
  initialData,
  sessionId,
  children,
}: FlowProviderProps<S>) {
  const flow = useFlow(definition, { initialData, sessionId });
  return (
    <FlowReactContext.Provider value={flow}>
      {children}
    </FlowReactContext.Provider>
  );
}

export function useFlowContext<S extends string = string>(): UseFlowResult<S> {
  const ctx = useContext(FlowReactContext);
  if (!ctx) {
    throw new Error('useFlowContext must be used inside <FlowProvider>');
  }
  return ctx as UseFlowResult<S>;
}
