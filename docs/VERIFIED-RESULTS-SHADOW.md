# Verified Results — attestation shadow

The delivery policy remains unchanged: result reuse and impact skipping are disabled. This phase establishes an actual trusted evidence transport without provisioning long-lived signing keys.

The separate main-only workflow runs the existing axis-pals-rules legacy task in a network-disabled read-only container, with a dedicated writable evidence mount, no repository credentials, and no install step. It resolves and records an immutable image digest, container config, Node binary and version, kernel and workflow contract. The archive includes the app, shared and scripts directories, and package manifests. This is a controlled experiment; the container alone does not prove determinism or eliminate all host inputs. The whole Git tree is conservatively bound, so unrelated changes invalidate an exact-tree match. Timing, browser and non-hermetic tests remain ineligible.

A separate main-only signing job checks same-run source metadata and actual success, creates a receipt and uses GitHub OIDC artifact attestation. A read-only verification job requires the exact workflow certificate identity, main source ref, exact source commit and hosted runner, then independently checks the evidence digest, task, tree, environment and receipt flags. The signature is provenance, not an assertion of complete test coverage. PRs run secret-free unit tests and same-repository PRs also exercise the offline task; they never sign. No data is accepted by the delivery gate; no reuse can occur even when verification succeeds.

Next: confirm real main signing and verification, validate rejection of changed inputs and cross-run provenance, evaluate which expensive hermetic tasks are eligible, then separately design and approve dependency-scoped input fingerprints. Do not enable reuse from this shadow workflow. For historical reuse the verifier must use independently trusted source and environment values, not values supplied only by the receipt artifact.

Workflow: .github/workflows/verified-results-shadow.yml. Existing Ed25519 verifier remains unchanged.
