//! Shared test scenarios (docs/specs/shared-test-scenarios.md)
//! Covers: S06, S08, S09, S10, S11, S14, S15, S17, S18, S21

use std::any::TypeId;
use std::collections::HashMap;
use std::sync::Arc;
use std::time::Duration;

use tramli::*;

struct Noop;
impl<S: FlowState> StateProcessor<S> for Noop {
    fn name(&self) -> &str { "Noop" }
    fn requires(&self) -> Vec<TypeId> { vec![] }
    fn produces(&self) -> Vec<TypeId> { vec![] }
    fn process(&self, _ctx: &mut FlowContext) -> Result<(), FlowError> { Ok(()) }
}

// ═══════════════════════════════════════════════════════════════
// S06: Processor error with context rollback
// ═══════════════════════════════════════════════════════════════

mod s06 {
    use super::*;

    #[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
    enum S { A, B, C, Err }
    impl FlowState for S {
        fn is_terminal(&self) -> bool { matches!(self, Self::C | Self::Err) }
        fn is_initial(&self) -> bool { matches!(self, Self::A) }
        fn all_states() -> &'static [Self] { &[Self::A, Self::B, Self::C, Self::Err] }
    }

    #[derive(Clone)] struct TempData(String);

    struct FailProc;
    impl StateProcessor<S> for FailProc {
        fn name(&self) -> &str { "FailProc" }
        fn requires(&self) -> Vec<TypeId> { vec![] }
        fn produces(&self) -> Vec<TypeId> { vec![] }
        fn process(&self, ctx: &mut FlowContext) -> Result<(), FlowError> {
            ctx.put(TempData("should be rolled back".into()));
            Err(FlowError::new("PROC_ERROR", "boom"))
        }
    }

    #[test]
    fn s06_processor_error_rollback() {
        let def = Arc::new(
            Builder::<S>::new("s06")
                .from(S::A).auto(S::B, Noop)
                .from(S::B).auto(S::C, FailProc)
                .on_error(S::B, S::Err)
                .build()
                .unwrap(),
        );
        let mut engine = FlowEngine::new(InMemoryFlowStore::new());
        let fid = engine.start_flow(def, "s06", vec![]).unwrap();
        let f = engine.store.get(&fid).unwrap();
        assert_eq!(f.current_state(), S::Err);
        assert!(f.is_completed());
        // Context should be rolled back — TempData should NOT be present
        assert!(f.context.find::<TempData>().is_none(), "TempData should be rolled back");
    }
}

// ═══════════════════════════════════════════════════════════════
// S08: onStateEnter / onStateExit
// ═══════════════════════════════════════════════════════════════

mod s08 {
    use super::*;

    #[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
    enum S { A, B, C }
    impl FlowState for S {
        fn is_terminal(&self) -> bool { matches!(self, Self::C) }
        fn is_initial(&self) -> bool { matches!(self, Self::A) }
        fn all_states() -> &'static [Self] { &[Self::A, Self::B, Self::C] }
    }

    #[derive(Clone)] struct ExitedA(bool);
    #[derive(Clone)] struct EnteredB(bool);
    #[derive(Clone)] struct ExitedB(bool);
    #[derive(Clone)] struct EnteredC(bool);

    #[test]
    fn s08_enter_exit_actions() {
        let def = Arc::new(
            Builder::<S>::new("s08")
                .on_state_exit(S::A, |ctx| { ctx.put(ExitedA(true)); })
                .on_state_enter(S::B, |ctx| { ctx.put(EnteredB(true)); })
                .on_state_exit(S::B, |ctx| { ctx.put(ExitedB(true)); })
                .on_state_enter(S::C, |ctx| { ctx.put(EnteredC(true)); })
                .from(S::A).auto(S::B, Noop)
                .from(S::B).auto(S::C, Noop)
                .build()
                .unwrap(),
        );
        let mut engine = FlowEngine::new(InMemoryFlowStore::new());
        let fid = engine.start_flow(def, "s08", vec![]).unwrap();
        let f = engine.store.get(&fid).unwrap();
        assert_eq!(f.current_state(), S::C);
        assert!(f.context.find::<ExitedA>().is_some(), "ExitedA should be set");
        assert!(f.context.find::<EnteredB>().is_some(), "EnteredB should be set");
        assert!(f.context.find::<ExitedB>().is_some(), "ExitedB should be set");
        assert!(f.context.find::<EnteredC>().is_some(), "EnteredC should be set");
    }
}

// ═══════════════════════════════════════════════════════════════
// S09: onStepError exception routes
// ═══════════════════════════════════════════════════════════════

mod s09 {
    use super::*;

    #[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
    enum S { A, B, C, SpecialErr, GenericErr }
    impl FlowState for S {
        fn is_terminal(&self) -> bool { matches!(self, Self::C | Self::SpecialErr | Self::GenericErr) }
        fn is_initial(&self) -> bool { matches!(self, Self::A) }
        fn all_states() -> &'static [Self] { &[Self::A, Self::B, Self::C, Self::SpecialErr, Self::GenericErr] }
    }

    struct SpecificFailProc;
    impl StateProcessor<S> for SpecificFailProc {
        fn name(&self) -> &str { "SpecificFailProc" }
        fn requires(&self) -> Vec<TypeId> { vec![] }
        fn produces(&self) -> Vec<TypeId> { vec![] }
        fn process(&self, _ctx: &mut FlowContext) -> Result<(), FlowError> {
            Err(FlowError::new("SPECIFIC_ERROR", "specific failure"))
        }
    }

    struct GenericFailProc;
    impl StateProcessor<S> for GenericFailProc {
        fn name(&self) -> &str { "GenericFailProc" }
        fn requires(&self) -> Vec<TypeId> { vec![] }
        fn produces(&self) -> Vec<TypeId> { vec![] }
        fn process(&self, _ctx: &mut FlowContext) -> Result<(), FlowError> {
            Err(FlowError::new("GENERIC_ERROR", "generic failure"))
        }
    }

    #[test]
    fn s09_exception_route_specific() {
        let def = Arc::new(
            Builder::<S>::new("s09-specific")
                .from(S::A).auto(S::B, Noop)
                .from(S::B).auto(S::C, SpecificFailProc)
                .on_step_error(S::B, |e| e.code == "SPECIFIC_ERROR", "SpecificError", S::SpecialErr)
                .on_error(S::B, S::GenericErr)
                .build()
                .unwrap(),
        );
        let mut engine = FlowEngine::new(InMemoryFlowStore::new());
        let fid = engine.start_flow(def, "s09", vec![]).unwrap();
        let f = engine.store.get(&fid).unwrap();
        assert_eq!(f.current_state(), S::SpecialErr, "should route to SpecialErr via exception route");
    }

    #[test]
    fn s09_exception_route_fallback() {
        let def = Arc::new(
            Builder::<S>::new("s09-fallback")
                .from(S::A).auto(S::B, Noop)
                .from(S::B).auto(S::C, GenericFailProc)
                .on_step_error(S::B, |e| e.code == "SPECIFIC_ERROR", "SpecificError", S::SpecialErr)
                .on_error(S::B, S::GenericErr)
                .build()
                .unwrap(),
        );
        let mut engine = FlowEngine::new(InMemoryFlowStore::new());
        let fid = engine.start_flow(def, "s09", vec![]).unwrap();
        let f = engine.store.get(&fid).unwrap();
        assert_eq!(f.current_state(), S::GenericErr, "should fall back to GenericErr");
    }
}

// ═══════════════════════════════════════════════════════════════
// S10: Multi-external guard selection
// ═══════════════════════════════════════════════════════════════

mod s10 {
    use super::*;

    #[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
    enum S { A, B, C, D }
    impl FlowState for S {
        fn is_terminal(&self) -> bool { matches!(self, Self::C | Self::D) }
        fn is_initial(&self) -> bool { matches!(self, Self::A) }
        fn all_states() -> &'static [Self] { &[Self::A, Self::B, Self::C, Self::D] }
    }

    #[derive(Clone)] struct PaymentData(String);
    #[derive(Clone)] struct CancelRequest(String);

    struct PaymentGuard;
    impl TransitionGuard<S> for PaymentGuard {
        fn name(&self) -> &str { "paymentGuard" }
        fn requires(&self) -> Vec<TypeId> { requires![PaymentData] }
        fn produces(&self) -> Vec<TypeId> { vec![] }
        fn validate(&self, _ctx: &FlowContext) -> GuardOutput {
            GuardOutput::Accepted { data: HashMap::new() }
        }
    }

    struct CancelGuard;
    impl TransitionGuard<S> for CancelGuard {
        fn name(&self) -> &str { "cancelGuard" }
        fn requires(&self) -> Vec<TypeId> { requires![CancelRequest] }
        fn produces(&self) -> Vec<TypeId> { vec![] }
        fn validate(&self, _ctx: &FlowContext) -> GuardOutput {
            GuardOutput::Accepted { data: HashMap::new() }
        }
    }

    #[test]
    fn s10_multi_external_payment() {
        let def = Arc::new(
            Builder::<S>::new("s10")
                .initially_available(requires![PaymentData, CancelRequest])
                .from(S::A).auto(S::B, Noop)
                .from(S::B).external(S::C, PaymentGuard)
                .from(S::B).external(S::D, CancelGuard)
                .build()
                .unwrap(),
        );
        let mut engine = FlowEngine::new(InMemoryFlowStore::new());
        let fid = engine.start_flow(def, "s10", vec![]).unwrap();
        // Resume with PaymentData → should select paymentGuard → C
        engine.resume_and_execute(&fid, vec![
            (TypeId::of::<PaymentData>(), Box::new(PaymentData("card".into())) as Box<dyn CloneAny>),
        ]).unwrap();
        let f = engine.store.get(&fid).unwrap();
        assert_eq!(f.current_state(), S::C, "PaymentData should select paymentGuard → C");
    }

    #[test]
    fn s10_multi_external_cancel() {
        let def = Arc::new(
            Builder::<S>::new("s10")
                .initially_available(requires![PaymentData, CancelRequest])
                .from(S::A).auto(S::B, Noop)
                .from(S::B).external(S::C, PaymentGuard)
                .from(S::B).external(S::D, CancelGuard)
                .build()
                .unwrap(),
        );
        let mut engine = FlowEngine::new(InMemoryFlowStore::new());
        let fid = engine.start_flow(def, "s10", vec![]).unwrap();
        // Resume with CancelRequest → should select cancelGuard → D
        engine.resume_and_execute(&fid, vec![
            (TypeId::of::<CancelRequest>(), Box::new(CancelRequest("user".into())) as Box<dyn CloneAny>),
        ]).unwrap();
        let f = engine.store.get(&fid).unwrap();
        assert_eq!(f.current_state(), S::D, "CancelRequest should select cancelGuard → D");
    }
}

// ═══════════════════════════════════════════════════════════════
// S14: Per-guard failure count
// ═══════════════════════════════════════════════════════════════

mod s14 {
    use super::*;

    #[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
    enum S { A, B, C }
    impl FlowState for S {
        fn is_terminal(&self) -> bool { matches!(self, Self::C) }
        fn is_initial(&self) -> bool { matches!(self, Self::A) }
        fn all_states() -> &'static [Self] { &[Self::A, Self::B, Self::C] }
    }

    struct AlwaysReject;
    impl TransitionGuard<S> for AlwaysReject {
        fn name(&self) -> &str { "myGuard" }
        fn requires(&self) -> Vec<TypeId> { vec![] }
        fn produces(&self) -> Vec<TypeId> { vec![] }
        fn validate(&self, _ctx: &FlowContext) -> GuardOutput {
            GuardOutput::Rejected { reason: "nope".into() }
        }
    }

    #[test]
    fn s14_per_guard_count() {
        let def = Arc::new(
            Builder::<S>::new("s14")
                .max_guard_retries(5)
                .from(S::A).auto(S::B, Noop)
                .from(S::B).external(S::C, AlwaysReject)
                .build()
                .unwrap(),
        );
        let mut engine = FlowEngine::new(InMemoryFlowStore::new());
        let fid = engine.start_flow(def.clone(), "s14", vec![]).unwrap();

        engine.resume_and_execute(&fid, vec![]).unwrap();
        let f = engine.store.get(&fid).unwrap();
        assert_eq!(f.guard_failure_count(), 1);
        assert_eq!(f.guard_failure_count_for("myGuard"), 1);

        engine.resume_and_execute(&fid, vec![]).unwrap();
        let f = engine.store.get(&fid).unwrap();
        assert_eq!(f.guard_failure_count(), 2);
        assert_eq!(f.guard_failure_count_for("myGuard"), 2);
    }
}

// ═══════════════════════════════════════════════════════════════
// S15: guardFailureCount reset on state change
// ═══════════════════════════════════════════════════════════════

mod s15 {
    use super::*;
    use std::sync::atomic::{AtomicUsize, Ordering};

    #[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
    enum S { A, B, C, D }
    impl FlowState for S {
        fn is_terminal(&self) -> bool { matches!(self, Self::D) }
        fn is_initial(&self) -> bool { matches!(self, Self::A) }
        fn all_states() -> &'static [Self] { &[Self::A, Self::B, Self::C, Self::D] }
    }

    struct RejectOnceGuard { call_count: &'static AtomicUsize }
    impl TransitionGuard<S> for RejectOnceGuard {
        fn name(&self) -> &str { "guardBC" }
        fn requires(&self) -> Vec<TypeId> { vec![] }
        fn produces(&self) -> Vec<TypeId> { vec![] }
        fn validate(&self, _ctx: &FlowContext) -> GuardOutput {
            if self.call_count.fetch_add(1, Ordering::SeqCst) == 0 {
                GuardOutput::Rejected { reason: "first try".into() }
            } else {
                GuardOutput::Accepted { data: HashMap::new() }
            }
        }
    }

    struct AcceptGuard;
    impl TransitionGuard<S> for AcceptGuard {
        fn name(&self) -> &str { "guardCD" }
        fn requires(&self) -> Vec<TypeId> { vec![] }
        fn produces(&self) -> Vec<TypeId> { vec![] }
        fn validate(&self, _ctx: &FlowContext) -> GuardOutput {
            GuardOutput::Accepted { data: HashMap::new() }
        }
    }

    #[test]
    fn s15_guard_count_reset() {
        static BC_CALLS: AtomicUsize = AtomicUsize::new(0);
        BC_CALLS.store(0, Ordering::SeqCst);

        let def = Arc::new(
            Builder::<S>::new("s15")
                .max_guard_retries(5)
                .from(S::A).auto(S::B, Noop)
                .from(S::B).external(S::C, RejectOnceGuard { call_count: &BC_CALLS })
                .from(S::C).external(S::D, AcceptGuard)
                .build()
                .unwrap(),
        );
        let mut engine = FlowEngine::new(InMemoryFlowStore::new());
        let fid = engine.start_flow(def.clone(), "s15", vec![]).unwrap();

        // Reject at B
        engine.resume_and_execute(&fid, vec![]).unwrap();
        assert_eq!(engine.store.get(&fid).unwrap().guard_failure_count(), 1);

        // Accept at B → C (state change resets count)
        engine.resume_and_execute(&fid, vec![]).unwrap();
        let f = engine.store.get(&fid).unwrap();
        assert_eq!(f.current_state(), S::C);
        assert_eq!(f.guard_failure_count(), 0, "guard count should reset on state change");

        // Accept at C → D
        engine.resume_and_execute(&fid, vec![]).unwrap();
        assert!(engine.store.get(&fid).unwrap().is_completed());
    }
}

// ═══════════════════════════════════════════════════════════════
// S17: External with processor
// ═══════════════════════════════════════════════════════════════

mod s17 {
    use super::*;

    #[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
    enum S { A, B, C }
    impl FlowState for S {
        fn is_terminal(&self) -> bool { matches!(self, Self::C) }
        fn is_initial(&self) -> bool { matches!(self, Self::A) }
        fn all_states() -> &'static [Self] { &[Self::A, Self::B, Self::C] }
    }

    #[derive(Clone)] struct Validated(bool);
    #[derive(Clone)] struct Result_(String);

    struct MyGuard;
    impl TransitionGuard<S> for MyGuard {
        fn name(&self) -> &str { "myGuard" }
        fn requires(&self) -> Vec<TypeId> { vec![] }
        fn produces(&self) -> Vec<TypeId> { requires![Validated] }
        fn validate(&self, _ctx: &FlowContext) -> GuardOutput {
            let mut data = HashMap::new();
            data.insert(TypeId::of::<Validated>(), Box::new(Validated(true)) as Box<dyn CloneAny>);
            GuardOutput::Accepted { data }
        }
    }

    struct PostProc;
    impl StateProcessor<S> for PostProc {
        fn name(&self) -> &str { "postProc" }
        fn requires(&self) -> Vec<TypeId> { requires![Validated] }
        fn produces(&self) -> Vec<TypeId> { requires![Result_] }
        fn process(&self, ctx: &mut FlowContext) -> Result<(), FlowError> {
            ctx.put(Result_("done".into()));
            Ok(())
        }
    }

    #[test]
    fn s17_external_with_processor() {
        let def = Arc::new(
            Builder::<S>::new("s17")
                .initially_available(requires![Validated])
                .from(S::A).auto(S::B, Noop)
                .from(S::B).external_with_processor(S::C, MyGuard, PostProc)
                .build()
                .unwrap(),
        );
        let mut engine = FlowEngine::new(InMemoryFlowStore::new());
        let fid = engine.start_flow(def, "s17", vec![]).unwrap();
        engine.resume_and_execute(&fid, vec![]).unwrap();
        let f = engine.store.get(&fid).unwrap();
        assert_eq!(f.current_state(), S::C);
        assert_eq!(f.context.get::<Result_>().unwrap().0, "done");
    }
}

// ═══════════════════════════════════════════════════════════════
// S18: allowPerpetual
// ═══════════════════════════════════════════════════════════════

mod s18 {
    use super::*;

    #[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
    enum S { A, B }
    impl FlowState for S {
        fn is_terminal(&self) -> bool { false }
        fn is_initial(&self) -> bool { matches!(self, Self::A) }
        fn all_states() -> &'static [Self] { &[Self::A, Self::B] }
    }

    struct AcceptGuard;
    impl TransitionGuard<S> for AcceptGuard {
        fn name(&self) -> &str { "CycleGuard" }
        fn requires(&self) -> Vec<TypeId> { vec![] }
        fn produces(&self) -> Vec<TypeId> { vec![] }
        fn validate(&self, _ctx: &FlowContext) -> GuardOutput {
            GuardOutput::Accepted { data: HashMap::new() }
        }
    }

    #[test]
    fn s18_perpetual_builds_ok() {
        let result = Builder::<S>::new("s18")
            .allow_perpetual()
            .from(S::A).auto(S::B, Noop)
            .from(S::B).external(S::A, AcceptGuard)
            .build();
        assert!(result.is_ok());
    }

    #[test]
    fn s18_perpetual_without_flag_fails() {
        let result = Builder::<S>::new("s18")
            .from(S::A).auto(S::B, Noop)
            .from(S::B).external(S::A, AcceptGuard)
            .build();
        assert!(result.is_err());
    }
}

// ═══════════════════════════════════════════════════════════════
// S21: withPlugin basic (SubFlowAdapter in Rust)
// ═══════════════════════════════════════════════════════════════

mod s21 {
    use super::*;
    use tramli::sub_flow::SubFlowAdapter;

    #[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
    enum M { Created, Payment, Done }
    impl FlowState for M {
        fn is_terminal(&self) -> bool { matches!(self, Self::Done) }
        fn is_initial(&self) -> bool { matches!(self, Self::Created) }
        fn all_states() -> &'static [Self] { &[Self::Created, Self::Payment, Self::Done] }
    }

    #[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
    enum Pl { Init, Done }
    impl FlowState for Pl {
        fn is_terminal(&self) -> bool { matches!(self, Self::Done) }
        fn is_initial(&self) -> bool { matches!(self, Self::Init) }
        fn all_states() -> &'static [Self] { &[Self::Init, Self::Done] }
    }

    #[derive(Clone)] struct PluginResult(String);

    struct PluginProc;
    impl StateProcessor<Pl> for PluginProc {
        fn name(&self) -> &str { "pluginProc" }
        fn requires(&self) -> Vec<TypeId> { vec![] }
        fn produces(&self) -> Vec<TypeId> { requires![PluginResult] }
        fn process(&self, ctx: &mut FlowContext) -> Result<(), FlowError> {
            ctx.put(PluginResult("validated".into()));
            Ok(())
        }
    }

    #[test]
    fn s21_plugin_inserts_subflow() {
        let plugin_def = Arc::new(
            Builder::<Pl>::new("validation")
                .from(Pl::Init).auto(Pl::Done, PluginProc)
                .build()
                .unwrap(),
        );
        let main_def = Arc::new(
            Builder::<M>::new("order")
                .from(M::Created)
                    .sub_flow(Box::new(SubFlowAdapter::new(plugin_def)))
                    .on_exit("Done", M::Payment)
                    .end_sub_flow()
                .from(M::Payment).auto(M::Done, Noop)
                .build()
                .unwrap(),
        );
        let mut engine = FlowEngine::new(InMemoryFlowStore::new());
        let fid = engine.start_flow(main_def, "s21", vec![]).unwrap();
        let f = engine.store.get(&fid).unwrap();
        assert_eq!(f.current_state(), M::Done);
        assert!(f.is_completed());
        assert_eq!(f.context.get::<PluginResult>().unwrap().0, "validated");
    }
}

// ═══════════════════════════════════════════════════════════════
// S11: Per-state timeout
// ═══════════════════════════════════════════════════════════════

mod s11 {
    use super::*;

    #[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
    enum S { A, B, C }
    impl FlowState for S {
        fn is_terminal(&self) -> bool { matches!(self, Self::C) }
        fn is_initial(&self) -> bool { matches!(self, Self::A) }
        fn all_states() -> &'static [Self] { &[Self::A, Self::B, Self::C] }
    }

    struct AcceptGuard;
    impl TransitionGuard<S> for AcceptGuard {
        fn name(&self) -> &str { "guard" }
        fn requires(&self) -> Vec<TypeId> { vec![] }
        fn produces(&self) -> Vec<TypeId> { vec![] }
        fn validate(&self, _ctx: &FlowContext) -> GuardOutput {
            GuardOutput::Accepted { data: HashMap::new() }
        }
    }

    #[test]
    fn s11_per_state_timeout_expired() {
        let def = Arc::new(
            Builder::<S>::new("s11")
                .from(S::A).auto(S::B, Noop)
                .from(S::B).external_with_timeout(S::C, AcceptGuard, Duration::from_millis(0))
                .build()
                .unwrap(),
        );
        let mut engine = FlowEngine::new(InMemoryFlowStore::new());
        let fid = engine.start_flow(def, "s11", vec![]).unwrap();
        // Timeout is 0ms, so any resume should expire
        std::thread::sleep(Duration::from_millis(1));
        engine.resume_and_execute(&fid, vec![]).unwrap();
        let f = engine.store.get(&fid).unwrap();
        assert!(f.is_completed());
        assert_eq!(f.exit_state(), Some("EXPIRED"));
    }
}

// ═══════════════════════════════════════════════════════════════
// S22: withPlugin preserves enter/exit actions (via SubFlow)
// ═══════════════════════════════════════════════════════════════

mod s22 {
    use super::*;
    use tramli::sub_flow::SubFlowAdapter;

    #[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
    enum M { A, B, C }
    impl FlowState for M {
        fn is_terminal(&self) -> bool { matches!(self, Self::C) }
        fn is_initial(&self) -> bool { matches!(self, Self::A) }
        fn all_states() -> &'static [Self] { &[Self::A, Self::B, Self::C] }
    }

    #[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
    enum Pl { Init, Done }
    impl FlowState for Pl {
        fn is_terminal(&self) -> bool { matches!(self, Self::Done) }
        fn is_initial(&self) -> bool { matches!(self, Self::Init) }
        fn all_states() -> &'static [Self] { &[Self::Init, Self::Done] }
    }

    #[derive(Clone)] struct ExitedA(bool);
    #[derive(Clone)] struct EnteredB(bool);

    #[test]
    fn s22_plugin_preserves_actions() {
        let plugin_def = Arc::new(
            Builder::<Pl>::new("plugin")
                .from(Pl::Init).auto(Pl::Done, Noop)
                .build()
                .unwrap(),
        );
        let def = Arc::new(
            Builder::<M>::new("s22")
                .on_state_exit(M::A, |ctx| { ctx.put(ExitedA(true)); })
                .on_state_enter(M::B, |ctx| { ctx.put(EnteredB(true)); })
                .from(M::A)
                    .sub_flow(Box::new(SubFlowAdapter::new(plugin_def)))
                    .on_exit("Done", M::B)
                    .end_sub_flow()
                .from(M::B).auto(M::C, Noop)
                .build()
                .unwrap(),
        );
        let mut engine = FlowEngine::new(InMemoryFlowStore::new());
        let fid = engine.start_flow(def, "s22", vec![]).unwrap();
        let f = engine.store.get(&fid).unwrap();
        assert_eq!(f.current_state(), M::C);
        assert!(f.context.find::<ExitedA>().is_some(), "ExitedA should fire");
        assert!(f.context.find::<EnteredB>().is_some(), "EnteredB should fire");
    }
}

// ═══════════════════════════════════════════════════════════════
// S23: withPlugin preserves exception routes (via SubFlow)
// ═══════════════════════════════════════════════════════════════

mod s23 {
    use super::*;
    use tramli::sub_flow::SubFlowAdapter;

    #[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
    enum M { A, B, C, SpecialErr }
    impl FlowState for M {
        fn is_terminal(&self) -> bool { matches!(self, Self::C | Self::SpecialErr) }
        fn is_initial(&self) -> bool { matches!(self, Self::A) }
        fn all_states() -> &'static [Self] { &[Self::A, Self::B, Self::C, Self::SpecialErr] }
    }

    #[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
    enum Pl { Init, Done }
    impl FlowState for Pl {
        fn is_terminal(&self) -> bool { matches!(self, Self::Done) }
        fn is_initial(&self) -> bool { matches!(self, Self::Init) }
        fn all_states() -> &'static [Self] { &[Self::Init, Self::Done] }
    }

    struct SpecificFailProc;
    impl StateProcessor<M> for SpecificFailProc {
        fn name(&self) -> &str { "SpecificFail" }
        fn requires(&self) -> Vec<TypeId> { vec![] }
        fn produces(&self) -> Vec<TypeId> { vec![] }
        fn process(&self, _ctx: &mut FlowContext) -> Result<(), FlowError> {
            Err(FlowError::new("SPECIFIC_ERROR", "specific"))
        }
    }

    #[test]
    fn s23_plugin_preserves_exception_routes() {
        let plugin_def = Arc::new(
            Builder::<Pl>::new("plugin")
                .from(Pl::Init).auto(Pl::Done, Noop)
                .build()
                .unwrap(),
        );
        let def = Arc::new(
            Builder::<M>::new("s23")
                .from(M::A)
                    .sub_flow(Box::new(SubFlowAdapter::new(plugin_def)))
                    .on_exit("Done", M::B)
                    .end_sub_flow()
                .from(M::B).auto(M::C, SpecificFailProc)
                .on_step_error(M::B, |e| e.code == "SPECIFIC_ERROR", "SpecificError", M::SpecialErr)
                .build()
                .unwrap(),
        );
        let mut engine = FlowEngine::new(InMemoryFlowStore::new());
        let fid = engine.start_flow(def, "s23", vec![]).unwrap();
        let f = engine.store.get(&fid).unwrap();
        assert_eq!(f.current_state(), M::SpecialErr, "exception route should still work with sub-flow");
    }
}

// ═══════════════════════════════════════════════════════════════
// S30: Plugin/SubFlow name convention
// ═══════════════════════════════════════════════════════════════

mod s30 {
    use super::*;
    use tramli::sub_flow::{SubFlowAdapter, SubFlowRunner};

    #[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
    enum M { A, B }
    impl FlowState for M {
        fn is_terminal(&self) -> bool { matches!(self, Self::B) }
        fn is_initial(&self) -> bool { matches!(self, Self::A) }
        fn all_states() -> &'static [Self] { &[Self::A, Self::B] }
    }

    #[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
    enum Pl { Init, Done }
    impl FlowState for Pl {
        fn is_terminal(&self) -> bool { matches!(self, Self::Done) }
        fn is_initial(&self) -> bool { matches!(self, Self::Init) }
        fn all_states() -> &'static [Self] { &[Self::Init, Self::Done] }
    }

    #[test]
    fn s30_subflow_runner_name() {
        let plugin_def = Arc::new(
            Builder::<Pl>::new("validation")
                .from(Pl::Init).auto(Pl::Done, Noop)
                .build()
                .unwrap(),
        );
        let adapter = SubFlowAdapter::new(plugin_def);
        assert_eq!(adapter.name(), "validation", "SubFlowAdapter name should match definition name");
    }
}
