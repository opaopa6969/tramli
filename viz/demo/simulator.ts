import { Tramli, FlowEngine, InMemoryFlowStore } from '@unlaxer/tramli';
import { ObservabilityEnginePlugin } from '@unlaxer/tramli-plugins';
import { VizSink } from '../server/viz-sink.js';
import { startVizServer } from '../server/index.js';
import { oidcFlowDefinition, OidcRequest, OidcCallback, OIDC_STATES } from './oidc-flow.js';
import type { StateInfo, EdgeInfo } from '../shared/protocol.js';

// ── Layout ──

const OIDC_LAYOUT: Record<string, { x: number; y: number }> = {
  INIT:               { x: 400, y: 50 },
  REDIRECTED:         { x: 400, y: 150 },
  CALLBACK_RECEIVED:  { x: 400, y: 250 },
  TOKEN_EXCHANGED:    { x: 400, y: 350 },
  USER_RESOLVED:      { x: 400, y: 450 },
  RISK_CHECKED:       { x: 400, y: 550 },
  COMPLETE:           { x: 200, y: 700 },
  COMPLETE_MFA:       { x: 400, y: 700 },
  BLOCKED:            { x: 600, y: 700 },
  RETRIABLE_ERROR:    { x: 700, y: 150 },
  TERMINAL_ERROR:     { x: 700, y: 400 },
};

function buildStateInfos(): StateInfo[] {
  return Object.entries(OIDC_STATES).map(([name, cfg]) => ({
    name,
    initial: cfg.initial ?? false,
    terminal: cfg.terminal,
    ...OIDC_LAYOUT[name],
  }));
}

function buildEdgeInfos(): EdgeInfo[] {
  return [
    { from: 'INIT', to: 'REDIRECTED', type: 'auto', label: 'OidcInitProcessor' },
    { from: 'REDIRECTED', to: 'CALLBACK_RECEIVED', type: 'external', label: 'OidcCallbackGuard' },
    { from: 'CALLBACK_RECEIVED', to: 'TOKEN_EXCHANGED', type: 'auto', label: 'OidcTokenExchangeProcessor' },
    { from: 'TOKEN_EXCHANGED', to: 'USER_RESOLVED', type: 'auto', label: 'UserResolveProcessor' },
    { from: 'USER_RESOLVED', to: 'RISK_CHECKED', type: 'auto', label: 'RiskCheckProcessor' },
    { from: 'RISK_CHECKED', to: 'COMPLETE', type: 'branch', label: 'complete' },
    { from: 'RISK_CHECKED', to: 'COMPLETE_MFA', type: 'branch', label: 'mfa' },
    { from: 'RISK_CHECKED', to: 'BLOCKED', type: 'branch', label: 'blocked' },
    { from: 'CALLBACK_RECEIVED', to: 'RETRIABLE_ERROR', type: 'error', label: 'error' },
    { from: 'TOKEN_EXCHANGED', to: 'RETRIABLE_ERROR', type: 'error', label: 'error' },
    { from: 'RETRIABLE_ERROR', to: 'INIT', type: 'auto', label: 'RetryProcessor' },
    // onAnyError → TERMINAL_ERROR (catch-all for unhandled errors)
    { from: 'INIT', to: 'TERMINAL_ERROR', type: 'error', label: 'error' },
    { from: 'REDIRECTED', to: 'TERMINAL_ERROR', type: 'error', label: 'error' },
    { from: 'USER_RESOLVED', to: 'TERMINAL_ERROR', type: 'error', label: 'error' },
    { from: 'RISK_CHECKED', to: 'TERMINAL_ERROR', type: 'error', label: 'error' },
    { from: 'RETRIABLE_ERROR', to: 'TERMINAL_ERROR', type: 'error', label: 'error' },
  ];
}

// ── Simulator ──

class OidcSimulator {
  private readonly store = new InMemoryFlowStore();
  private readonly engine: FlowEngine;
  private readonly sink: VizSink;
  private interval: ReturnType<typeof setInterval> | null = null;
  /** Flows waiting at REDIRECTED for a simulated callback. */
  private readonly pendingResumes = new Map<string, ReturnType<typeof setTimeout>>();

  constructor() {
    this.sink = new VizSink();
    this.engine = Tramli.engine(this.store);
    const plugin = new ObservabilityEnginePlugin(this.sink);
    plugin.install(this.engine);
  }

  start() {
    const states = buildStateInfos();
    const edges = buildEdgeInfos();

    startVizServer(this.sink, {
      engine: this.engine,
      definition: oidcFlowDefinition,
      states,
      edges,
      onTrigger: (action, flowId) => {
        if (action === 'start') this.spawnFlow();
        if (action === 'resume' && flowId) this.resumeFlow(flowId);
      },
    });

    // Auto-spawn flows every 2-4 seconds
    this.scheduleNext();
    console.log('[simulator] OIDC simulator started — spawning flows');
  }

  private scheduleNext() {
    const delayMs = 2000 + Math.random() * 2000;
    this.interval = setTimeout(() => {
      this.spawnFlow();
      this.scheduleNext();
    }, delayMs);
  }

  private async spawnFlow() {
    try {
      const flow = await this.engine.startFlow(
        oidcFlowDefinition,
        `session-${Math.random().toString(36).slice(2, 8)}`,
        Tramli.data([OidcRequest, { provider: 'GOOGLE', returnTo: '/dashboard' }]),
      );

      // If flow stopped at REDIRECTED, schedule a resume after delay
      if (!flow.isCompleted && flow.currentState === 'REDIRECTED') {
        const resumeDelay = 1500 + Math.random() * 3000;
        const timer = setTimeout(() => {
          this.resumeFlow(flow.id);
          this.pendingResumes.delete(flow.id);
        }, resumeDelay);
        this.pendingResumes.set(flow.id, timer);
      }
    } catch (e) {
      console.error('[simulator] Error spawning flow:', e);
    }
  }

  private async resumeFlow(flowId: string) {
    try {
      const flow = await this.engine.resumeAndExecute(flowId, oidcFlowDefinition);
      // If guard rejected and still at REDIRECTED, try again after delay
      if (!flow.isCompleted && flow.currentState === 'REDIRECTED') {
        const retryDelay = 1000 + Math.random() * 2000;
        const timer = setTimeout(() => {
          this.resumeFlow(flowId);
          this.pendingResumes.delete(flowId);
        }, retryDelay);
        this.pendingResumes.set(flowId, timer);
      }
    } catch (e) {
      // Flow may have been completed or expired
    }
  }

  stop() {
    if (this.interval) clearTimeout(this.interval);
    for (const timer of this.pendingResumes.values()) clearTimeout(timer);
    this.pendingResumes.clear();
  }
}

// ── Main ──

const sim = new OidcSimulator();
sim.start();
