import { useState, useRef, useEffect, useCallback } from 'react';
import {
  Tramli,
  InMemoryFlowStore,
  FlowInstance,
  type FlowDefinition,
  type FlowContext,
} from '@unlaxer/tramli';
import { resolveData, type DataInput } from './data-input.js';

export interface FlowChainStep {
  definition: FlowDefinition<any>;
  initialData?: DataInput;
  when?: (prevTerminalState: string) => boolean;
}

export interface UseFlowChainResult {
  state: string | null;
  context: FlowContext | null;
  flowId: string | null;
  error: Error | null;
  isLoading: boolean;
  stepIndex: number;
  resume: (externalData?: DataInput) => Promise<void>;
}

export function useFlowChain(steps: FlowChainStep[]): UseFlowChainResult {
  const [state, setState] = useState<string | null>(null);
  const [context, setContext] = useState<FlowContext | null>(null);
  const [flowId, setFlowId] = useState<string | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [stepIndex, setStepIndex] = useState(0);

  const storeRef = useRef<InMemoryFlowStore | null>(null);
  const engineRef = useRef<ReturnType<typeof Tramli.engine> | null>(null);
  const flowIdRef = useRef<string | null>(null);
  const stepIndexRef = useRef(0);
  const stepsRef = useRef(steps);
  stepsRef.current = steps;

  if (storeRef.current === null) {
    storeRef.current = new InMemoryFlowStore();
    engineRef.current = Tramli.engine(storeRef.current);
  }

  const syncFromInstance = useCallback((instance: FlowInstance<any>) => {
    setState(instance.currentState);
    setContext(instance.context);
    setFlowId(instance.id);
    flowIdRef.current = instance.id;
  }, []);

  const tryAdvance = useCallback(
    async (instance: FlowInstance<any>, cancelled: { current: boolean }) => {
      if (!instance.isCompleted) return;

      const nextIdx = stepIndexRef.current + 1;
      const currentSteps = stepsRef.current;
      if (nextIdx >= currentSteps.length) return;

      const nextStep = currentSteps[nextIdx];
      if (nextStep.when && !nextStep.when(instance.currentState)) return;

      stepIndexRef.current = nextIdx;
      if (!cancelled.current) setStepIndex(nextIdx);

      const sessionId = crypto.randomUUID();
      const initialData = resolveData(nextStep.initialData) ?? new Map<string, unknown>();
      const nextInstance = await engineRef.current!.startFlow(
        nextStep.definition,
        sessionId,
        initialData,
      );
      if (!cancelled.current) {
        syncFromInstance(nextInstance);
      }
      await tryAdvance(nextInstance, cancelled);
    },
    [syncFromInstance],
  );

  useEffect(() => {
    const cancelled = { current: false };

    async function start() {
      try {
        setIsLoading(true);
        setError(null);
        stepIndexRef.current = 0;
        setStepIndex(0);

        const step = stepsRef.current[0];
        const sessionId = crypto.randomUUID();
        const initialData = resolveData(step.initialData) ?? new Map<string, unknown>();
        const instance = await engineRef.current!.startFlow(
          step.definition,
          sessionId,
          initialData,
        );
        if (!cancelled.current) {
          syncFromInstance(instance);
          await tryAdvance(instance, cancelled);
        }
      } catch (e) {
        if (!cancelled.current) {
          setError(e instanceof Error ? e : new Error(String(e)));
        }
      } finally {
        if (!cancelled.current) setIsLoading(false);
      }
    }

    start();
    return () => {
      cancelled.current = true;
    };
    // steps identity is stable per mount — callers should useMemo if needed
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const resume = useCallback(
    async (externalData?: DataInput) => {
      const currentFlowId = flowIdRef.current;
      if (!currentFlowId || !engineRef.current) {
        throw new Error('Flow not started yet — cannot resume');
      }
      try {
        setIsLoading(true);
        setError(null);
        const step = stepsRef.current[stepIndexRef.current];
        const instance = await engineRef.current.resumeAndExecute(
          currentFlowId,
          step.definition,
          resolveData(externalData),
        );
        syncFromInstance(instance as FlowInstance<any>);
        await tryAdvance(instance as FlowInstance<any>, { current: false });
      } catch (e) {
        setError(e instanceof Error ? e : new Error(String(e)));
      } finally {
        setIsLoading(false);
      }
    },
    [syncFromInstance, tryAdvance],
  );

  return { state, context, flowId, error, isLoading, stepIndex, resume };
}
