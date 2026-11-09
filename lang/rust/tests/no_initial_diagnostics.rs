use std::any::TypeId;
use tramli::*;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
enum S {
    A,
    Done,
}

impl FlowState for S {
    fn is_initial(&self) -> bool {
        false
    }

    fn is_terminal(&self) -> bool {
        matches!(self, Self::Done)
    }

    fn all_states() -> &'static [Self] {
        &[Self::A, Self::Done]
    }
}

struct Processor(Vec<TypeId>);

impl StateProcessor<S> for Processor {
    fn name(&self) -> &str {
        "processor"
    }

    fn requires(&self) -> Vec<TypeId> {
        self.0.clone()
    }

    fn produces(&self) -> Vec<TypeId> {
        vec![]
    }

    fn process(&self, _: &mut FlowContext) -> Result<(), FlowError> {
        Ok(())
    }
}

struct Guard;

impl TransitionGuard<S> for Guard {
    fn name(&self) -> &str {
        "guard"
    }

    fn requires(&self) -> Vec<TypeId> {
        vec![]
    }

    fn produces(&self) -> Vec<TypeId> {
        vec![]
    }

    fn validate(&self, _: &FlowContext) -> GuardOutput {
        GuardOutput::Accepted {
            data: Default::default(),
        }
    }
}

fn assert_diagnostics(make_builder: impl Fn() -> Builder<S>, expected: &[(&str, Option<&str>)]) {
    let result = make_builder().build_and_validate();
    assert!(result.definition.is_none());
    let mut actual: Vec<_> = result
        .errors
        .iter()
        .map(|error| (error.code.as_str(), error.state.as_deref()))
        .collect();
    actual.sort_unstable();
    let mut expected = expected.to_vec();
    expected.sort_unstable();
    assert_eq!(actual, expected);

    // Both APIs must reject the definition and report the same diagnostics.
    let error = make_builder().build().err().expect("build must fail");
    assert_eq!(error.code, "INVALID_FLOW_DEFINITION");
    let mut build_messages: Vec<_> = error.message.split("\n  - ").skip(1).collect();
    build_messages.sort_unstable();
    let mut collected_messages: Vec<_> = result
        .errors
        .iter()
        .map(|error| error.message.as_str())
        .collect();
    collected_messages.sort_unstable();
    assert_eq!(build_messages, collected_messages);
}

#[test]
fn no_initial_state_still_reports_cycle() {
    assert_diagnostics(
        || {
            Builder::new("missing-initial-cycle")
                .from(S::A)
                .auto(S::A, Processor(vec![]))
        },
        &[("NO_INITIAL_STATE", None), ("DAG_CYCLE", None)],
    );
}

#[test]
fn no_initial_state_reports_all_independent_errors_together() {
    assert_diagnostics(
        || {
            Builder::new("missing-initial-multiple-errors")
                .from(S::A)
                .auto(S::A, Processor(vec![]))
                .from(S::A)
                .external(S::Done, Guard)
                .from(S::A)
                .external(S::Done, Guard)
                .from(S::Done)
                .auto(S::A, Processor(vec![]))
        },
        &[
            ("NO_INITIAL_STATE", None),
            ("DAG_CYCLE", None),
            ("EXTERNAL_REQUIRES_NOT_DISTINCT", Some("A")),
            ("AUTO_EXTERNAL_CONFLICT", Some("A")),
            ("TERMINAL_HAS_OUTGOING", Some("Done")),
        ],
    );
}

#[test]
fn no_initial_state_skips_checks_that_need_a_start_state() {
    // A is unreachable and cannot reach Done, and the processor needs missing data.
    assert_diagnostics(
        || {
            Builder::new("missing-initial-dependent-checks")
                .from(S::A)
                .auto(S::A, Processor(vec![TypeId::of::<u32>()]))
        },
        &[("NO_INITIAL_STATE", None), ("DAG_CYCLE", None)],
    );
}

#[test]
fn no_initial_state_alone_still_rejects_definition() {
    assert_diagnostics(
        || Builder::<S>::new("missing-initial-only"),
        &[("NO_INITIAL_STATE", None)],
    );
}
