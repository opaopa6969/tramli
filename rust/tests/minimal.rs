use std::any::TypeId;
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

struct P;
impl StateProcessor<S> for P {
    fn name(&self) -> &str { "P" }
    fn requires(&self) -> Vec<TypeId> { vec![] }
    fn produces(&self) -> Vec<TypeId> { vec![] }
    fn process(&self, _ctx: &mut FlowContext) -> Result<(), FlowError> {
        eprintln!("  process P");
        Ok(())
    }
}

#[test]
fn start_with_initial_data() {
    let def = Arc::new(Builder::<S>::new("t")
        .ttl(Duration::from_secs(60))
        .initially_available(requires![D])
        .from(S::A).auto(S::B, P)
        .from(S::B).auto(S::C, P)
        .build().unwrap());
    eprintln!("starting with data...");
    let mut engine = FlowEngine::new(InMemoryFlowStore::new());
    let fid = engine.start_flow(def, "s1",
        vec![(TypeId::of::<D>(), Box::new(D("hello".into())) as Box<dyn CloneAny>)]).unwrap();
    eprintln!("done");
    let f = engine.store.get(&fid).unwrap();
    assert_eq!(f.current_state(), S::C);
}
