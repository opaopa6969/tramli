import Tramli.Examples
import Lean.Util.CollectAxioms
import Lean.Elab.Command

#print axioms Tramli.local_invariant_soundness
#print axioms Tramli.stabilize_fixed
#print axioms Tramli.algorithm_success_implies_invariant
#print axioms Tramli.algorithm_soundness

/- Audit every declaration in the project namespace, including examples and
termination proofs. Any dependency outside the standard allowlist fails build. -/
run_cmd do
  let allowed := #[`propext, `Classical.choice, `Quot.sound]
  let env ← Lean.getEnv
  for (name, _) in env.constants.toList do
    if (`Tramli).isPrefixOf name then
      for ax in (← Lean.collectAxioms name) do
        unless allowed.contains ax do
          throwError "Unexpected axiom {ax} in {name}"
