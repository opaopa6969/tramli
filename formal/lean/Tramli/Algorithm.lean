import Tramli.Model

namespace Tramli

/-- `none` is an unreached marker; `some key` is a candidate guarantee.
Removing a marker discovers a state; removing a key weakens its guarantees. -/
abbrev Fact (n k : Nat) := Fin n × Option (Fin k)
abbrev Facts (n k : Nat) := List (Fact n k)

def reached (a : Facts n k) (s : Fin n) : Prop := (s, none) ∉ a

def available (a : Facts n k) (s : Fin n) : Context k :=
  fun x => (s, some x) ∈ a

/-- Initial top element: all states unreached, all keys possible. -/
def top (n k : Nat) : Facts n k :=
  (List.finRange n).flatMap fun s =>
    (s, none) :: (List.finRange k).map (fun x => (s, some x))

theorem top_length (n k : Nat) : (top n k).length = n * (k + 1) := by
  simp [top, List.length_flatMap, List.map_const', List.sum_replicate_nat]

/-- The boundary condition and intersection of all incoming contributions.
The unreached marker is removed when any incoming source is reached. -/
def Allowed (m : Flow n k) (a : Facts n k) (f : Fact n k) : Prop :=
  (f.1 = m.initial → match f.2 with
    | none => False
    | some x => x ∈ m.initiallyAvailable) ∧
  (∀ e ∈ m.edges, e.target = f.1 → reached a e.source → match f.2 with
    | none => False
    | some x => transfer m e (available a e.source) x)

instance (m : Flow n k) (a : Facts n k) (f : Fact n k) :
    Decidable (Allowed m a f) := by
  unfold Allowed reached transfer afterGuard beforeGuard available
  set_option synthInstance.maxSize 512 in
    cases f.2 <;> infer_instance

/-- One simultaneous relaxation sweep. Filtering implements intersection,
never replacement by the newest incoming set. All downstream edges are
re-evaluated after a change; this is a fair, full-sweep schedule rather than DFS. -/
def sweep (m : Flow n k) (a : Facts n k) : Facts n k :=
  a.filter (fun f => decide (Allowed m a f))

/-- A key survives exactly when it was already guaranteed and every reached
incoming edge still supplies it. This is the statewise intersection equation. -/
theorem sweep_available_iff (m : Flow n k) (a : Facts n k) (s : Fin n) (x : Fin k) :
    available (sweep m a) s x ↔ available a s x ∧
      (s = m.initial → x ∈ m.initiallyAvailable) ∧
      ∀ e ∈ m.edges, e.target = s → reached a e.source →
        transfer m e (available a e.source) x := by
  constructor
  · intro h
    obtain ⟨hm, ha⟩ := List.mem_filter.mp h
    have hb : Allowed m a (s, some x) := of_decide_eq_true ha
    exact ⟨hm, hb⟩
  · rintro ⟨hm, ha⟩
    have hb : Allowed m a (s, some x) := ha
    exact List.mem_filter.mpr ⟨hm, decide_eq_true hb⟩

/-- The corrected revisit rule: intersection is unchanged exactly when the
existing set is contained in the incoming set (the reverse test is #155). -/
theorem intersection_unchanged_iff (existing incoming : List (Fin k)) :
    existing.filter (fun x => decide (x ∈ incoming)) = existing ↔
      ∀ x ∈ existing, x ∈ incoming := by
  simp [List.filter_eq_self]

theorem sweep_unchanged_iff (m : Flow n k) (a : Facts n k) :
    sweep m a = a ↔ ∀ f ∈ a, Allowed m a f := by
  simp [sweep, List.filter_eq_self]

theorem sweep_length_le (m : Flow n k) (a : Facts n k) :
    (sweep m a).length ≤ a.length := List.length_filter_le _ _

theorem sweep_eq_of_not_shorter (m : Flow n k) (a : Facts n k)
    (h : ¬ (sweep m a).length < a.length) : sweep m a = a := by
  have he : (sweep m a).length = a.length := by
    have := sweep_length_le m a
    omega
  apply List.filter_eq_self.mpr
  exact List.length_filter_eq_length_iff.mp he

/-- Total fixpoint iteration, with no fuel cutoff: every recursive call deletes
at least one fact. The natural-number measure is at most n * (k + 1) initially. -/
def stabilize (m : Flow n k) (a : Facts n k) : Facts n k :=
  if _h : (sweep m a).length < a.length then stabilize m (sweep m a) else a
termination_by a.length

theorem stabilize_fixed (m : Flow n k) (a : Facts n k) :
    sweep m (stabilize m a) = stabilize m a := by
  unfold stabilize
  split
  · exact stabilize_fixed m (sweep m a)
  · exact sweep_eq_of_not_shorter m a ‹_›
termination_by a.length

def Contracts (m : Flow n k) (a : Facts n k) : Prop :=
  ∀ e ∈ m.edges, reached a e.source → Requirements m e (available a e.source)

instance (m : Flow n k) (a : Facts n k) (e : Edge n k) :
    Decidable (Requirements m e (available a e.source)) := by
  unfold Requirements afterGuard beforeGuard available
  set_option synthInstance.maxSize 256 in
    infer_instance

instance (a : Facts n k) (s : Fin n) : Decidable (reached a s) :=
  inferInstanceAs (Decidable ((s, none) ∉ a))

instance (m : Flow n k) (a : Facts n k) : Decidable (Contracts m a) := by
  unfold Contracts
  infer_instance

/-- None reports missing requirements; some returns the computed assignment.
Only requirements are checked here: closure is proved from stabilization. -/
def check (m : Flow n k) : Option (Facts n k) :=
  let a := stabilize m (top n k)
  if Contracts m a then some a else none

theorem fixed_initial_reached (h : sweep m a = a) : reached a m.initial := by
  intro hm
  exact ((sweep_unchanged_iff m a).mp h _ hm).1 rfl

theorem fixed_initial_available (h : sweep m a = a) :
    Subset (available a m.initial) (fun x => x ∈ m.initiallyAvailable) := by
  intro x hx
  exact ((sweep_unchanged_iff m a).mp h _ hx).1 rfl

theorem fixed_edge_closed (h : sweep m a = a) (he : e ∈ m.edges)
    (hr : reached a e.source) :
    reached a e.target ∧ Subset (available a e.target) (transfer m e (available a e.source)) := by
  constructor
  · intro hm
    exact ((sweep_unchanged_iff m a).mp h _ hm).2 e he rfl hr
  · intro x hx
    exact ((sweep_unchanged_iff m a).mp h _ hx).2 e he rfl hr

theorem algorithm_success_implies_invariant (h : check m = some a) :
    LocalInvariant m (reached a) (available a) := by
  simp only [check] at h
  split at h
  · cases h
    have hf := stabilize_fixed m (top _ _)
    exact ⟨fixed_initial_reached hf, fixed_initial_available hf,
      fun e he hr => fixed_edge_closed hf he hr, ‹Contracts _ _›⟩
  · contradiction

theorem algorithm_soundness (h : check m = some a) (trace : Trace m path s c)
    (he : e ∈ m.edges) (hs : e.source = s) : Requirements m e c :=
  local_invariant_soundness (algorithm_success_implies_invariant h) trace he hs

end Tramli
