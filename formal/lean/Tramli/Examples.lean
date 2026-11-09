import Tramli.Algorithm

namespace Tramli.Examples

-- These examples are reduced and checked by the kernel, not native evaluation.
set_option maxRecDepth 8192
set_option maxHeartbeats 2000000

/-- A narrower second incoming path must invalidate a downstream requirement. -/
def diamond : Flow 4 1 := {
  initial := 0
  transitions := [
    { source := 0, target := 1, kind := .branch, processorProduces := [0] },
    { source := 0, target := 2, kind := .branch },
    { source := 1, target := 2 },
    { source := 2, target := 3, processorRequires := [0] }] }

theorem diamond_rejected : check diamond = none := by decide +kernel
theorem reversed_diamond_rejected :
    check { diamond with transitions := diamond.transitions.reverse } = none := by decide +kernel

/-- There is no processor at the branch source; both error route kinds must
still be checked. The error-only destination requires a missing key (#157). -/
def branchFailure (kind : ErrorKind) : Flow 3 1 := {
  initial := 0
  transitions := [
    { source := 0, target := 2, kind := .branch },
    { source := 1, target := 2, processorRequires := [0] }]
  errors := [{ source := 0, target := 1, kind }] }

theorem branch_onError_rejected : check (branchFailure .onError) = none := by decide +kernel
theorem branch_onStepError_rejected : check (branchFailure .onStepError) = none := by decide +kernel

/-- External key 0 precedes the guard, guard key 1 precedes the processor,
and processor key 2 is available only on normal completion. -/
def externalSuccess : Flow 3 3 := {
  initial := 0
  externallyProvided := [0]
  transitions := [
    { source := 0, target := 1, kind := .external, guardRequires := [0],
      guardProduces := [1], processorRequires := [1], processorProduces := [2] },
    { source := 1, target := 2, branchRequires := [0, 1, 2], kind := .branch }] }

theorem external_stages_accepted : (check externalSuccess).isSome = true := by decide +kernel

def missingExternal : Flow 3 3 := { externalSuccess with externallyProvided := [] }
theorem external_contract_required : check missingExternal = none := by decide +kernel

/-- The error destination cannot rely on external input, guard output, or
processor output. Its sole guaranteed input is the source state's set. -/
def externalFailure (key : Fin 3) (kind : ErrorKind) : Flow 4 3 := {
  initial := 0
  externallyProvided := [0]
  transitions := [
    { source := 0, target := 1, kind := .external, guardProduces := [1],
      processorRequires := [1], processorProduces := [2] },
    { source := 2, target := 3, processorRequires := [key] }]
  errors := [{ source := 0, target := 2, kind }] }

theorem failure_drops_external : check (externalFailure 0 .onError) = none := by decide +kernel
theorem failure_drops_guard : check (externalFailure 1 .onError) = none := by decide +kernel
theorem failure_drops_processor : check (externalFailure 2 .onStepError) = none := by decide +kernel

def retryExhaustion : Flow 3 1 := {
  initial := 0
  transitions := [
    { source := 0, target := 2, kind := .external, guardProduces := [0] },
    { source := 1, target := 2, processorRequires := [0] }]
  errors := [{ source := 0, target := 1, kind := .onError }] }

theorem retry_exhaustion_rejected : check retryExhaustion = none := by decide +kernel

/-- Cycles terminate, including when a revisit supplies a strict superset. -/
def cycle : Flow 2 1 := {
  initial := 0
  transitions := [
    { source := 0, target := 1, kind := .external, processorProduces := [0] },
    { source := 1, target := 0, kind := .external, processorRequires := [0] }] }

theorem cycle_accepted : (check cycle).isSome = true := by decide +kernel

def cycleMissing : Flow 2 1 := { cycle with transitions :=
  { source := 0, target := 1, kind := .external, guardRequires := [0] } :: cycle.transitions }
theorem cycle_does_not_supply_initial_data : check cycleMissing = none := by decide +kernel

def safeError : Flow 3 1 := { (branchFailure .onStepError) with initiallyAvailable := [0] }
theorem initial_data_survives_failure : (check safeError).isSome = true := by decide +kernel

/-- The unreached marker is distinct from a reached state with an empty set. -/
def unreachable : Flow 3 1 := {
  initial := 0
  transitions := [{ source := 1, target := 2, processorRequires := [0] }] }
theorem unreachable_requirements_ignored : (check unreachable).isSome = true := by decide +kernel

def terminalSource : Flow 3 1 := { (branchFailure .onError) with terminal := [0] }
theorem terminal_error_edge_not_generated :
    (terminalSource.edges.filter (fun e => e.outcome != .normal)).isEmpty = true := by decide +kernel

def noOutgoing : Flow 2 1 := {
  initial := 0, transitions := [], errors := [{ source := 0, target := 1, kind := .onStepError }] }
theorem no_outgoing_error_edge_not_generated : noOutgoing.edges = [] := by decide +kernel

-- Direct regression of the subset direction, including incomparable sets.
example : ([0, 1] : List (Fin 3)).filter (fun x => decide (x ∈ ([0] : List (Fin 3)))) = [0] := by decide +kernel
example : ([0] : List (Fin 3)).filter (fun x => decide (x ∈ ([0, 1] : List (Fin 3)))) = [0] := by decide +kernel
example : ([0, 1] : List (Fin 3)).filter (fun x => decide (x ∈ ([0, 2] : List (Fin 3)))) = [0] := by decide +kernel

end Tramli.Examples
