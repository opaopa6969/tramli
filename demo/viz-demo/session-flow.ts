import { Tramli, flowKey } from '../../ts/src/index.js';
import type { StateProcessor, TransitionGuard, GuardOutput, FlowContext, StateConfig } from '../../ts/src/index.js';

// ── States ──

export type SessionState =
  | 'AUTHENTICATING' | 'MFA_PENDING' | 'FULLY_AUTHENTICATED' | 'EXPIRED' | 'REVOKED';

export const SESSION_STATES: Record<SessionState, StateConfig> = {
  AUTHENTICATING:      { initial: true,  terminal: false },
  MFA_PENDING:         { terminal: false },
  FULLY_AUTHENTICATED: { terminal: false },
  EXPIRED:             { terminal: true },
  REVOKED:             { terminal: true },
};

// ── Flow Keys ──

export const AuthResult = flowKey<{ method: string; userId: string }>('AuthResult');
export const MfaResult  = flowKey<{ verified: boolean }>('MfaResult');
export const SessionToken = flowKey<{ token: string; expiresIn: number }>('SessionToken');

// ── Processors ──

const issueSessionProcessor: StateProcessor<SessionState> = {
  name: 'IssueSessionProcessor',
  requires: [AuthResult],
  produces: [SessionToken],
  async process(ctx: FlowContext) {
    await new Promise(r => setTimeout(r, 5 + Math.random() * 15));
    ctx.put(SessionToken, { token: `sess-${Math.random().toString(36).slice(2, 8)}`, expiresIn: 3600 });
  },
};

const verifyMfaProcessor: StateProcessor<SessionState> = {
  name: 'VerifyMfaProcessor',
  requires: [MfaResult],
  produces: [],
  async process() {
    await new Promise(r => setTimeout(r, 10 + Math.random() * 20));
  },
};

// ── Guard ──

const mfaGuard: TransitionGuard<SessionState> = {
  name: 'MfaVerificationGuard',
  requires: [],
  produces: [MfaResult],
  maxRetries: 3,
  validate(): GuardOutput {
    if (Math.random() < 0.15) return { type: 'rejected', reason: 'invalid_code' };
    return {
      type: 'accepted',
      data: new Map<string, unknown>([[MfaResult as string, { verified: true }]]),
    };
  },
};

// ── Flow Definition ──

export const sessionFlowDefinition = Tramli.define<SessionState>('session', SESSION_STATES)
  .setTtl(60 * 60 * 1000)
  .setMaxGuardRetries(3)
  .allowUnreachable() // MFA_PENDING is entered via external cross-flow trigger
  .initiallyAvailable(AuthResult)
  .externallyProvided(MfaResult)
  // AUTHENTICATING: auth complete → either fully authenticated or MFA pending
  .from('AUTHENTICATING').auto('FULLY_AUTHENTICATED', issueSessionProcessor)
  // MFA flow
  .from('MFA_PENDING').external('FULLY_AUTHENTICATED', mfaGuard, verifyMfaProcessor)
  // Expiry/revocation
  .onAnyError('REVOKED')
  .build();

// ── Layout ──

export const SESSION_LAYOUT: Record<string, { x: number; y: number }> = {
  AUTHENTICATING:      { x: 50,  y: 30 },
  MFA_PENDING:         { x: 250, y: 30 },
  FULLY_AUTHENTICATED: { x: 450, y: 30 },
  EXPIRED:             { x: 650, y: 30 },
  REVOKED:             { x: 650, y: 120 },
};

export const SESSION_EDGES = [
  { from: 'AUTHENTICATING', to: 'FULLY_AUTHENTICATED', type: 'auto' as const, label: 'IssueSessionProcessor' },
  { from: 'MFA_PENDING', to: 'FULLY_AUTHENTICATED', type: 'external' as const, label: 'MfaVerificationGuard' },
  { from: 'MFA_PENDING', to: 'REVOKED', type: 'error' as const, label: 'error' },
  { from: 'AUTHENTICATING', to: 'REVOKED', type: 'error' as const, label: 'error' },
];
