use std::any::TypeId;
use std::collections::HashMap;
use std::sync::Arc;
use std::time::Duration;
use tramli::*;
use tramli::sub_flow::SubFlowRunner;

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
#[test]
fn basic_sub_flow() {
    // Sub-flow states
    #[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
    enum Sub { Init, Process, Done }
    impl FlowState for Sub {
        fn is_terminal(&self) -> bool { matches!(self, Self::Done) }
        fn is_initial(&self) -> bool { matches!(self, Self::Init) }
        fn all_states() -> &'static [Self] { &[Self::Init, Self::Process, Self::Done] }
    }

    #[derive(Clone)] struct SubOut(String);

    struct SubP1;
    impl StateProcessor<Sub> for SubP1 {
        fn name(&self) -> &str { "SubP1" }
        fn requires(&self) -> Vec<TypeId> { requires![D] }
        fn produces(&self) -> Vec<TypeId> { requires![SubOut] }
        fn process(&self, ctx: &mut FlowContext) -> Result<(), FlowError> {
            ctx.put(SubOut("done".into()));
            Ok(())
        }
    }

    struct SubP2;
    impl StateProcessor<Sub> for SubP2 {
        fn name(&self) -> &str { "SubP2" }
        fn requires(&self) -> Vec<TypeId> { requires![SubOut] }
        fn produces(&self) -> Vec<TypeId> { vec![] }
        fn process(&self, _ctx: &mut FlowContext) -> Result<(), FlowError> { Ok(()) }
    }

    let sub_def = Arc::new(Builder::<Sub>::new("sub")
        .ttl(Duration::from_secs(60))
        .initially_available(requires![D])
        .from(Sub::Init).auto(Sub::Process, SubP1)
        .from(Sub::Process).auto(Sub::Done, SubP2)
        .build().unwrap());

    let sub_runner = Box::new(tramli::sub_flow::SubFlowAdapter::new(sub_def));

    // Main flow states
    #[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
    enum M { Start, Done }
    impl FlowState for M {
        fn is_terminal(&self) -> bool { matches!(self, Self::Done) }
        fn is_initial(&self) -> bool { matches!(self, Self::Start) }
        fn all_states() -> &'static [Self] { &[Self::Start, Self::Done] }
    }

    let main_def = Arc::new(Builder::<M>::new("main")
        .ttl(Duration::from_secs(60))
        .initially_available(requires![D])
        .from(M::Start).sub_flow(sub_runner).on_exit("Done", M::Done).end_sub_flow()
        .build().unwrap());

    let mut engine = FlowEngine::new(InMemoryFlowStore::new());
    let fid = engine.start_flow(main_def, "s1",
        vec![(TypeId::of::<D>(), Box::new(D("hello".into())) as Box<dyn CloneAny>)]).unwrap();

    let f = engine.store.get(&fid).unwrap();
    assert_eq!(f.current_state(), M::Done);
    assert!(f.is_completed());
}

#[test]
fn sub_flow_with_external_resume() {
    // Sub-flow with external transition: start → auto → wait(external) → resume → done
    #[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
    enum SubExt { Init, Wait, Done }
    impl FlowState for SubExt {
        fn is_terminal(&self) -> bool { matches!(self, Self::Done) }
        fn is_initial(&self) -> bool { matches!(self, Self::Init) }
        fn all_states() -> &'static [Self] { &[Self::Init, Self::Wait, Self::Done] }
    }

    #[derive(Clone)] struct WaitData(String);

    struct WaitProc;
    impl StateProcessor<SubExt> for WaitProc {
        fn name(&self) -> &str { "WaitProc" }
        fn requires(&self) -> Vec<TypeId> { requires![D] }
        fn produces(&self) -> Vec<TypeId> { requires![WaitData] }
        fn process(&self, ctx: &mut FlowContext) -> Result<(), FlowError> {
            ctx.put(WaitData("waiting".into()));
            Ok(())
        }
    }

    struct WaitGuard;
    impl TransitionGuard<SubExt> for WaitGuard {
        fn name(&self) -> &str { "WaitGuard" }
        fn requires(&self) -> Vec<TypeId> { requires![WaitData] }
        fn produces(&self) -> Vec<TypeId> { vec![] }
        fn validate(&self, _ctx: &FlowContext) -> GuardOutput {
            GuardOutput::Accepted { data: std::collections::HashMap::new() }
        }
    }

    let sub_def = Arc::new(Builder::<SubExt>::new("sub-ext")
        .ttl(Duration::from_secs(60))
        .initially_available(requires![D])
        .from(SubExt::Init).auto(SubExt::Wait, WaitProc)
        .from(SubExt::Wait).external(SubExt::Done, WaitGuard)
        .build().unwrap());

    let sub_runner = Box::new(tramli::sub_flow::SubFlowAdapter::new(sub_def));

    #[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
    enum M2 { Start, Done }
    impl FlowState for M2 {
        fn is_terminal(&self) -> bool { matches!(self, Self::Done) }
        fn is_initial(&self) -> bool { matches!(self, Self::Start) }
        fn all_states() -> &'static [Self] { &[Self::Start, Self::Done] }
    }

    let main_def = Arc::new(Builder::<M2>::new("main-ext")
        .ttl(Duration::from_secs(60))
        .initially_available(requires![D])
        .from(M2::Start).sub_flow(sub_runner).on_exit("Done", M2::Done).end_sub_flow()
        .build().unwrap());

    let mut engine = FlowEngine::new(InMemoryFlowStore::new());
    let fid = engine.start_flow(main_def.clone(), "s1",
        vec![(TypeId::of::<D>(), Box::new(D("hello".into())) as Box<dyn CloneAny>)]).unwrap();

    // Should be waiting at sub-flow external
    let f = engine.store.get(&fid).unwrap();
    assert_eq!(f.current_state(), M2::Start); // parent still at Start
    assert!(!f.is_completed());

    // Resume — need to call sub-flow's resume through engine
    // Currently engine doesn't delegate resume to sub-flow automatically,
    // so we test the SubFlowAdapter directly
    let sub_adapter = tramli::sub_flow::SubFlowAdapter::new(
        Arc::new(Builder::<SubExt>::new("sub-ext-2")
            .ttl(Duration::from_secs(60))
            .initially_available(requires![D])
            .from(SubExt::Init).auto(SubExt::Wait, WaitProc)
            .from(SubExt::Wait).external(SubExt::Done, WaitGuard)
            .build().unwrap()));

    let mut ctx = FlowContext::new("test".into());
    ctx.put(D("hello".into()));

    // Start
    let result = sub_adapter.start(&mut ctx).unwrap();
    assert!(matches!(result, tramli::sub_flow::SubFlowResult::WaitingAtExternal));
    assert_eq!(sub_adapter.current_state_name(), Some("Wait".to_string()));

    // Resume
    let result = sub_adapter.resume(&mut ctx).unwrap();
    assert!(matches!(result, tramli::sub_flow::SubFlowResult::Completed(ref s) if s == "Done"));
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
