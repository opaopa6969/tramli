import { useState, useRef, useEffect, useCallback } from 'react';
import { Tramli, InMemoryFlowStore, } from '@unlaxer/tramli';
/**
 * React hook that manages a tramli flow lifecycle.
 *
 * Creates a FlowEngine + InMemoryFlowStore once per mount,
 * starts the flow in useEffect, and exposes state/context/resume.
 */
export function useFlow(definition, options) {
    const [state, setState] = useState(null);
    const [context, setContext] = useState(null);
    const [flowId, setFlowId] = useState(null);
    const [error, setError] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    // Singleton store + engine per mount
    const storeRef = useRef(null);
    const engineRef = useRef(null);
    const flowIdRef = useRef(null);
    if (storeRef.current === null) {
        storeRef.current = new InMemoryFlowStore();
        engineRef.current = Tramli.engine(storeRef.current);
    }
    // Sync React state from a flow instance
    const syncFromInstance = useCallback((instance) => {
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
                const initialData = options?.initialData ?? new Map();
                const instance = await engineRef.current.startFlow(definition, sessionId, initialData);
                if (!cancelled) {
                    syncFromInstance(instance);
                }
            }
            catch (e) {
                if (!cancelled) {
                    setError(e instanceof Error ? e : new Error(String(e)));
                }
            }
            finally {
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
    const resume = useCallback(async (externalData) => {
        const currentFlowId = flowIdRef.current;
        if (!currentFlowId || !engineRef.current) {
            throw new Error('Flow not started yet — cannot resume');
        }
        try {
            setIsLoading(true);
            setError(null);
            const instance = await engineRef.current.resumeAndExecute(currentFlowId, definition, externalData);
            syncFromInstance(instance);
        }
        catch (e) {
            setError(e instanceof Error ? e : new Error(String(e)));
        }
        finally {
            setIsLoading(false);
        }
    }, [definition, syncFromInstance]);
    return { state, context, flowId, error, isLoading, resume };
}
