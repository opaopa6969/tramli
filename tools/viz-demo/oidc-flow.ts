import { Tramli, flowKey } from '../../lang/ts/src/index.js';
import type { StateProcessor, TransitionGuard, BranchProcessor, GuardOutput, FlowContext, StateConfig } from '../../lang/ts/src/index.js';

// ── States ──

export type OidcState =
  | 'INIT' | 'REDIRECTED' | 'CALLBACK_RECEIVED' | 'TOKEN_EXCHANGED'
  | 'USER_RESOLVED' | 'RISK_CHECKED'
  | 'COMPLETE' | 'COMPLETE_MFA' | 'BLOCKED'
  | 'RETRIABLE_ERROR' | 'TERMINAL_ERROR';

export const OIDC_STATES: Record<OidcState, StateConfig> = {
  INIT:               { initial: true,  terminal: false },
  REDIRECTED:         { terminal: false },
  CALLBACK_RECEIVED:  { terminal: false },
  TOKEN_EXCHANGED:    { terminal: false },
  USER_RESOLVED:      { terminal: false },
  RISK_CHECKED:       { terminal: false },
  COMPLETE:           { terminal: true },
  COMPLETE_MFA:       { terminal: true },
  BLOCKED:            { terminal: true },
  RETRIABLE_ERROR:    { terminal: false },
  TERMINAL_ERROR:     { terminal: true },
};

// ── Flow Keys (context data types) ──

export const OidcRequest   = flowKey<{ provider: string; returnTo: string }>('OidcRequest');
export const OidcRedirect  = flowKey<{ authUrl: string; state: string; nonce: string }>('OidcRedirect');
export const OidcCallback  = flowKey<{ code: string; state: string }>('OidcCallback');
export const OidcTokens    = flowKey<{ idToken: string; accessToken: string }>('OidcTokens');
export const ResolvedUser  = flowKey<{ userId: string; email: string; mfaRequired: boolean }>('ResolvedUser');
export const RiskResult    = flowKey<{ level: string; blocked: boolean }>('RiskResult');
export const IssuedSession = flowKey<{ sessionId: string; redirectTo: string }>('IssuedSession');

// ── Helper: simulated delay ──

function delay(min: number, max: number): Promise<void> {
  return new Promise(r => setTimeout(r, min + Math.random() * (max - min)));
}

function randomId(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 8)}`;
}

// ── Processors ──

const oidcInitProcessor: StateProcessor<OidcState> = {
  name: 'OidcInitProcessor',
  requires: [OidcRequest],
  produces: [OidcRedirect],
  async process(ctx: FlowContext) {
    await delay(5, 20);
    const req = ctx.get(OidcRequest);
    ctx.put(OidcRedirect, {
      authUrl: `https://accounts.google.com/o/oauth2/auth?client_id=demo&redirect_uri=...&state=${randomId('st')}`,
      state: randomId('st'),
      nonce: randomId('n'),
    });
  },
};

const tokenExchangeProcessor: StateProcessor<OidcState> = {
  name: 'OidcTokenExchangeProcessor',
  requires: [OidcCallback, OidcRedirect],
  produces: [OidcTokens],
  async process(ctx: FlowContext) {
    await delay(10, 40);
    // Randomly fail ~5% of the time
    if (Math.random() < 0.05) throw new Error('TOKEN_EXCHANGE_TIMEOUT');
    ctx.put(OidcTokens, {
      idToken: `eyJ.${randomId('id')}`,
      accessToken: `at-${randomId('at')}`,
    });
  },
};

const userResolveProcessor: StateProcessor<OidcState> = {
  name: 'UserResolveProcessor',
  requires: [OidcTokens],
  produces: [ResolvedUser],
  async process(ctx: FlowContext) {
    await delay(5, 25);
    ctx.put(ResolvedUser, {
      userId: randomId('u'),
      email: `user-${randomId('e')}@example.com`,
      mfaRequired: Math.random() < 0.2,
    });
  },
};

const riskCheckProcessor: StateProcessor<OidcState> = {
  name: 'RiskCheckProcessor',
  requires: [ResolvedUser, OidcRequest],
  produces: [RiskResult],
  async process(ctx: FlowContext) {
    await delay(10, 30);
    const blocked = Math.random() < 0.08;
    ctx.put(RiskResult, {
      level: blocked ? 'HIGH' : Math.random() < 0.3 ? 'MEDIUM' : 'LOW',
      blocked,
    });
  },
};

const sessionIssueProcessor: StateProcessor<OidcState> = {
  name: 'SessionIssueProcessor',
  requires: [ResolvedUser, OidcRequest],
  produces: [IssuedSession],
  async process(ctx: FlowContext) {
    await delay(3, 10);
    const req = ctx.get(OidcRequest);
    ctx.put(IssuedSession, {
      sessionId: randomId('sess'),
      redirectTo: req.returnTo,
    });
  },
};

const retryProcessor: StateProcessor<OidcState> = {
  name: 'RetryProcessor',
  requires: [],
  produces: [],
  async process() {
    await delay(50, 200);
  },
};

// ── Guard ──

const callbackGuard: TransitionGuard<OidcState> = {
  name: 'OidcCallbackGuard',
  requires: [OidcRedirect],
  produces: [OidcCallback],
  maxRetries: 1,
  validate(ctx: FlowContext): GuardOutput {
    // ~10% rejection rate for demo purposes
    if (Math.random() < 0.10) {
      return { type: 'rejected', reason: 'state_mismatch' };
    }
    return {
      type: 'accepted',
      data: new Map<string, unknown>([
        [OidcCallback as string, { code: randomId('code'), state: randomId('st') }],
      ]),
    };
  },
};

// ── Branch ──

const riskBranch: BranchProcessor<OidcState> = {
  name: 'RiskAndMfaBranch',
  requires: [ResolvedUser, RiskResult],
  decide(ctx: FlowContext): string {
    const risk = ctx.get(RiskResult);
    if (risk.blocked) return 'blocked';
    const user = ctx.get(ResolvedUser);
    return user.mfaRequired ? 'mfa' : 'complete';
  },
};

// ── Flow Definition ──

export const oidcFlowDefinition = Tramli.define<OidcState>('oidc-auth', OIDC_STATES)
  .setTtl(10 * 60 * 1000) // 10 minutes
  .setMaxGuardRetries(1)
  .initiallyAvailable(OidcRequest)
  .externallyProvided(OidcCallback)
  // Happy path
  .from('INIT').auto('REDIRECTED', oidcInitProcessor)
  .from('REDIRECTED').external('CALLBACK_RECEIVED', callbackGuard)
  .from('CALLBACK_RECEIVED').auto('TOKEN_EXCHANGED', tokenExchangeProcessor)
  .from('TOKEN_EXCHANGED').auto('USER_RESOLVED', userResolveProcessor)
  .from('USER_RESOLVED').auto('RISK_CHECKED', riskCheckProcessor)
  // Branch: risk assessment
  .from('RISK_CHECKED').branch(riskBranch)
    .to('COMPLETE', 'complete', sessionIssueProcessor)
    .to('COMPLETE_MFA', 'mfa', sessionIssueProcessor)
    .to('BLOCKED', 'blocked')
    .endBranch()
  // Error handling (onAnyError first, then specific overrides)
  .onAnyError('TERMINAL_ERROR')
  .onError('CALLBACK_RECEIVED', 'RETRIABLE_ERROR')
  .onError('TOKEN_EXCHANGED', 'RETRIABLE_ERROR')
  // Retry
  .from('RETRIABLE_ERROR').auto('INIT', retryProcessor)
  .build();
