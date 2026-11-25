# Mounted input proof — shadow only

The pilot mounts a read-only tracked archive into the isolated Node container. Git tree IDs alone do not prove what bytes or metadata are visible after extraction. This experiment checks the extracted tree against the exact tracked Git blobs and executable bits, rejects extra/missing inputs, links, nonregular entries, archive attributes and unknown directories, and normalizes file and directory permissions and modification times to a fixed epoch. The digest contains SHA-256 file contents, paths, sizes, modes, mtimes and measured uid/gid. It is checked from inside the same offline container immediately before running the original Axis Pals suite, and on the host after execution. The initially empty writable QA output mount is explicitly excluded.

No production receipt or delivery policy is changed. The existing authenticated pair controller is unchanged and no test is skipped. This is an independent PR so the ongoing cross-commit CI is not cancelled. The next integration must bind the measured mounted digest to signed receipts, check the actual historical input digest, and retain fail-closed environment verification. Inode, ctime, clock, randomness, CPU and other observable host/runtime inputs are not eliminated by this experiment; only separately audited deterministic tasks can ever become eligible. A matching fingerprint is not proof of deterministic behavior.

The dedicated read-only PR workflow exercises the real mount and original test plus adversarial Git fixture tests. No credentials, new secrets, or signing permission are provided.

## Signed v2 integration

The main-only receipt workflow now measures the actual mount before execution, confirms the digest inside the offline container and remeasures the source after execution. The signed source includes the mount digest and counts. Historical v1 receipts are still readable for audit but only two v2 receipts with matching mounted digests, scoped Git inputs and environment can become potential matches. No delivery authorization or test skipping is enabled.
