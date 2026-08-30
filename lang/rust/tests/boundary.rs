//! Boundary / regression-prone behavior tests for public API.
//! Tests only — no implementation changes. If any test fails, that's a bug (file an issue).

#![allow(dead_code)]

use std::any::TypeId;
use std::sync::Arc;
use std::time::Duration;
use tramli::*;

struct Noop;
impl<S: FlowState> StateProcessor<S> for Noop {
    fn name(&self) -> &str {
        "Noop"
    }
    fn requires(&self) -> Vec<TypeId> {
        vec![]
    }
    fn produces(&self) -> Vec<TypeId> {
        vec![]
    }
    fn process(&self, _ctx: &mut FlowContext) -> Result<(), FlowError> {
        Ok(())
    }
}

#[derive(Clone)]
struct Input(String);
#[derive(Clone)]
struct Mid(String);

// ═══════════════════════════════════════════════════════════════
// 1. FlowContext snapshot/restoreFrom boundary
// ═══════════════════════════════════════════════════════════════

#[test]
fn restore_from_empty_snapshot_clears_all_entries() {
    let mut ctx = FlowContext::new("f1".into());
    ctx.put(Input("v1".into()));
    ctx.put(Mid("v2".into()));
    assert!(ctx.find::<Input>().is_some());
    assert!(ctx.find::<Mid>().is_some());

    let empty = FlowContext::new("f2".into()).snapshot();
    ctx.restore_from(empty);
    assert!(ctx.find::<Input>().is_none(), "Input should be cleared");
    assert!(ctx.find::<Mid>().is_none(), "Mid should be cleared");
}

// ═══════════════════════════════════════════════════════════════
// 2. maxChainDepth boundary (9 ok, 11 throws)
// ═══════════════════════════════════════════════════════════════

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
enum Chain9 {
    S0,
    S1,
    S2,
    S3,
    S4,
    S5,
    S6,
    S7,
    S8,
    S9,
}
impl FlowState for Chain9 {
    fn is_terminal(&self) -> bool {
        matches!(self, Self::S9)
    }
    fn is_initial(&self) -> bool {
        matches!(self, Self::S0)
    }
    fn all_states() -> &'static [Self] {
        &[
            Self::S0,
            Self::S1,
            Self::S2,
            Self::S3,
            Self::S4,
            Self::S5,
            Self::S6,
            Self::S7,
            Self::S8,
            Self::S9,
        ]
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
enum Chain11 {
    S0,
    S1,
    S2,
    S3,
    S4,
    S5,
    S6,
    S7,
    S8,
    S9,
    S10,
    S11,
}
impl FlowState for Chain11 {
    fn is_terminal(&self) -> bool {
        matches!(self, Self::S11)
    }
    fn is_initial(&self) -> bool {
        matches!(self, Self::S0)
    }
    fn all_states() -> &'static [Self] {
        &[
            Self::S0,
            Self::S1,
            Self::S2,
            Self::S3,
            Self::S4,
            Self::S5,
            Self::S6,
            Self::S7,
            Self::S8,
            Self::S9,
            Self::S10,
            Self::S11,
        ]
    }
}

#[test]
fn nine_auto_transitions_complete_within_default_max_chain_depth() {
    let def = Arc::new(
        Builder::<Chain9>::new("chain9")
            .initially_available(requires![Input])
            .from(Chain9::S0)
            .auto(Chain9::S1, Noop)
            .from(Chain9::S1)
            .auto(Chain9::S2, Noop)
            .from(Chain9::S2)
            .auto(Chain9::S3, Noop)
            .from(Chain9::S3)
            .auto(Chain9::S4, Noop)
            .from(Chain9::S4)
            .auto(Chain9::S5, Noop)
            .from(Chain9::S5)
            .auto(Chain9::S6, Noop)
            .from(Chain9::S6)
            .auto(Chain9::S7, Noop)
            .from(Chain9::S7)
            .auto(Chain9::S8, Noop)
            .from(Chain9::S8)
            .auto(Chain9::S9, Noop)
            .build()
            .unwrap(),
    );
    let mut engine = FlowEngine::new(InMemoryFlowStore::new());
    let fid = engine
        .start_flow(
            def,
            "s1",
            vec![(
                TypeId::of::<Input>(),
                Box::new(Input("x".into())) as Box<dyn CloneAny>,
            )],
        )
        .unwrap();
    let f = engine.store.get(&fid).unwrap();
    assert_eq!(f.current_state(), Chain9::S9);
    assert!(f.is_completed());
}

#[test]
fn eleven_auto_transitions_throw_max_chain_depth() {
    let def = Arc::new(
        Builder::<Chain11>::new("chain11")
            .initially_available(requires![Input])
            .from(Chain11::S0)
            .auto(Chain11::S1, Noop)
            .from(Chain11::S1)
            .auto(Chain11::S2, Noop)
            .from(Chain11::S2)
            .auto(Chain11::S3, Noop)
            .from(Chain11::S3)
            .auto(Chain11::S4, Noop)
            .from(Chain11::S4)
            .auto(Chain11::S5, Noop)
            .from(Chain11::S5)
            .auto(Chain11::S6, Noop)
            .from(Chain11::S6)
            .auto(Chain11::S7, Noop)
            .from(Chain11::S7)
            .auto(Chain11::S8, Noop)
            .from(Chain11::S8)
            .auto(Chain11::S9, Noop)
            .from(Chain11::S9)
            .auto(Chain11::S10, Noop)
            .from(Chain11::S10)
            .auto(Chain11::S11, Noop)
            .build()
            .unwrap(),
    );
    let mut engine = FlowEngine::new(InMemoryFlowStore::new());
    let result = engine.start_flow(
        def,
        "s1",
        vec![(
            TypeId::of::<Input>(),
            Box::new(Input("x".into())) as Box<dyn CloneAny>,
        )],
    );
    assert!(
        result.is_err(),
        "11 transitions should exceed maxChainDepth=10"
    );
    let err = result.err().unwrap();
    assert_eq!(err.code, "MAX_CHAIN_DEPTH");
}

// ═══════════════════════════════════════════════════════════════
// 3. GuardOutput.Expired completes flow with EXPIRED
// ═══════════════════════════════════════════════════════════════

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
enum ExpState {
    Init,
    Wait,
    Done,
    Err,
}
impl FlowState for ExpState {
    fn is_terminal(&self) -> bool {
        matches!(self, Self::Done | Self::Err)
    }
    fn is_initial(&self) -> bool {
        matches!(self, Self::Init)
    }
    fn all_states() -> &'static [Self] {
        &[Self::Init, Self::Wait, Self::Done, Self::Err]
    }
}

struct ExpireGuard;
impl TransitionGuard<ExpState> for ExpireGuard {
    fn name(&self) -> &str {
        "ExpireGuard"
    }
    fn requires(&self) -> Vec<TypeId> {
        requires![Mid]
    }
    fn produces(&self) -> Vec<TypeId> {
        vec![]
    }
    fn validate(&self, _ctx: &FlowContext) -> GuardOutput {
        GuardOutput::Expired
    }
}

struct ProduceMid;
impl StateProcessor<ExpState> for ProduceMid {
    fn name(&self) -> &str {
        "ProduceMid"
    }
    fn requires(&self) -> Vec<TypeId> {
        requires![Input]
    }
    fn produces(&self) -> Vec<TypeId> {
        requires![Mid]
    }
    fn process(&self, ctx: &mut FlowContext) -> Result<(), FlowError> {
        ctx.put(Mid("m".into()));
        Ok(())
    }
}

#[test]
fn guard_returning_expired_completes_flow_as_expired() {
    let def = Arc::new(
        Builder::<ExpState>::new("expire")
            .ttl(Duration::from_secs(3600))
            .initially_available(requires![Input])
            .from(ExpState::Init)
            .auto(ExpState::Wait, ProduceMid)
            .from(ExpState::Wait)
            .external(ExpState::Done, ExpireGuard)
            .on_any_error(ExpState::Err)
            .build()
            .unwrap(),
    );
    let mut engine = FlowEngine::new(InMemoryFlowStore::new());
    let fid = engine
        .start_flow(
            def.clone(),
            "s1",
            vec![(
                TypeId::of::<Input>(),
                Box::new(Input("x".into())) as Box<dyn CloneAny>,
            )],
        )
        .unwrap();
    assert_eq!(
        engine.store.get(&fid).unwrap().current_state(),
        ExpState::Wait
    );

    engine.resume_and_execute(&fid, vec![]).unwrap();
    let f = engine.store.get(&fid).unwrap();
    assert!(f.is_completed());
    assert_eq!(f.exit_state(), Some("EXPIRED"));
}

// ═══════════════════════════════════════════════════════════════
// 4. resumeAndExecute on completed flow -> FLOW_NOT_FOUND
// ═══════════════════════════════════════════════════════════════

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
enum CompleteAll {
    Init,
    Done,
}
impl FlowState for CompleteAll {
    fn is_terminal(&self) -> bool {
        matches!(self, Self::Done)
    }
    fn is_initial(&self) -> bool {
        matches!(self, Self::Init)
    }
    fn all_states() -> &'static [Self] {
        &[Self::Init, Self::Done]
    }
}

#[test]
fn resume_on_completed_flow_throws_flow_not_found() {
    let def = Arc::new(
        Builder::<CompleteAll>::new("complete-all")
            .initially_available(requires![Input])
            .from(CompleteAll::Init)
            .auto(CompleteAll::Done, Noop)
            .build()
            .unwrap(),
    );
    let mut engine = FlowEngine::new(InMemoryFlowStore::new());
    let fid = engine
        .start_flow(
            def.clone(),
            "s1",
            vec![(
                TypeId::of::<Input>(),
                Box::new(Input("x".into())) as Box<dyn CloneAny>,
            )],
        )
        .unwrap();
    let f = engine.store.get(&fid).unwrap();
    assert_eq!(f.current_state(), CompleteAll::Done);
    assert!(f.is_completed());

    let result = engine.resume_and_execute(&fid, vec![]);
    assert!(result.is_err());
    let err = result.err().unwrap();
    assert_eq!(err.code, "FLOW_NOT_FOUND");
}

// ═══════════════════════════════════════════════════════════════
// 5. build() with no initial state -> error
// ═══════════════════════════════════════════════════════════════

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
enum NoInit {
    A,
    B,
}
impl FlowState for NoInit {
    fn is_terminal(&self) -> bool {
        matches!(self, Self::B)
    }
    fn is_initial(&self) -> bool {
        false
    }
    fn all_states() -> &'static [Self] {
        &[Self::A, Self::B]
    }
}

#[test]
fn build_with_no_initial_state_fails() {
    let result = Builder::<NoInit>::new("no-init")
        .from(NoInit::A)
        .auto(NoInit::B, Noop)
        .build();
    assert!(
        result.is_err(),
        "build should fail without an initial state"
    );

    let validation = Builder::<NoInit>::new("no-init-structured")
        .from(NoInit::A)
        .auto(NoInit::B, Noop)
        .build_and_validate();
    assert!(validation.definition.is_none());
    assert!(validation
        .errors
        .iter()
        .any(|e| e.code == "NO_INITIAL_STATE"));
}
