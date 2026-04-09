import { useState, useRef, useEffect, useCallback } from 'react';
import {
  Tramli,
  InMemoryFlowStore,
  FlowInstance,
  type FlowDefinition,
  type FlowContext,
} from '@unlaxer/tramli';

export interface UseFlowOptions {
  /** Initial data to seed the flow context. */
  initialData?: Map<string, unknown>;
  /** Session ID for the flow instance. Defaults to crypto.randomUUID(). */
  sessionId?: string;
}

export interface UseFlowResult<S extends string> {
  /** Current flow state, or null before the flow starts. */
  state: S | null;
  /** Flow context, or null before the flow starts. */
  context: FlowContext | null;
  /** Flow instance ID, or null before the flow starts. */
  flowId: string | null;
  /** Error from the last operation, or null. */
  error: Error | null;
  /** True while startFlow or resume is in progress. */
  isLoading: boolean;
  /** Resume the flow with optional external data. */
  resume: (externalData?: Map<string, unknown>) => Promise<void>;
}

/**
 * React hook that manages a tramli flow lifecycle.
 *
 * Creates a FlowEngine + InMemoryFlowStore once per mount,
 * starts the flow in useEffect, and exposes state/context/resume.
 */
export function useFlow<S extends string>(
  definition: FlowDefinition<S>,
  options?: UseFlowOptions,
): UseFlowResult<S> {
  const [state, setState] = useState<S | null>(null);
  const [context, setContext] = useState<FlowContext | null>(null);
  const [flowId, setFlowId] = useState<string | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Singleton store + engine per mount
  const storeRef = useRef<InMemoryFlowStore | null>(null);
  const engineRef = useRef<ReturnType<typeof Tramli.engine> | null>(null);
  const flowIdRef = useRef<string | null>(null);

  if (storeRef.current === null) {
    storeRef.current = new InMemoryFlowStore();
    engineRef.current = Tramli.engine(storeRef.current);
  }

  // Sync React state from a flow instance
  const syncFromInstance = useCallback((instance: FlowInstance<S>) => {
    setState(instance.currentState);
    setContext(instance.context);
    setFlowId(instance.id);
    flowIdRef.current = instance.id;
  }, []);

  // Start flow on mount
  useEffect(() => {
    let cancelled = false;

    async function start() {
      try {
        setIsLoading(true);
        setError(null);
        const sessionId = options?.sessionId ?? crypto.randomUUID();
        const initialData = options?.initialData ?? new Map<string, unknown>();
        const instance = await engineRef.current!.startFlow(
          definition,
          sessionId,
          initialData,
        );
        if (!cancelled) {
          syncFromInstance(instance);
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e : new Error(String(e)));
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    start();

    return () => {
      cancelled = true;
    };
    // definition identity is stable per mount — callers should useMemo if needed
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [definition]);

  // Stable resume callback
  const resume = useCallback(
    async (externalData?: Map<string, unknown>) => {
      const currentFlowId = flowIdRef.current;
      if (!currentFlowId || !engineRef.current) {
        throw new Error('Flow not started yet — cannot resume');
      }
      try {
        setIsLoading(true);
        setError(null);
        const instance = await engineRef.current.resumeAndExecute(
          currentFlowId,
          definition,
          externalData,
        );
        syncFromInstance(instance as FlowInstance<S>);
      } catch (e) {
        setError(e instanceof Error ? e : new Error(String(e)));
      } finally {
        setIsLoading(false);
      }
    },
    [definition, syncFromInstance],
  );

  return { state, context, flowId, error, isLoading, resume };
}
