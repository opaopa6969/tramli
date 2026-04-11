use std::any::TypeId;
use std::collections::HashMap;
use std::sync::Arc;
use std::time::Duration;
use tramli::*;

// ─── Error Path states ─────────────────────────────────
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
enum EP { Start, Mid, Err, Done }
impl FlowState for EP {
    fn is_terminal(&self) -> bool { matches!(self, Self::Done) }
    fn is_initial(&self) -> bool { matches!(self, Self::Start) }
    fn all_states() -> &'static [Self] { &[Self::Start, Self::Mid, Self::Err, Self::Done] }
}

#[derive(Clone)] struct EpInput(String);
#[derive(Clone)] struct EpMiddle(String);

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
enum S { A, B, C }
impl FlowState for S {
    fn is_terminal(&self) -> bool { matches!(self, Self::C) }
    fn is_initial(&self) -> bool { matches!(self, Self::A) }
    fn all_states() -> &'static [Self] { &[Self::A, Self::B, Self::C] }
}

#[derive(Clone)] struct D(String);
#[derive(Clone)] struct E(String);

struct P1;
impl StateProcessor<S> for P1 {
    fn name(&self) -> &str { "P1" }
    fn requires(&self) -> Vec<TypeId> { requires![D] }
    fn produces(&self) -> Vec<TypeId> { requires![E] }
    fn process(&self, ctx: &mut FlowContext) -> Result<(), FlowError> {
        let d = ctx.get::<D>()?;
        ctx.put(E(format!("from-{}", d.0)));
        Ok(())
    }
}

struct P2;
impl StateProcessor<S> for P2 {
    fn name(&self) -> &str { "P2" }
    fn requires(&self) -> Vec<TypeId> { requires![E] }
    fn produces(&self) -> Vec<TypeId> { vec![] }
    fn process(&self, ctx: &mut FlowContext) -> Result<(), FlowError> {
        let _e = ctx.get::<E>()?;
        Ok(())
    }
}

#[test]
fn build_with_requires_produces() {
    let result = Builder::<S>::new("t")
        .ttl(Duration::from_secs(60))
        .initially_available(requires![D])
        .from(S::A).auto(S::B, P1)
        .from(S::B).auto(S::C, P2)
        .build();
    match &result {
        Ok(_) => eprintln!("Build OK"),
        Err(e) => eprintln!("Build FAILED: {}", e),
    }
    assert!(result.is_ok());
}

#[test]
fn start_with_requires_produces() {
    let def = Arc::new(Builder::<S>::new("t")
        .ttl(Duration::from_secs(60))
        .initially_available(requires![D])
        .from(S::A).auto(S::B, P1)
        .from(S::B).auto(S::C, P2)
        .build().unwrap());
    let mut engine = FlowEngine::new(InMemoryFlowStore::new());
    let fid = engine.start_flow(def, "s1",
        vec![(TypeId::of::<D>(), Box::new(D("hello".into())) as Box<dyn CloneAny>)]).unwrap();
    let f = engine.store.get(&fid).unwrap();
    assert_eq!(f.current_state(), S::C);
    assert!(f.is_completed());
}

// ─── Error Path Tests ─────────────────────────────────

struct EpP1;
impl StateProcessor<EP> for EpP1 {
    fn name(&self) -> &str { "P1" }
    fn requires(&self) -> Vec<TypeId> { requires![EpInput] }
    fn produces(&self) -> Vec<TypeId> { requires![EpMiddle] }
    fn process(&self, ctx: &mut FlowContext) -> Result<(), FlowError> {
        ctx.put(EpMiddle("mid".into()));
        Ok(())
    }
}

struct EpP2;
impl StateProcessor<EP> for EpP2 {
    fn name(&self) -> &str { "P2" }
    fn requires(&self) -> Vec<TypeId> { requires![EpMiddle] }
    fn produces(&self) -> Vec<TypeId> { vec![] }
    fn process(&self, _ctx: &mut FlowContext) -> Result<(), FlowError> { Ok(()) }
}

#[test]
fn error_path_requires_unsatisfied_build_fails() {
    // ErrProc requires EpMiddle, but EpMiddle is only produced by P1.
    // If P1 fails at Start, EpMiddle is NOT available for the error path.
    let result = Builder::<EP>::new("errpath")
        .ttl(Duration::from_secs(60))
        .initially_available(requires![EpInput])
        .from(EP::Start).auto(EP::Mid, EpP1)
        .from(EP::Mid).auto(EP::Done, EpP2)
        .on_error(EP::Start, EP::Err)
        .from(EP::Err).auto(EP::Done, EpP2) // EpP2 requires EpMiddle — not available on error path
        .build();

    assert!(result.is_err());
    let err_msg = format!("{}", result.err().unwrap());
    assert!(err_msg.contains("may not be available"));
}

#[test]
fn error_path_to_terminal_build_succeeds() {
    // Error target is terminal (Done) — no processor requirements to check
    // Using S enum (A, B, C) where C is terminal
    let result = Builder::<S>::new("errterm")
        .ttl(Duration::from_secs(60))
        .initially_available(requires![D])
        .from(S::A).auto(S::B, P1)
        .from(S::B).auto(S::C, P2)
        .on_error(S::A, S::C)
        .build();

    assert!(result.is_ok());
}
