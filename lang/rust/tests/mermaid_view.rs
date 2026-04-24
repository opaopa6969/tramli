//! Issue #47: unified view option for MermaidGenerator

use std::any::TypeId;
use std::time::Duration;
use tramli::*;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
enum S { A, B, C }

impl FlowState for S {
    fn is_terminal(&self) -> bool { matches!(self, Self::C) }
    fn is_initial(&self) -> bool { matches!(self, Self::A) }
    fn all_states() -> &'static [Self] { &[Self::A, Self::B, Self::C] }
}

#[derive(Clone)] struct Num(i32);
#[derive(Clone)] struct Str(String);

struct P1;
impl StateProcessor<S> for P1 {
    fn name(&self) -> &str { "p1" }
    fn requires(&self) -> Vec<TypeId> { vec![] }
    fn produces(&self) -> Vec<TypeId> { requires![Num] }
    fn process(&self, ctx: &mut FlowContext) -> Result<(), FlowError> {
        ctx.put(Num(1));
        Ok(())
    }
}

struct P2;
impl StateProcessor<S> for P2 {
    fn name(&self) -> &str { "p2" }
    fn requires(&self) -> Vec<TypeId> { requires![Num] }
    fn produces(&self) -> Vec<TypeId> { requires![Str] }
    fn process(&self, ctx: &mut FlowContext) -> Result<(), FlowError> {
        let n = ctx.get::<Num>()?;
        ctx.put(Str(format!("n={}", n.0)));
        Ok(())
    }
}

fn build_flow() -> FlowDefinition<S> {
    Builder::<S>::new("view-test")
        .ttl(Duration::from_secs(60))
        .from(S::A).auto(S::B, P1)
        .from(S::B).auto(S::C, P2)
        .build()
        .expect("build ok")
}

#[test]
fn default_view_is_state() {
    let def = build_flow();
    let out = MermaidGenerator::generate(&def);
    assert!(out.contains("stateDiagram-v2"), "got: {out}");
    assert!(out.contains("A") && out.contains("B"), "got: {out}");
}

#[test]
fn view_state_equals_default() {
    let def = build_flow();
    assert_eq!(
        MermaidGenerator::generate(&def),
        MermaidGenerator::generate_with_view(&def, MermaidView::State),
    );
}

#[test]
fn view_dataflow_produces_flowchart() {
    let def = build_flow();
    let out = MermaidGenerator::generate_with_view(&def, MermaidView::DataFlow);
    assert!(out.contains("flowchart LR"), "got: {out}");
    assert!(out.contains("p1"), "got: {out}");
    assert!(out.contains("p2"), "got: {out}");
    assert!(out.contains("produces"), "got: {out}");
    assert!(out.contains("requires"), "got: {out}");
    assert!(!out.contains("stateDiagram"), "got: {out}");
    // NOTE: Rust DataFlowGraph currently renders type nodes as "unknown" because
    // TypeId → name resolution is not implemented. This is a separate gap (not in scope
    // for Issue #47). Java/TS do resolve type names correctly (see respective tests).
}

#[test]
fn view_dataflow_equals_generate_data_flow() {
    let def = build_flow();
    assert_eq!(
        MermaidGenerator::generate_data_flow(&def),
        MermaidGenerator::generate_with_view(&def, MermaidView::DataFlow),
    );
}
