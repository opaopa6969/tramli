"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.useFlow = useFlow;
const react_1 = require("react");
const tramli_1 = require("@unlaxer/tramli");
/**
 * React hook that manages a tramli flow lifecycle.
 *
 * Creates a FlowEngine + InMemoryFlowStore once per mount,
 * starts the flow in useEffect, and exposes state/context/resume.
 */
function useFlow(definition, options) {
    const [state, setState] = (0, react_1.useState)(null);
    const [context, setContext] = (0, react_1.useState)(null);
    const [flowId, setFlowId] = (0, react_1.useState)(null);
    const [error, setError] = (0, react_1.useState)(null);
    const [isLoading, setIsLoading] = (0, react_1.useState)(true);
    // Singleton store + engine per mount
    const storeRef = (0, react_1.useRef)(null);
    const engineRef = (0, react_1.useRef)(null);
    const flowIdRef = (0, react_1.useRef)(null);
    if (storeRef.current === null) {
        storeRef.current = new tramli_1.InMemoryFlowStore();
        engineRef.current = tramli_1.Tramli.engine(storeRef.current);
    }
    // Sync React state from a flow instance
    const syncFromInstance = (0, react_1.useCallback)((instance) => {
        setState(instance.currentState);
        setContext(instance.context);
        setFlowId(instance.id);
        flowIdRef.current = instance.id;
    }, []);
    // Start flow on mount
    (0, react_1.useEffect)(() => {
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
    const resume = (0, react_1.useCallback)(async (externalData) => {
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
