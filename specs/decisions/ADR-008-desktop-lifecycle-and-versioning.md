# ADR-008: Desktop Lifecycle and Version Identity

- Status: Accepted
- Date: 2026-09-18

## Context

The desktop release must launch and terminate like a normal application, protect dirty work, own temporary artifacts without risking user files, recover after crashes, support safe concurrent instances, and keep launcher/web version labels synchronized with a rollback record.

## Decision

Bundle the Vite production output directly inside Tauri with no production localhost server or sidecar. Intercept native close requests in the frontend for Save/Discard/Cancel and use forced window destruction only after the decision succeeds. At native startup, create one application-specific session directory and retain an exclusive lock file; clean only unlocked stale session directories. On Tauri `RunEvent::Exit`, unlock and remove the exact current directory.

Keep disposable TEMP, persistent recovery, and persistent settings as separate storage classes. Use `package.json` as the web-visible version source, mirror its exact semantic version in Cargo/Tauri, and enforce agreement through a pre-build script plus changelog/version-history records.

## Consequences

Multiple instances are safe because each has its own path and live lock. Crashes may leave TEMP, but later startup can distinguish it from active sessions. No shutdown path deletes user sources, exports, or projects. A version bump that omits desktop metadata or release history fails the production build. Native lifecycle behavior still requires packaged Windows/macOS verification.
