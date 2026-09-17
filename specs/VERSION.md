# Figure Composer Version

- Product target: `1.0.0`
- Current checkpoint: `1.0.0`
- Project schema: `0.1.0`
- Specification system: `1.1.0`
- Last updated: 2026-09-18

`1.0.0` is displayed as `v1.0` in the web application and desktop launcher window. npm, Cargo, and Tauri carry the exact semantic version `1.0.0`; the build fails if they or the release records disagree. The `.figproj` schema remains `0.1.0`. Native Windows/macOS installation and process-lifecycle certification remains a platform release gate because the current host lacks Rust/MSVC and macOS tooling.
