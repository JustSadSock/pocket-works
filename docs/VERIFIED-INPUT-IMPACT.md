# Verified Inputs / Impact — shadow phase

This is an advisory input identity experiment, not a cache or a replacement for the QA planner. It covers the single isolated Axis Pals CPU receipt pilot only.

The comparison uses immutable Git commits, scopes all files visible in the receipt execution archive (entire app, shared, scripts, package manifests), and includes the workflow contract. File additions, deletions, mode changes, blob identity and paths matter. It compares the current PR base with the actual checked-out merge commit. Unknown task, missing input, gitlink, symlink or archive attribute rules fail closed. No result is reused. The whole-tree receipt verifier remains unchanged; a scoped match is not equivalent to a signed result match. A future version must prove the actual mounted source bytes and external execution inputs, including deterministic environment, and independently verify the signed successful prior result.

The workflow executes on its implementation PR and opt-in ci-canary PRs with relevant paths, has only read permission, and reports candidates for analysis. It never changes the original plan, skips tasks, or decides the delivery verdict. No historical success is claimed. Do not widen eligibility without a separate sandbox and dependency audit.
