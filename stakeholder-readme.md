# Restaurant Application: Stakeholder Overview

The application runs on Google Kubernetes Engine (GKE), with a public frontend, an internal API, and a MySQL database backed by persistent storage.

## Self-healing capabilities

- Kubernetes restarts failed containers and recreates missing Pods to maintain the configured replica count.
- Startup and liveness probes detect startup failures and unresponsive processes.
- Readiness probes keep unready Pods out of normal Service traffic. Backend readiness also checks database connectivity.
- Persistent storage preserves MySQL data when its Pod is replaced.

Automatic recovery depends on available cluster resources and storage. With one replica per component, recovery can involve a service interruption; self-healing does not guarantee uninterrupted availability.

## Deployment availability

The current implementation uses **rolling updates**, not blue-green deployment. The frontend allows its existing Pod to stop before its replacement starts to fit the learning cluster's limited capacity. Brief downtime is therefore possible.

**Blue-green deployment is a proposed improvement for releases targeting zero downtime.** It would keep the current version serving traffic while a separate new version is deployed and validated, then switch traffic to the new version. This requires additional capacity, compatible database changes, handling of in-flight requests, and tested traffic switching and rollback.

Blue-green deployment and zero-downtime releases are not implemented or verified in the current configuration.

## Sensitive information

- Database passwords, the administrator password, and the token-signing key are supplied through Kubernetes Secrets.
- Credentials are configured at runtime rather than embedded in application code or Docker images.
- Local credential files, `.env` and `k8s/secret.yaml`, are excluded by `.gitignore` and are not currently tracked by Git.
- The shared example files contain no real credentials.

**Security policy: live secrets must never be committed or pushed to GitHub.** Git ignore rules support this policy but do not prevent forced commits or prove that repository history has never contained secrets.
