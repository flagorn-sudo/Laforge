#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use serde::{Deserialize, Serialize};
use std::net::{SocketAddr, TcpStream, ToSocketAddrs};
use std::process::Command;
use std::time::Duration;

#[derive(Debug, Deserialize)]
struct SFTPConfig {
    host: String,
    port: u16,
    username: String,
    password: String,
    #[serde(rename = "remotePath")]
    remote_path: String,
    passive: Option<bool>,
    protocol: Option<String>,
    #[serde(rename = "acceptInvalidCerts")]
    accept_invalid_certs: Option<bool>,
}

#[derive(Debug, Serialize)]
struct FileEntry {
    name: String,
    is_dir: bool,
    size: u64,
}

fn resolve_addr(host: &str, port: u16) -> Result<SocketAddr, String> {
    let addr_str = format!("{}:{}", host, port);
    addr_str
        .to_socket_addrs()
        .map_err(|e| format!("DNS resolution failed: {}", e))?
        .next()
        .ok_or_else(|| "No address found".to_string())
}

#[tauri::command]
fn open_in_finder(path: String) -> Result<(), String> {
    Command::new("open")
        .arg(&path)
        .spawn()
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn sftp_test_connection(config: SFTPConfig) -> Result<bool, String> {
    let protocol = config.protocol.as_deref().unwrap_or("ftp");

    match protocol {
        "sftp" => test_sftp_connection(&config),
        "ftp" | "ftps" => test_ftp_connection(&config),
        _ => Err(format!("Unknown protocol: {}", protocol)),
    }
}

fn test_sftp_connection(config: &SFTPConfig) -> Result<bool, String> {
    let addr = resolve_addr(&config.host, config.port)?;

    let tcp = TcpStream::connect_timeout(&addr, Duration::from_secs(10))
        .map_err(|e| format!("Connection failed: {}", e))?;

    tcp.set_read_timeout(Some(Duration::from_secs(30)))
        .map_err(|e| format!("Failed to set timeout: {}", e))?;

    let mut sess = ssh2::Session::new().map_err(|e| format!("Failed to create session: {}", e))?;
    sess.set_tcp_stream(tcp);
    sess.handshake()
        .map_err(|e| format!("SSH handshake failed: {}", e))?;

    sess.userauth_password(&config.username, &config.password)
        .map_err(|e| format!("Authentication failed: {}", e))?;

    if sess.authenticated() {
        Ok(true)
    } else {
        Err("Authentication failed".to_string())
    }
}

fn test_ftp_connection(config: &SFTPConfig) -> Result<bool, String> {
    let addr = resolve_addr(&config.host, config.port)?;
    let passive = config.passive.unwrap_or(true);

    let mut ftp = suppaftp::FtpStream::connect_timeout(addr, Duration::from_secs(10))
        .map_err(|e| format!("FTP connection failed: {}", e))?;

    ftp.login(&config.username, &config.password)
        .map_err(|e| format!("FTP login failed: {}", e))?;

    if passive {
        ftp.set_mode(suppaftp::Mode::Passive);
    } else {
        ftp.set_mode(suppaftp::Mode::Active);
    }

    let _ = ftp.quit();
    Ok(true)
}

#[tauri::command]
fn sftp_list_files(config: SFTPConfig, path: String) -> Result<Vec<String>, String> {
    let protocol = config.protocol.as_deref().unwrap_or("ftp");

    match protocol {
        "sftp" => list_sftp_files(&config, &path),
        "ftp" | "ftps" => list_ftp_files(&config, &path),
        _ => Err(format!("Unknown protocol: {}", protocol)),
    }
}

fn list_sftp_files(config: &SFTPConfig, path: &str) -> Result<Vec<String>, String> {
    let addr = resolve_addr(&config.host, config.port)?;

    let tcp = TcpStream::connect_timeout(&addr, Duration::from_secs(10))
        .map_err(|e| format!("Connection failed: {}", e))?;

    let mut sess = ssh2::Session::new().map_err(|e| format!("Failed to create session: {}", e))?;
    sess.set_tcp_stream(tcp);
    sess.handshake()
        .map_err(|e| format!("SSH handshake failed: {}", e))?;
    sess.userauth_password(&config.username, &config.password)
        .map_err(|e| format!("Authentication failed: {}", e))?;

    let sftp = sess
        .sftp()
        .map_err(|e| format!("Failed to open SFTP channel: {}", e))?;

    let mut entries = Vec::new();
    for entry in sftp
        .readdir(std::path::Path::new(path))
        .map_err(|e| format!("Failed to read directory: {}", e))?
    {
        let (path_buf, stat) = entry;
        if let Some(name) = path_buf.file_name() {
            let name_str = name.to_string_lossy().to_string();
            if stat.is_dir() && !name_str.starts_with('.') {
                entries.push(name_str);
            }
        }
    }

    entries.sort();
    Ok(entries)
}

fn list_ftp_files(config: &SFTPConfig, path: &str) -> Result<Vec<String>, String> {
    let addr = resolve_addr(&config.host, config.port)?;
    let passive = config.passive.unwrap_or(true);

    let mut ftp = suppaftp::FtpStream::connect_timeout(addr, Duration::from_secs(10))
        .map_err(|e| format!("FTP connection failed: {}", e))?;

    ftp.login(&config.username, &config.password)
        .map_err(|e| format!("FTP login failed: {}", e))?;

    if passive {
        ftp.set_mode(suppaftp::Mode::Passive);
    } else {
        ftp.set_mode(suppaftp::Mode::Active);
    }

    let entries = ftp
        .nlst(Some(path))
        .map_err(|e| format!("Failed to list directory: {}", e))?;

    let _ = ftp.quit();

    filter_directory_entries(entries)
}

fn filter_directory_entries(entries: Vec<String>) -> Result<Vec<String>, String> {
    let mut dirs: Vec<String> = entries
        .into_iter()
        .filter_map(|entry| {
            let name = entry.split('/').last().unwrap_or(&entry).to_string();
            // Consider entries without extensions as potential directories
            if !name.starts_with('.') && !name.contains('.') {
                Some(name)
            } else {
                None
            }
        })
        .collect();

    dirs.sort();
    dirs.dedup();
    Ok(dirs)
}

#[tauri::command]
fn save_password(key: String, password: String) -> Result<(), String> {
    let entry = keyring::Entry::new("forge-app", &key).map_err(|e| format!("Keyring error: {}", e))?;
    entry
        .set_password(&password)
        .map_err(|e| format!("Failed to save password: {}", e))?;
    Ok(())
}

#[tauri::command]
fn get_password(key: String) -> Result<String, String> {
    let entry = keyring::Entry::new("forge-app", &key).map_err(|e| format!("Keyring error: {}", e))?;
    entry
        .get_password()
        .map_err(|e| format!("Failed to get password: {}", e))
}

#[tauri::command]
fn delete_password(key: String) -> Result<(), String> {
    let entry = keyring::Entry::new("forge-app", &key).map_err(|e| format!("Keyring error: {}", e))?;
    entry
        .delete_credential()
        .map_err(|e| format!("Failed to delete password: {}", e))?;
    Ok(())
}

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            open_in_finder,
            sftp_test_connection,
            sftp_list_files,
            save_password,
            get_password,
            delete_password
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
