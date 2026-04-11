import { Tramli, FlowEngine, InMemoryFlowStore } from '@unlaxer/tramli';
import { ObservabilityEnginePlugin } from '@unlaxer/tramli-plugins';
import { VizSink } from '../server/viz-sink.js';
import { startVizServer } from '../server/index.js';
import { oidcFlowDefinition, OidcRequest, OIDC_STATES } from './oidc-flow.js';
import { sessionFlowDefinition, AuthResult, SESSION_STATES, SESSION_LAYOUT, SESSION_EDGES } from './session-flow.js';
import type { StateInfo, EdgeInfo } from '../shared/protocol.js';
import type { VizFlowDef } from '../server/index.js';

// ── OIDC Layout ──

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

function buildOidcFlow(): VizFlowDef {
  const states: StateInfo[] = Object.entries(OIDC_STATES).map(([name, cfg]) => ({
    name,
    initial: cfg.initial ?? false,
    terminal: cfg.terminal,
    ...OIDC_LAYOUT[name],
  }));
  const edges: EdgeInfo[] = [
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
    { from: 'INIT', to: 'TERMINAL_ERROR', type: 'error', label: 'error' },
    { from: 'REDIRECTED', to: 'TERMINAL_ERROR', type: 'error', label: 'error' },
    { from: 'USER_RESOLVED', to: 'TERMINAL_ERROR', type: 'error', label: 'error' },
    { from: 'RISK_CHECKED', to: 'TERMINAL_ERROR', type: 'error', label: 'error' },
    { from: 'RETRIABLE_ERROR', to: 'TERMINAL_ERROR', type: 'error', label: 'error' },
  ];
  return { flowName: 'oidc-auth', layer: 2, states, edges };
}

function buildSessionFlow(): VizFlowDef {
  const states: StateInfo[] = Object.entries(SESSION_STATES).map(([name, cfg]) => ({
    name,
    initial: cfg.initial ?? false,
    terminal: cfg.terminal,
    ...SESSION_LAYOUT[name],
  }));
  return { flowName: 'session', layer: 1, states, edges: SESSION_EDGES };
}

// ── Simulator ──

class MultiSmSimulator {
  private readonly store = new InMemoryFlowStore();
  private readonly engine: FlowEngine;
  private readonly sink: VizSink;
  private readonly pendingResumes = new Map<string, ReturnType<typeof setTimeout>>();

  constructor() {
    this.sink = new VizSink();
    this.engine = Tramli.engine(this.store);
    const plugin = new ObservabilityEnginePlugin(this.sink);
    plugin.install(this.engine);
  }

  start() {
    const definitions: VizFlowDef[] = [buildSessionFlow(), buildOidcFlow()];

    startVizServer(this.sink, {
      engine: this.engine,
      definitions,
      onTrigger: (action) => {
        if (action === 'start') this.spawnOidcFlow();
      },
    });

    // Auto-spawn OIDC flows
    this.scheduleNext();
    console.log('[simulator] Multi-SM simulator started (Session + OIDC)');
  }

  private scheduleNext() {
    const delayMs = 2000 + Math.random() * 2000;
    setTimeout(() => {
      this.spawnOidcFlow();
      this.scheduleNext();
    }, delayMs);
  }

  private async spawnOidcFlow() {
    try {
      const flow = await this.engine.startFlow(
        oidcFlowDefinition,
        `session-${Math.random().toString(36).slice(2, 8)}`,
        Tramli.data([OidcRequest, { provider: 'GOOGLE', returnTo: '/dashboard' }]),
      );

      if (!flow.isCompleted && flow.currentState === 'REDIRECTED') {
        const resumeDelay = 1500 + Math.random() * 3000;
        const timer = setTimeout(() => {
          this.resumeOidcFlow(flow.id);
          this.pendingResumes.delete(flow.id);
        }, resumeDelay);
        this.pendingResumes.set(flow.id, timer);
      }

      // When OIDC completes → start a Session flow
      if (flow.isCompleted && (flow.currentState === 'COMPLETE' || flow.currentState === 'COMPLETE_MFA')) {
        this.spawnSessionFlow(flow.currentState === 'COMPLETE_MFA');
      }
    } catch (e) {
      console.error('[simulator] Error spawning OIDC flow:', e);
    }
  }

  private async resumeOidcFlow(flowId: string) {
    try {
      const flow = await this.engine.resumeAndExecute(flowId, oidcFlowDefinition);
      if (!flow.isCompleted && flow.currentState === 'REDIRECTED') {
        const retryDelay = 1000 + Math.random() * 2000;
        const timer = setTimeout(() => {
          this.resumeOidcFlow(flowId);
          this.pendingResumes.delete(flowId);
        }, retryDelay);
        this.pendingResumes.set(flowId, timer);
      }
      // OIDC complete → Session
      if (flow.isCompleted && (flow.currentState === 'COMPLETE' || flow.currentState === 'COMPLETE_MFA')) {
        this.spawnSessionFlow(flow.currentState === 'COMPLETE_MFA');
      }
    } catch { /* flow may have expired */ }
  }

  private async spawnSessionFlow(mfaRequired: boolean) {
    try {
      const flow = await this.engine.startFlow(
        sessionFlowDefinition,
        `sess-${Math.random().toString(36).slice(2, 8)}`,
        Tramli.data([AuthResult, { method: 'oidc', userId: `u-${Math.random().toString(36).slice(2, 6)}` }]),
      );

      // If MFA required, the session should go to MFA_PENDING
      // (Currently AUTHENTICATING auto-chains to FULLY_AUTHENTICATED)
      // For demo purposes, session auto-completes immediately
    } catch (e) {
      console.error('[simulator] Error spawning Session flow:', e);
    }
  }
}

// ── Main ──

const sim = new MultiSmSimulator();
sim.start();
