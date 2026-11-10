//! Test-only shared JSON loader. Each test runs its cases serially on its own
//! thread, and the state flags are thread-local.
use serde_json::{json, Value};
use std::any::TypeId;
use std::cell::Cell;
use std::collections::BTreeSet;
use std::path::PathBuf;
use tramli::*;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
enum State {
    S0,
    S1,
    S2,
    S3,
    S4,
    S5,
    S6,
    S7,
}
const STATES: [State; 8] = [
    State::S0,
    State::S1,
    State::S2,
    State::S3,
    State::S4,
    State::S5,
    State::S6,
    State::S7,
];
thread_local! {
    static FLAGS: Cell<(u8, u8)> = const { Cell::new((0, 0)) };
}
impl FlowState for State {
    fn is_initial(&self) -> bool {
        FLAGS.with(|f| f.get().0 & (1 << (*self as u8)) != 0)
    }
    fn is_terminal(&self) -> bool {
        FLAGS.with(|f| f.get().1 & (1 << (*self as u8)) != 0)
    }
    fn all_states() -> &'static [Self] {
        &STATES
    }
}
struct T0;
struct T1;
struct T2;
struct T3;
struct T4;
struct T5;
struct T6;
struct T7;
fn pool() -> [TypeId; 8] {
    [
        TypeId::of::<T0>(),
        TypeId::of::<T1>(),
        TypeId::of::<T2>(),
        TypeId::of::<T3>(),
        TypeId::of::<T4>(),
        TypeId::of::<T5>(),
        TypeId::of::<T6>(),
        TypeId::of::<T7>(),
    ]
}
fn types(v: &Value) -> Vec<TypeId> {
    let pool = pool();
    v.as_array()
        .unwrap()
        .iter()
        .map(|t| pool[t.as_str().unwrap()[1..].parse::<usize>().unwrap()])
        .collect()
}
fn state(v: &Value, key: &str) -> State {
    STATES[v[key].as_str().unwrap()[1..].parse::<usize>().unwrap()]
}
struct Component {
    name: String,
    requires: Vec<TypeId>,
    produces: Vec<TypeId>,
}
impl Component {
    fn new(name: String, v: &Value) -> Self {
        Self {
            name,
            requires: types(&v["requires"]),
            produces: v.get("produces").map(types).unwrap_or_default(),
        }
    }
}
impl StateProcessor<State> for Component {
    fn name(&self) -> &str {
        &self.name
    }
    fn requires(&self) -> Vec<TypeId> {
        self.requires.clone()
    }
    fn produces(&self) -> Vec<TypeId> {
        self.produces.clone()
    }
    fn process(&self, _: &mut FlowContext) -> Result<(), FlowError> {
        panic!("Validation must not execute processors")
    }
}
impl TransitionGuard<State> for Component {
    fn name(&self) -> &str {
        &self.name
    }
    fn requires(&self) -> Vec<TypeId> {
        self.requires.clone()
    }
    fn produces(&self) -> Vec<TypeId> {
        self.produces.clone()
    }
    fn validate(&self, _: &FlowContext) -> GuardOutput {
        panic!("Validation must not execute guards")
    }
}
impl BranchProcessor<State> for Component {
    fn name(&self) -> &str {
        &self.name
    }
    fn requires(&self) -> Vec<TypeId> {
        self.requires.clone()
    }
    fn decide(&self, _: &FlowContext) -> String {
        panic!("Validation must not execute branches")
    }
}
fn build(c: &Value) -> Builder<State> {
    let mut flags = (0, 0);
    for (i, s) in c["states"].as_array().unwrap().iter().enumerate() {
        if s["initial"].as_bool().unwrap() {
            flags.0 |= 1 << i;
        }
        if s["terminal"].as_bool().unwrap() {
            flags.1 |= 1 << i;
        }
    }
    FLAGS.with(|f| f.set(flags));
    let mut b = Builder::new(c["id"].as_str().unwrap())
        .initially_available(types(&c["initiallyAvailable"]))
        .externally_provided(types(&c["externallyProvided"]));
    if c["allowPerpetual"].as_bool().unwrap() {
        b = b.allow_perpetual();
    }
    if c["allowUnreachable"].as_bool().unwrap() {
        b = b.allow_unreachable();
    }
    for (i, t) in c["transitions"].as_array().unwrap().iter().enumerate() {
        let name = format!("e{i}");
        let from = b.from(state(t, "from"));
        b = match t["kind"].as_str().unwrap() {
            "auto" => from.auto(state(t, "to"), Component::new(name, &t["processor"])),
            "external" => {
                let guard = Component::new(name.clone(), &t["guard"]);
                if let Some(p) = t.get("processor") {
                    from.external_with_processor(state(t, "to"), guard, Component::new(name, p))
                } else {
                    from.external(state(t, "to"), guard)
                }
            }
            "branch" => {
                let mut branch = from.branch(Component::new(name, &t["branch"]));
                for target in t["targets"].as_array().unwrap() {
                    assert!(
                        target.get("processor").is_none(),
                        "Rust branch targets do not support processors"
                    );
                    branch = branch.to(state(target, "to"), target["label"].as_str().unwrap());
                }
                branch.end_branch()
            }
            kind => panic!("Unknown transition kind: {kind}"),
        };
    }
    for r in c["onError"].as_array().unwrap() {
        b = b.on_error(state(r, "from"), state(r, "to"));
    }
    for r in c["onStepError"].as_array().unwrap() {
        b = b.on_step_error(state(r, "from"), |_| true, "Exception", state(r, "to"));
    }
    b
}
fn normalize(code: &str, msg: &str) -> (String, String) {
    // Rust omits missing type names; preserve component identity and edge/state.
    for role in ["Processor", "Guard", "Branch"] {
        if let Some(rest) = msg.strip_prefix(&format!("{role} '")) {
            let (name, location) = rest.split_once("' at ").unwrap();
            let (location, _) = location.split_once(" requires ").unwrap();
            return (
                "MISSING_REQUIRES".into(),
                format!("{}:{name}@{location}", role.to_lowercase()),
            );
        }
    }
    if code == "DAG_CYCLE" || code == "NO_INITIAL_STATE" {
        return (code.into(), "flow".into());
    }
    if let Some(rest) = msg.strip_prefix("Terminal state ") {
        let (from, to) = rest.split_once(" has outgoing transition to ").unwrap();
        return ("TERMINAL_OUTGOING".into(), format!("{from}->{to}"));
    }
    for prefix in ["State ", "No path from "] {
        if let Some(rest) = msg.strip_prefix(prefix) {
            return (code.into(), rest.split_whitespace().next().unwrap().into());
        }
    }
    panic!("Unrecognized diagnostic: {code}: {msg}");
}
fn verdict(c: &Value) -> Value {
    let result = build(c).build_and_validate();
    let ok = build(c).build().is_ok();
    assert_eq!(
        ok,
        result.errors.is_empty(),
        "{}: build/build_and_validate parity",
        c["id"]
    );
    assert_eq!(ok, result.definition.is_some());
    let errors: BTreeSet<_> = result
        .errors
        .iter()
        .map(|e| normalize(&e.code, &e.message))
        .collect();
    FLAGS.with(|f| f.set((0, 0)));
    json!({ "ok": ok, "errors": errors })
}
#[test]
fn shared_build_verdicts() {
    let directory =
        PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../shared-tests/build-verdicts");
    let input = std::env::var_os("BUILD_VERDICT_CORPUS")
        .map(PathBuf::from)
        .unwrap_or_else(|| directory.join("corpus.json"));
    let cases: Value = serde_json::from_slice(&std::fs::read(input).unwrap()).unwrap();
    if let Some(output) = std::env::var_os("BUILD_VERDICT_OUTPUT") {
        let results: serde_json::Map<_, _> = cases
            .as_array()
            .unwrap()
            .iter()
            .map(|c| (c["id"].as_str().unwrap().to_owned(), verdict(c)))
            .collect();
        std::fs::write(output, serde_json::to_vec(&results).unwrap()).unwrap();
        return;
    }
    let expected: Value =
        serde_json::from_slice(&std::fs::read(directory.join("expected.json")).unwrap()).unwrap();
    let mut skipped = 0;
    for c in cases.as_array().unwrap() {
        let id = c["id"].as_str().unwrap();
        let issues: Vec<_> = expected["knownMismatches"]
            .as_object()
            .unwrap()
            .iter()
            .filter(|(_, skip)| {
                skip["languages"]
                    .as_array()
                    .unwrap()
                    .contains(&json!("rust"))
                    && skip["cases"].as_array().unwrap().contains(&json!(id))
            })
            .map(|(issue, _)| issue.as_str())
            .collect();
        if !issues.is_empty() {
            eprintln!("SKIP {id}: known mismatch issues {issues:?}");
            skipped += 1;
            continue;
        }
        assert_eq!(verdict(c), expected["verdicts"][id], "{id}");
    }
    eprintln!(
        "Build verdicts: {} checked, {skipped} known mismatches skipped",
        cases.as_array().unwrap().len() - skipped
    );
}

/// Requires and the two check-skipping flags cannot change a guaranteed set, so the
/// probe builds more often and exposes its graph (see shared-tests/data-flow-graph).
fn probe(c: &Value) -> Value {
    let mut p = c.clone();
    p["allowPerpetual"] = json!(true);
    p["allowUnreachable"] = json!(true);
    for t in p["transitions"].as_array_mut().unwrap() {
        for role in ["guard", "branch", "processor"] {
            if let Some(contract) = t.get_mut(role) {
                contract["requires"] = json!([]);
            }
        }
        if let Some(targets) = t.get_mut("targets").and_then(Value::as_array_mut) {
            for target in targets {
                if let Some(processor) = target.get_mut("processor") {
                    processor["requires"] = json!([]);
                }
            }
        }
    }
    p
}
/// Every state the graph tracks, with available_at() for it; null without a definition.
fn graph_result(c: &Value) -> Value {
    let result = build(&probe(c)).build_and_validate();
    let builds = result.errors.is_empty();
    let pool = pool();
    let available = result.definition.as_ref().map(|def| {
        let graph = def.data_flow_graph();
        let states: BTreeSet<String> = graph
            .generate_invariant_assertions()
            .iter()
            .map(|a| {
                let rest = a.strip_prefix("At state ").unwrap();
                rest.split_once(':').unwrap().0.to_owned()
            })
            .collect();
        states
            .into_iter()
            .map(|name| {
                let s = STATES[name[1..].parse::<usize>().unwrap()];
                let types: BTreeSet<String> = graph
                    .available_at(s)
                    .iter()
                    .map(|id| format!("T{}", pool.iter().position(|p| p == id).unwrap()))
                    .collect();
                (name, json!(types))
            })
            .collect::<serde_json::Map<_, _>>()
    });
    FLAGS.with(|f| f.set((0, 0)));
    json!({ "builds": builds, "available": available })
}
#[test]
fn shared_data_flow_graphs() {
    let shared = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../shared-tests");
    let input = std::env::var_os("DATA_FLOW_GRAPH_CORPUS")
        .map(PathBuf::from)
        .unwrap_or_else(|| shared.join("build-verdicts/corpus.json"));
    let cases: Value = serde_json::from_slice(&std::fs::read(input).unwrap()).unwrap();
    if let Some(output) = std::env::var_os("DATA_FLOW_GRAPH_OUTPUT") {
        let results: serde_json::Map<_, _> = cases
            .as_array()
            .unwrap()
            .iter()
            .map(|c| (c["id"].as_str().unwrap().to_owned(), graph_result(c)))
            .collect();
        std::fs::write(output, serde_json::to_vec(&results).unwrap()).unwrap();
        return;
    }
    let expected: Value = serde_json::from_slice(
        &std::fs::read(shared.join("data-flow-graph/expected.json")).unwrap(),
    )
    .unwrap();
    let mut compared = 0;
    let mut mismatches = Vec::new();
    for c in cases.as_array().unwrap() {
        let id = c["id"].as_str().unwrap();
        let actual = graph_result(c);
        assert_eq!(
            actual["builds"], expected[id]["builds"],
            "{id}: probe build verdict"
        );
        // Rust exposes the graph only for a successful build.
        if actual["builds"] == json!(true) {
            compared += 1;
            if actual["available"] != expected[id]["available"] {
                mismatches.push(format!(
                    "{id}: got {} want {}",
                    actual["available"], expected[id]["available"]
                ));
            }
        }
    }
    eprintln!(
        "Data-flow graphs: {compared} compared, {} mismatches",
        mismatches.len()
    );
    assert!(mismatches.is_empty(), "{}", mismatches.join("\n"));
}
