/// Hierarchical state specification.
#[derive(Debug, Clone)]
pub struct HierarchicalStateSpec {
    pub name: String,
    pub initial: bool,
    pub terminal: bool,
    pub entry_produces: Vec<String>,
    pub exit_produces: Vec<String>,
    pub children: Vec<HierarchicalStateSpec>,
}

impl HierarchicalStateSpec {
    pub fn new(name: &str, initial: bool, terminal: bool) -> Self {
        Self {
            name: name.to_string(),
            initial,
            terminal,
            entry_produces: Vec::new(),
            exit_produces: Vec::new(),
            children: Vec::new(),
        }
    }
}

/// Hierarchical transition specification.
#[derive(Debug, Clone)]
pub struct HierarchicalTransitionSpec {
    pub from: String,
    pub to: String,
    pub trigger: String,
    pub requires: Vec<String>,
    pub produces: Vec<String>,
}

impl HierarchicalTransitionSpec {
    pub fn new(from: &str, to: &str, trigger: &str) -> Self {
        Self {
            from: from.to_string(),
            to: to.to_string(),
            trigger: trigger.to_string(),
            requires: Vec::new(),
            produces: Vec::new(),
        }
    }
}

/// Hierarchical flow specification.
#[derive(Debug, Clone)]
pub struct HierarchicalFlowSpec {
    pub flow_name: String,
    pub enum_name: String,
    pub root_states: Vec<HierarchicalStateSpec>,
    pub transitions: Vec<HierarchicalTransitionSpec>,
}

impl HierarchicalFlowSpec {
    pub fn new(flow_name: &str, enum_name: &str) -> Self {
        Self {
            flow_name: flow_name.to_string(),
            enum_name: enum_name.to_string(),
            root_states: Vec::new(),
            transitions: Vec::new(),
        }
    }
}

/// Entry/exit compiler — synthesizes transitions from hierarchical specs.
pub struct EntryExitCompiler;

impl EntryExitCompiler {
    pub fn synthesize(spec: &HierarchicalFlowSpec) -> Vec<HierarchicalTransitionSpec> {
        let mut generated = Vec::new();
        for state in &spec.root_states {
            Self::walk(state, &mut generated, None);
        }
        generated
    }

    fn walk(state: &HierarchicalStateSpec, out: &mut Vec<HierarchicalTransitionSpec>, parent: Option<&str>) {
        if !state.entry_produces.is_empty() {
            let from = parent.map(|p| p.to_string())
                .unwrap_or_else(|| format!("{}__ENTRY_START", state.name));
            let mut t = HierarchicalTransitionSpec::new(&from, &state.name, &format!("__entry__{}", state.name));
            t.produces = state.entry_produces.clone();
            out.push(t);
        }
        if !state.exit_produces.is_empty() {
            let mut t = HierarchicalTransitionSpec::new(
                &state.name,
                &format!("{}__EXIT_END", state.name),
                &format!("__exit__{}", state.name),
            );
            t.produces = state.exit_produces.clone();
            out.push(t);
        }
        for child in &state.children {
            Self::walk(child, out, Some(&state.name));
        }
    }
}

/// Hierarchy code generator — generates Rust source from hierarchical specs.
pub struct HierarchyCodeGenerator;

impl HierarchyCodeGenerator {
    pub fn generate_enum_source(spec: &HierarchicalFlowSpec) -> String {
        let mut flat = Vec::new();
        Self::flatten(&spec.root_states, "", &mut flat);

        let mut lines = Vec::new();
        lines.push(format!("use tramli::FlowState;"));
        lines.push(String::new());
        lines.push(format!("#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]"));
        lines.push(format!("pub enum {} {{", spec.enum_name));
        for (name, _, _) in &flat {
            lines.push(format!("    {},", name));
        }
        lines.push("}".to_string());
        lines.push(String::new());
        lines.push(format!("impl FlowState for {} {{", spec.enum_name));
        lines.push("    fn is_terminal(&self) -> bool {".to_string());
        lines.push("        matches!(self,".to_string());
        let terminals: Vec<&str> = flat.iter()
            .filter(|(_, terminal, _)| *terminal)
            .map(|(name, _, _)| name.as_str())
            .collect();
        if terminals.is_empty() {
            lines.push("            _ => false,".to_string());
        } else {
            for (i, t) in terminals.iter().enumerate() {
                let sep = if i + 1 < terminals.len() { " |" } else { "" };
                lines.push(format!("            Self::{}{}", t, sep));
            }
        }
        lines.push("        )".to_string());
        lines.push("    }".to_string());
        lines.push("    fn is_initial(&self) -> bool {".to_string());
        let initials: Vec<&str> = flat.iter()
            .filter(|(_, _, initial)| *initial)
            .map(|(name, _, _)| name.as_str())
            .collect();
        if initials.is_empty() {
            lines.push("        false".to_string());
        } else {
            lines.push("        matches!(self,".to_string());
            for (i, init) in initials.iter().enumerate() {
                let sep = if i + 1 < initials.len() { " |" } else { "" };
                lines.push(format!("            Self::{}{}", init, sep));
            }
            lines.push("        )".to_string());
        }
        lines.push("    }".to_string());
        lines.push(format!("    fn all_states() -> &'static [Self] {{"));
        lines.push(format!("        &["));
        for (name, _, _) in &flat {
            lines.push(format!("            Self::{},", name));
        }
        lines.push("        ]".to_string());
        lines.push("    }".to_string());
        lines.push("}".to_string());

        lines.join("\n")
    }

    pub fn generate_builder_skeleton(spec: &HierarchicalFlowSpec) -> String {
        let mut lines = Vec::new();
        lines.push(format!("use std::sync::Arc;"));
        lines.push(format!("use tramli::{{Builder, FlowDefinition}};"));
        lines.push(String::new());
        lines.push(format!("pub fn build_{}() -> Result<FlowDefinition<{}>, tramli::FlowError> {{", spec.flow_name.to_lowercase(), spec.enum_name));
        lines.push(format!("    let b = Builder::<{}>::new(\"{}\");", spec.enum_name, spec.flow_name));
        for t in &spec.transitions {
            lines.push(format!("    // {}: {} -> {} requires {:?} produces {:?}", t.trigger, t.from, t.to, t.requires, t.produces));
        }
        lines.push("    b.build()".to_string());
        lines.push("}".to_string());
        lines.join("\n")
    }

    fn flatten(states: &[HierarchicalStateSpec], prefix: &str, out: &mut Vec<(String, bool, bool)>) {
        for state in states {
            let flat = if prefix.is_empty() {
                state.name.to_uppercase()
            } else {
                format!("{}_{}", prefix, state.name.to_uppercase())
            };
            out.push((flat.clone(), state.terminal, state.initial));
            Self::flatten(&state.children, &flat, out);
        }
    }
}
