//! Embed supplied UI runtime assets without publishing documentation or filesystem metadata.

use std::{env, fs, io, path::Path};

fn collect(root: &Path, dir: &Path, entries: &mut Vec<(String, String)>) -> io::Result<()> {
    for entry in fs::read_dir(dir)? {
        let entry = entry?;
        let name = entry.file_name();
        let name = name.to_string_lossy();
        if name.starts_with('.') || name == "Docs" {
            continue;
        }
        let kind = entry.file_type()?;
        let path = entry.path();
        if kind.is_dir() {
            collect(root, &path, entries)?;
        } else if kind.is_file() {
            let mime = match path.extension().and_then(|ext| ext.to_str()) {
                Some("css") => "text/css; charset=utf-8",
                Some("js") => "text/javascript; charset=utf-8",
                Some("woff") => "font/woff",
                Some("woff2") => "font/woff2",
                Some("map") => "application/json",
                _ => continue,
            };
            let url = format!(
                "/assets/{}",
                path.strip_prefix(root)
                    .unwrap()
                    .to_string_lossy()
                    .replace('\\', "/")
            );
            entries.push((
                url,
                format!(
                    "({mime:?}, include_bytes!({:?}).as_slice())",
                    path.canonicalize()?
                ),
            ));
        }
    }
    Ok(())
}

/// Cargo rebuilds the lookup whenever supplied libraries change; only literal embedded paths are served.
fn main() -> io::Result<()> {
    println!("cargo:rerun-if-changed=VERSION");
    let version = fs::read_to_string("VERSION")?;
    let version = version.trim();
    let parts: Vec<_> = version.split('.').collect();
    if parts.len() != 4
        || parts[0].len() != 4
        || parts[1].len() != 2
        || parts[2].len() != 2
        || !(1..=2).contains(&parts[3].len())
        || !parts
            .iter()
            .all(|part| part.bytes().all(|b| b.is_ascii_digit()))
        || !parts[1].parse::<u8>().is_ok_and(|m| (1..=12).contains(&m))
        || !parts[2].parse::<u8>().is_ok_and(|d| (1..=31).contains(&d))
    {
        return Err(io::Error::new(
            io::ErrorKind::InvalidData,
            "VERSION must be YYYY.MM.DD.attempt (attempt 0-99)",
        ));
    }
    println!("cargo:rustc-env=BUNYAN_VERSION={version}");
    println!("cargo:rerun-if-changed=assets/css");
    println!("cargo:rerun-if-changed=assets/js");
    let root = Path::new("assets");
    let mut entries = Vec::new();
    collect(root, &root.join("css"), &mut entries)?;
    collect(root, &root.join("js"), &mut entries)?;
    entries.sort();
    let mut code = String::from("match path {\n");
    for (url, value) in entries {
        code.push_str(&format!("{url:?} => Some({value}),\n"));
    }
    code.push_str("_ => None,\n}\n");
    fs::write(
        Path::new(&env::var_os("OUT_DIR").unwrap()).join("ui_assets.rs"),
        code,
    )
}
