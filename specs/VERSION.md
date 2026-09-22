# Figure Composer Version

- Product target: `1.0.0`
- Current checkpoint: `1.3.0`
- Project schema: `0.1.0`
- Specification system: `1.3.0`
- Last updated: 2026-09-22

`1.3.0` is displayed as `v1.3` in the web application, desktop window, and generated Windows preview controls. npm, Cargo, Tauri, launcher/closer filenames and contents, changelog, and immutable release record carry the same release identity; the build fails if they disagree. This feature checkpoint makes `.figproj` a single-file portable project container that embeds exact original image bytes with SHA-256 verification, adds Import Figure, and keeps legacy JSON projects readable. The internal project schema remains `0.1.0`; the portable container version is `1.0.0`.
