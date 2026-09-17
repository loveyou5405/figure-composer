# Figure Composer Version

- Product target: `1.0.0`
- Current checkpoint: `1.0.1`
- Project schema: `0.1.0`
- Specification system: `1.1.0`
- Last updated: 2026-09-18

`1.0.1` is displayed as `v1.0.1` in the web application, desktop window, and generated Windows preview controls. npm, Cargo, Tauri, launcher/closer filenames and contents, changelog, and immutable release record carry the same release identity; the build fails if they disagree. The `.figproj` schema remains `0.1.0`. Native Windows/macOS installation and process-lifecycle certification remains a platform release gate because the current host lacks Rust/MSVC and macOS tooling.
