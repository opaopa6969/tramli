import Std

namespace Tramli

inductive Kind where
  | auto | external | branch
  deriving DecidableEq, Repr

inductive Outcome where
  | normal | onError | onStepError
  deriving DecidableEq, Repr

/-- One normal transition, with one record per branch target. Empty contracts
represent absent guards, processors, or branch decision functions. -/
structure Transition (n k : Nat) where
  source : Fin n
  target : Fin n
  kind : Kind := .auto
  guardRequires : List (Fin k) := []
  guardProduces : List (Fin k) := []
  processorRequires : List (Fin k) := []
  processorProduces : List (Fin k) := []
  branchRequires : List (Fin k) := []
  deriving DecidableEq, Repr

structure Edge (n k : Nat) extends Transition n k where
  outcome : Outcome := .normal
  deriving DecidableEq, Repr

inductive ErrorKind where
  | onError | onStepError
  deriving DecidableEq, Repr

structure ErrorRoute (n : Nat) where
  source : Fin n
  target : Fin n
  kind : ErrorKind
  deriving DecidableEq, Repr

/-- Error edges are state-level: they execute no component and add no data. -/
def ErrorRoute.edge (r : ErrorRoute n) : Edge n k :=
  { source := r.source, target := r.target,
    outcome := match r.kind with | .onError => .onError | .onStepError => .onStepError }

structure Flow (n k : Nat) where
  initial : Fin n
  initiallyAvailable : List (Fin k) := []
  externallyProvided : List (Fin k) := []
  terminal : List (Fin n) := []
  transitions : List (Transition n k)
  errors : List (ErrorRoute n) := []

/-- Every declared error route is included for every non-terminal source with
an outgoing transition, even when that transition has no processor (#157). -/
def Flow.active (m : Flow n k) (s : Fin n) : Bool :=
  !(m.terminal.contains s) && m.transitions.any (fun t => t.source == s)

def Flow.edges (m : Flow n k) : List (Edge n k) :=
  m.transitions.map (fun t => { toTransition := t }) ++
    (m.errors.filter (fun r => m.active r.source)).map ErrorRoute.edge

theorem error_route_present {m : Flow n k} {r : ErrorRoute n} (hr : r ∈ m.errors) (ha : m.active r.source = true) :
    r.edge ∈ m.edges := by
  exact List.mem_append_right _ (List.mem_map.mpr ⟨r, List.mem_filter.mpr ⟨hr, ha⟩, rfl⟩)

theorem normal_transition_present {m : Flow n k} {t : Transition n k} (ht : t ∈ m.transitions) :
    ({ toTransition := t } : Edge n k) ∈ m.edges := by
  exact List.mem_append_left _ (List.mem_map.mpr ⟨t, ht, rfl⟩)

abbrev Context (k : Nat) := Fin k → Prop

def Subset (a b : Context k) : Prop := ∀ x, a x → b x

def beforeGuard (m : Flow n k) (e : Edge n k) (c : Context k) : Context k :=
  fun x => c x ∨ (e.kind = .external ∧ x ∈ m.externallyProvided)

def afterGuard (m : Flow n k) (e : Edge n k) (c : Context k) : Context k :=
  fun x => beforeGuard m e c x ∨ x ∈ e.guardProduces

/-- Error transfer is exactly the source context: no guard, processor, or
externally-provided additions. This covers processor/branch failure and retry
exhaustion conservatively, without depending on the particular failure stage. -/
def transfer (m : Flow n k) (e : Edge n k) (c : Context k) : Context k :=
  fun x => if e.outcome = .normal then afterGuard m e c x ∨ x ∈ e.processorProduces
    else c x

theorem error_transfer (m : Flow n k) (r : ErrorRoute n) (c : Context k) :
    transfer m r.edge c = c := by
  funext x
  cases h : r.kind <;> simp [transfer, ErrorRoute.edge, h]

/-- Error routing itself invokes no guard, branch, or processor. The contracts
of every attempted normal transition are checked separately at the source. -/
def Requirements (m : Flow n k) (e : Edge n k) (c : Context k) : Prop :=
  if e.outcome = .normal then
    (∀ x ∈ e.guardRequires, beforeGuard m e c x) ∧
    (∀ x ∈ e.branchRequires, afterGuard m e c x) ∧
    (∀ x ∈ e.processorRequires, afterGuard m e c x)
  else True

theorem beforeGuard_mono (h : Subset a b) :
    Subset (beforeGuard m e a) (beforeGuard m e b) := by
  intro x hx
  exact hx.elim (fun ha => Or.inl (h x ha)) Or.inr

theorem afterGuard_mono (h : Subset a b) :
    Subset (afterGuard m e a) (afterGuard m e b) := by
  intro x hx
  exact hx.elim (fun ha => Or.inl (beforeGuard_mono h x ha)) Or.inr

theorem transfer_mono (h : Subset a b) :
    Subset (transfer m e a) (transfer m e b) := by
  intro x
  unfold transfer
  split
  · intro hx
    exact hx.elim (fun ha => Or.inl (afterGuard_mono h x ha)) Or.inr
  · exact h x

theorem requirements_mono (h : Subset a b) (hr : Requirements m e a) :
    Requirements m e b := by
  unfold Requirements at *
  split at hr
  · simp only [if_pos ‹e.outcome = .normal›]
    exact ⟨fun x hx => beforeGuard_mono h x (hr.1 x hx),
      fun x hx => afterGuard_mono h x (hr.2.1 x hx),
      fun x hx => afterGuard_mono h x (hr.2.2 x hx)⟩
  · simp only [if_neg ‹e.outcome ≠ .normal›]

/-- Requirements are deliberately not a premise of execution. `transfer` is
an exact computation of guaranteed keys along the trace. Actual runtime
contexts may contain additional keys, including external input on an error.
The step premise permits those extras but never relies on them. -/
inductive Trace (m : Flow n k) : List (Edge n k) → Fin n → Context k → Prop where
  | start (c) (initial : Subset (fun x => x ∈ m.initiallyAvailable) c) :
      Trace m [] m.initial c
  | step {path c} (e) (edge : e ∈ m.edges) (prior : Trace m path e.source c)
      (next) (outputs : Subset (transfer m e c) next) :
      Trace m (path ++ [e]) e.target next

/-- Unreachable states need no contracts. -/
structure LocalInvariant (m : Flow n k) (reachable : Fin n → Prop)
    (available : Fin n → Context k) : Prop where
  initial_reachable : reachable m.initial
  initial_available : Subset (available m.initial) (fun x => x ∈ m.initiallyAvailable)
  edge_closed : ∀ e ∈ m.edges, reachable e.source →
    reachable e.target ∧ Subset (available e.target) (transfer m e (available e.source))
  requirements : ∀ e ∈ m.edges, reachable e.source → Requirements m e (available e.source)

theorem trace_invariant (inv : LocalInvariant m reachable available)
    (trace : Trace m path s c) : reachable s ∧ Subset (available s) c := by
  induction trace with
  | start c hi =>
      exact ⟨inv.initial_reachable, fun x hx => hi x (inv.initial_available x hx)⟩
  | step e he _ next outputs ih =>
      obtain ⟨hr, ha⟩ := inv.edge_closed e he ih.1
      exact ⟨hr, fun x hx => outputs x (transfer_mono ih.2 x (ha x hx))⟩

/-- At every finite trace prefix, all possible next guards, branches and
processors have their requirements at their respective evaluation stages. -/
theorem local_invariant_soundness (inv : LocalInvariant m reachable available)
    (trace : Trace m path s c) (he : e ∈ m.edges) (hs : e.source = s) :
    Requirements m e c := by
  subst s
  obtain ⟨hr, ha⟩ := trace_invariant inv trace
  exact requirements_mono ha (inv.requirements e he hr)

end Tramli
