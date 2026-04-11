// volta-auth-proxy state machine definitions for tramli-viz
// Layout coordinates for the layered 2-tier visualization

import { StateInfo, EdgeInfo } from '../shared/protocol.js';

// ── Layer 1: Session SM ──

export const sessionStates: StateInfo[] = [
  { name: 'AUTHENTICATING',             initial: true,  terminal: false, x: 200, y: 80 },
  { name: 'AUTHENTICATED_MFA_PENDING',  initial: false, terminal: false, x: 500, y: 80 },
  { name: 'FULLY_AUTHENTICATED',        initial: false, terminal: false, x: 800, y: 80 },
  { name: 'EXPIRED',                    initial: false, terminal: true,  x: 650, y: 200 },
  { name: 'REVOKED',                    initial: false, terminal: true,  x: 950, y: 200 },
];

export const sessionEdges: EdgeInfo[] = [
  { from: 'AUTHENTICATING',            to: 'FULLY_AUTHENTICATED',        type: 'auto',     label: 'flow SUCCESS (no MFA)' },
  { from: 'AUTHENTICATING',            to: 'AUTHENTICATED_MFA_PENDING',  type: 'auto',     label: 'flow SUCCESS_MFA' },
  { from: 'AUTHENTICATED_MFA_PENDING', to: 'FULLY_AUTHENTICATED',        type: 'external', label: 'MFA verified' },
  { from: 'AUTHENTICATED_MFA_PENDING', to: 'EXPIRED',                    type: 'error',    label: 'MFA timeout' },
  { from: 'FULLY_AUTHENTICATED',       to: 'EXPIRED',                    type: 'auto',     label: 'TTL' },
  { from: 'FULLY_AUTHENTICATED',       to: 'REVOKED',                    type: 'external', label: 'logout / admin' },
];

// ── Layer 2: OIDC Flow SM ──

export const oidcStates: StateInfo[] = [
  { name: 'INIT',              initial: true,  terminal: false, x: 80,  y: 350 },
  { name: 'REDIRECTED',        initial: false, terminal: false, x: 200, y: 350 },
  { name: 'CALLBACK_RECEIVED', initial: false, terminal: false, x: 320, y: 350 },
  { name: 'TOKEN_EXCHANGED',   initial: false, terminal: false, x: 440, y: 350 },
  { name: 'USER_RESOLVED',     initial: false, terminal: false, x: 560, y: 350 },
  { name: 'RISK_CHECKED',      initial: false, terminal: false, x: 680, y: 350 },
  { name: 'COMPLETE',          initial: false, terminal: true,  x: 680, y: 280 },
  { name: 'COMPLETE_MFA',      initial: false, terminal: true,  x: 560, y: 280 },
  { name: 'BLOCKED',           initial: false, terminal: true,  x: 440, y: 450 },
  { name: 'TERMINAL_ERROR',    initial: false, terminal: true,  x: 200, y: 450 },
];

export const oidcEdges: EdgeInfo[] = [
  { from: 'INIT',              to: 'REDIRECTED',        type: 'auto',     label: 'redirect to IdP' },
  { from: 'REDIRECTED',        to: 'CALLBACK_RECEIVED', type: 'external', label: 'IdP callback' },
  { from: 'CALLBACK_RECEIVED', to: 'TOKEN_EXCHANGED',   type: 'auto',     label: 'exchange code' },
  { from: 'TOKEN_EXCHANGED',   to: 'USER_RESOLVED',     type: 'auto',     label: 'resolve user' },
  { from: 'USER_RESOLVED',     to: 'RISK_CHECKED',      type: 'auto',     label: 'risk check' },
  { from: 'RISK_CHECKED',      to: 'COMPLETE',          type: 'branch',   label: 'no MFA required' },
  { from: 'RISK_CHECKED',      to: 'COMPLETE_MFA',      type: 'branch',   label: 'MFA required' },
  { from: 'RISK_CHECKED',      to: 'BLOCKED',           type: 'error',    label: 'high risk' },
  { from: 'REDIRECTED',        to: 'TERMINAL_ERROR',    type: 'error',    label: 'timeout / error' },
  { from: 'CALLBACK_RECEIVED', to: 'TERMINAL_ERROR',    type: 'error',    label: 'invalid callback' },
  { from: 'TOKEN_EXCHANGED',   to: 'TERMINAL_ERROR',    type: 'error',    label: 'invalid token' },
];

// ── Layer 2: Passkey Flow SM ──

export const passkeyStates: StateInfo[] = [
  { name: 'INIT',                initial: true,  terminal: false, x: 780, y: 350 },
  { name: 'CHALLENGE_ISSUED',    initial: false, terminal: false, x: 900, y: 350 },
  { name: 'ASSERTION_RECEIVED',  initial: false, terminal: false, x: 1020, y: 350 },
  { name: 'USER_RESOLVED',       initial: false, terminal: false, x: 1020, y: 280 },
  { name: 'COMPLETE',            initial: false, terminal: true,  x: 900, y: 280 },
  { name: 'FAILED',              initial: false, terminal: true,  x: 1020, y: 450 },
];

export const passkeyEdges: EdgeInfo[] = [
  { from: 'INIT',               to: 'CHALLENGE_ISSUED',   type: 'auto',     label: 'generate challenge' },
  { from: 'CHALLENGE_ISSUED',   to: 'ASSERTION_RECEIVED', type: 'external', label: 'user authenticates' },
  { from: 'ASSERTION_RECEIVED', to: 'USER_RESOLVED',      type: 'auto',     label: 'verify + resolve' },
  { from: 'USER_RESOLVED',      to: 'COMPLETE',           type: 'auto',     label: 'success' },
  { from: 'CHALLENGE_ISSUED',   to: 'FAILED',             type: 'error',    label: 'timeout' },
  { from: 'ASSERTION_RECEIVED', to: 'FAILED',             type: 'error',    label: 'invalid assertion' },
];

// ── Layer 2: MFA Flow SM ──

export const mfaStates: StateInfo[] = [
  { name: 'CHALLENGE_SHOWN', initial: true,  terminal: false, x: 80,  y: 530 },
  { name: 'VERIFIED',        initial: false, terminal: true,  x: 250, y: 530 },
  { name: 'FAILED',          initial: false, terminal: true,  x: 250, y: 610 },
  { name: 'EXPIRED',         initial: false, terminal: true,  x: 80,  y: 610 },
];

export const mfaEdges: EdgeInfo[] = [
  { from: 'CHALLENGE_SHOWN', to: 'VERIFIED', type: 'external', label: 'correct code' },
  { from: 'CHALLENGE_SHOWN', to: 'FAILED',   type: 'error',    label: 'wrong code (max retries)' },
  { from: 'CHALLENGE_SHOWN', to: 'EXPIRED',  type: 'error',    label: 'timeout' },
];

// ── Layer 2: Invite Flow SM ──

export const inviteStates: StateInfo[] = [
  { name: 'CONSENT_SHOWN',      initial: true,  terminal: false, x: 480, y: 530 },
  { name: 'ACCOUNT_SWITCHING',   initial: false, terminal: false, x: 640, y: 530 },
  { name: 'ACCEPTED',            initial: false, terminal: false, x: 800, y: 530 },
  { name: 'COMPLETE',            initial: false, terminal: true,  x: 800, y: 460 },
  { name: 'DECLINED',            initial: false, terminal: true,  x: 480, y: 610 },
  { name: 'EXPIRED',             initial: false, terminal: true,  x: 640, y: 610 },
];

export const inviteEdges: EdgeInfo[] = [
  { from: 'CONSENT_SHOWN',    to: 'ACCEPTED',          type: 'external', label: 'accept (same account)' },
  { from: 'CONSENT_SHOWN',    to: 'ACCOUNT_SWITCHING', type: 'external', label: 'switch account' },
  { from: 'ACCOUNT_SWITCHING', to: 'ACCEPTED',          type: 'auto',     label: 'account confirmed' },
  { from: 'ACCEPTED',          to: 'COMPLETE',           type: 'auto',     label: 'membership created' },
  { from: 'CONSENT_SHOWN',    to: 'DECLINED',           type: 'external', label: 'user declines' },
  { from: 'CONSENT_SHOWN',    to: 'EXPIRED',            type: 'error',    label: 'invitation expired' },
];

// ── All flows combined ──

export interface FlowDefinition {
  flowName: string;
  layer: 1 | 2;
  states: StateInfo[];
  edges: EdgeInfo[];
}

export const voltaAuthFlows: FlowDefinition[] = [
  { flowName: 'session', layer: 1, states: sessionStates, edges: sessionEdges },
  { flowName: 'oidc',    layer: 2, states: oidcStates,    edges: oidcEdges },
  { flowName: 'passkey', layer: 2, states: passkeyStates, edges: passkeyEdges },
  { flowName: 'mfa',     layer: 2, states: mfaStates,     edges: mfaEdges },
  { flowName: 'invite',  layer: 2, states: inviteStates,  edges: inviteEdges },
];
