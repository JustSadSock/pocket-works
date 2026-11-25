# Cloudflare deployment monitor

Production is Cloudflare Workers Builds, not Pages. GitHub CI success does not establish production publication.

Agents: read the latest completed or running **Cloudflare Deployment Monitor** workflow at https://github.com/JustSadSock/pocket-works/actions/workflows/cloudflare-monitor.yml. The workflow runs on main pushes, every 15 minutes (GitHub scheduling is best effort), and via Run workflow. Use the GitHub job logs for "Read sanitized Cloudflare deployment snapshot". Check observed_at for freshness. A newer main push may need a later snapshot.

The snapshot has separate fields for current traffic-serving deployment, recent builds and builds mapped to the active version IDs. Only claim a SHA is live if active_version_builds maps it to the active version and the traffic percentage is known. A successful build alone is not proof of active deployment. API failures are explicit; don't infer a deployment failed from monitor failure. No raw build logs, environment variables, emails, or tokens are published.

The main-only GitHub environment cloudflare-monitor contains CF_ACCOUNT_ID, CF_READ_TOKEN and CF_WORKER_NAME (pocket-works). Use a user API token with Workers Scripts Read and Workers CI Read; do not grant write permissions or print secrets. The monitor performs GET requests only. If the Builds API rejects the token, retain read-only access and diagnose the scope rather than escalating privileges. No external hosting or deployment commands are used.
