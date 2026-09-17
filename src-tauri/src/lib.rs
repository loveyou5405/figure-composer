use fs2::FileExt;
use std::{
    fs::{self, File, OpenOptions},
    io::{self, Write},
    path::{Path, PathBuf},
    time::{SystemTime, UNIX_EPOCH},
};

struct SessionTemp {
    path: PathBuf,
    lock: Option<File>,
}

impl SessionTemp {
    fn initialize() -> io::Result<Self> {
        let root = std::env::temp_dir().join("FigureComposer");
        fs::create_dir_all(&root)?;
        cleanup_stale_sessions(&root);

        let timestamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_nanos();
        let path = root.join(format!("session-{}-{timestamp}", std::process::id()));
        fs::create_dir(&path)?;
        for name in ["preview", "thumbnails", "conversion", "export-staging", "cache"] {
            fs::create_dir(path.join(name))?;
        }

        let lock_path = path.join(".session.lock");
        let mut lock = OpenOptions::new()
            .read(true)
            .write(true)
            .create_new(true)
            .open(lock_path)?;
        writeln!(lock, "pid={}", std::process::id())?;
        lock.flush()?;
        lock.lock_exclusive()?;
        Ok(Self { path, lock: Some(lock) })
    }

    fn cleanup(mut self) {
        if let Some(lock) = self.lock.take() {
            let _ = FileExt::unlock(&lock);
            drop(lock);
        }
        if let Err(error) = fs::remove_dir_all(&self.path) {
            eprintln!("Figure Composer could not clean session temp {:?}: {error}", self.path);
        }
    }
}

fn cleanup_stale_sessions(root: &Path) {
    let Ok(entries) = fs::read_dir(root) else { return };
    for entry in entries.flatten() {
        let path = entry.path();
        let is_session_dir = entry.file_type().map(|kind| kind.is_dir()).unwrap_or(false)
            && entry.file_name().to_string_lossy().starts_with("session-");
        if !is_session_dir {
            continue;
        }
        let lock_path = path.join(".session.lock");
        let stale = match OpenOptions::new().read(true).write(true).open(&lock_path) {
            Ok(lock) => match lock.try_lock_exclusive() {
                Ok(()) => {
                    let _ = FileExt::unlock(&lock);
                    true
                }
                Err(_) => false,
            },
            Err(error) if error.kind() == io::ErrorKind::NotFound => true,
            Err(_) => false,
        };
        if stale {
            if let Err(error) = fs::remove_dir_all(&path) {
                eprintln!("Figure Composer left stale session temp {:?}: {error}", path);
            }
        }
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let session = SessionTemp::initialize().expect("Figure Composer session storage could not be initialized");
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .build(tauri::generate_context!())
        .expect("error while building Figure Composer");
    let mut session = Some(session);
    app.run(move |_app_handle, event| {
        if matches!(event, tauri::RunEvent::Exit) {
            if let Some(current) = session.take() {
                current.cleanup();
            }
        }
    });
}
