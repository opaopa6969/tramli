use std::any::TypeId;
use std::collections::HashMap;
use std::sync::Arc;
use std::time::Duration;
use tramli::*;

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
