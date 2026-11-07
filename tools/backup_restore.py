#!/usr/bin/env python3
"""Database backup and restore utility for PostgreSQL.

Reads database credentials from .env in repository root or backend/,
with command-line argument overrides. Supports custom binary format
(pg_dump/pg_restore) and plain text SQL (psql).
"""

import argparse
import datetime
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys

REPO_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_BACKUP_DIR = REPO_ROOT / "backups"


def parse_env_file(path: Path) -> dict[str, str]:
    """Parse a Java properties-style or standard .env file."""
    values = {}
    if not path.is_file():
        return values
    try:
        content = path.read_text(encoding="utf-8")
    except Exception:
        return values

    for line in content.splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        if "=" in line:
            key, val = line.split("=", 1)
            key = key.strip()
            val = val.strip()
            # Remove optional surrounding quotes
            if len(val) >= 2 and (
                (val.startswith('"') and val.endswith('"'))
                or (val.startswith("'") and val.endswith("'"))
            ):
                val = val[1:-1]
            values[key] = val
    return values


def load_db_config() -> dict[str, str]:
    """Load DB configuration from .env or OS environment."""
    config = {
        "host": "localhost",
        "port": "5432",
        "dbname": "bluemoon_db",
        "username": "postgres",
        "password": "",
    }

    # Search candidate .env locations
    candidates = [
        REPO_ROOT / ".env",
        REPO_ROOT / "backend" / ".env",
        Path.cwd() / ".env",
    ]
    for env_path in candidates:
        if env_path.is_file():
            env_vars = parse_env_file(env_path)
            if "DB_HOST" in env_vars:
                config["host"] = env_vars["DB_HOST"]
            if "DB_PORT" in env_vars:
                config["port"] = env_vars["DB_PORT"]
            if "DB_NAME" in env_vars:
                config["dbname"] = env_vars["DB_NAME"]
            if "DB_USERNAME" in env_vars:
                config["username"] = env_vars["DB_USERNAME"]
            if "DB_PASSWORD" in env_vars:
                config["password"] = env_vars["DB_PASSWORD"]
            break

    # OS environment overrides .env
    if os.environ.get("DB_HOST"):
        config["host"] = os.environ["DB_HOST"]
    if os.environ.get("DB_PORT"):
        config["port"] = os.environ["DB_PORT"]
    if os.environ.get("DB_NAME"):
        config["dbname"] = os.environ["DB_NAME"]
    if os.environ.get("DB_USERNAME"):
        config["username"] = os.environ["DB_USERNAME"]
    if os.environ.get("DB_PASSWORD"):
        config["password"] = os.environ["DB_PASSWORD"]
    if os.environ.get("PGPASSWORD"):
        config["password"] = os.environ["PGPASSWORD"]

    return config


def parse_tool_version(tool_path: Path) -> tuple[int, ...]:
    """Extract major and minor version numbers from tool --version."""
    try:
        out = subprocess.check_output([str(tool_path), "--version"], stderr=subprocess.STDOUT, text=True)
        m = re.search(r"(\d+)(?:\.(\d+))?", out)
        if m:
            major = int(m.group(1))
            minor = int(m.group(2)) if m.group(2) else 0
            return (major, minor)
    except Exception:
        pass
    return (0, 0)


def find_pg_tool(tool_name: str, explicit_bin: str | None = None) -> str:
    """Find the best matching PostgreSQL tool in explicit bin, PATH, or standard paths.

    Prefers the newest version available on the system so pg_dump can safely dump
    newer PostgreSQL server versions.
    """
    if not explicit_bin and os.environ.get("PG_BIN_DIR"):
        explicit_bin = os.environ.get("PG_BIN_DIR")

    exe_name = f"{tool_name}.exe" if sys.platform == "win32" else tool_name

    if explicit_bin:
        custom_path = Path(explicit_bin) / exe_name
        if custom_path.is_file():
            return str(custom_path)
        raise FileNotFoundError(f"Could not find '{exe_name}' in specified directory: {explicit_bin}")

    candidates: list[Path] = []

    # 1. System PATH
    found = shutil.which(tool_name)
    if found:
        candidates.append(Path(found))

    # 2. Check platform-specific standard paths
    search_dirs: list[Path] = []
    if sys.platform == "darwin":
        # Check Homebrew opt and Cellar
        for brew_prefix in [Path("/opt/homebrew"), Path("/usr/local")]:
            opt_dir = brew_prefix / "opt"
            if opt_dir.is_dir():
                for p in opt_dir.glob("postgresql*"):
                    bin_dir = p / "bin"
                    if bin_dir.is_dir():
                        search_dirs.append(bin_dir)
            cellar_dir = brew_prefix / "Cellar"
            if cellar_dir.is_dir():
                for p in cellar_dir.glob("postgresql*/*"):
                    bin_dir = p / "bin"
                    if bin_dir.is_dir():
                        search_dirs.append(bin_dir)
            search_dirs.append(brew_prefix / "bin")

        pg_app = Path("/Library/PostgreSQL")
        if pg_app.is_dir():
            for v_dir in pg_app.iterdir():
                bin_dir = v_dir / "bin"
                if bin_dir.is_dir():
                    search_dirs.append(bin_dir)

    elif sys.platform == "win32":
        for program_files in [
            os.environ.get("ProgramFiles", r"C:\Program Files"),
            os.environ.get("ProgramFiles(x86)", r"C:\Program Files (x86)"),
        ]:
            pg_dir = Path(program_files) / "PostgreSQL"
            if pg_dir.is_dir():
                for version_dir in pg_dir.iterdir():
                    bin_dir = version_dir / "bin"
                    if bin_dir.is_dir():
                        search_dirs.append(bin_dir)

    else:  # Linux
        search_dirs.extend([
            Path("/usr/bin"),
            Path("/usr/local/bin"),
        ])
        pg_lib = Path("/usr/lib/postgresql")
        if pg_lib.is_dir():
            for v_dir in pg_lib.iterdir():
                bin_dir = v_dir / "bin"
                if bin_dir.is_dir():
                    search_dirs.append(bin_dir)

    for sd in search_dirs:
        candidate = sd / exe_name
        if candidate.is_file() and candidate not in candidates:
            candidates.append(candidate)

    if not candidates:
        raise FileNotFoundError(
            f"Could not find '{tool_name}' executable in PATH or standard locations.\n"
            f"Please install PostgreSQL client tools or specify the directory using --pg-bin."
        )

    # Sort candidates by parsed version descending (prefer newest client tools)
    candidates.sort(key=lambda p: parse_tool_version(p), reverse=True)
    return str(candidates[0])


def format_size(bytes_num: int) -> str:
    """Format bytes into human-readable size."""
    for unit in ["B", "KB", "MB", "GB"]:
        if bytes_num < 1024.0:
            return f"{bytes_num:3.1f} {unit}"
        bytes_num /= 1024.0
    return f"{bytes_num:.1f} TB"


def is_custom_dump(file_path: Path) -> bool:
    """Detect if file is a PostgreSQL custom archive format."""
    try:
        with open(file_path, "rb") as f:
            header = f.read(5)
            return header == b"PGDMP"
    except Exception:
        return False


def get_backup_env(password: str) -> dict[str, str]:
    """Build environment dict with PGPASSWORD set."""
    env = os.environ.copy()
    if password:
        env["PGPASSWORD"] = password
    return env


def cmd_backup(args: argparse.Namespace, config: dict[str, str]) -> int:
    """Execute database backup."""
    host = args.host or config["host"]
    port = str(args.port or config["port"])
    dbname = args.dbname or config["dbname"]
    user = args.user or config["username"]
    password = args.password if args.password is not None else config["password"]

    pg_dump = find_pg_tool("pg_dump", args.pg_bin)

    # Determine backup output path
    now = datetime.datetime.now()
    timestamp = now.strftime("%Y%m%d_%H%M%S")
    fmt = args.format.lower()

    ext_map = {
        "custom": ".dump",
        "c": ".dump",
        "plain": ".sql",
        "p": ".sql",
        "tar": ".tar",
        "t": ".tar",
        "directory": "",
        "d": "",
    }
    ext = ext_map.get(fmt, ".dump")

    if args.output:
        out_path = Path(args.output).resolve()
        if out_path.is_dir() or (fmt in ("directory", "d") and not out_path.suffix):
            out_path = out_path / f"{dbname}_{timestamp}{ext}"
    else:
        out_dir = DEFAULT_BACKUP_DIR
        out_dir.mkdir(parents=True, exist_ok=True)
        out_path = out_dir / f"{dbname}_{timestamp}{ext}"

    out_path.parent.mkdir(parents=True, exist_ok=True)

    print(f"==> Backing up PostgreSQL database")
    print(f"    Host:     {host}:{port}")
    print(f"    Database: {dbname}")
    print(f"    User:     {user}")
    print(f"    Format:   {fmt}")
    print(f"    pg_dump:  {pg_dump}")
    print(f"    Target:   {out_path}")

    # Build pg_dump command
    cmd = [
        pg_dump,
        "-h", host,
        "-p", port,
        "-U", user,
        "-d", dbname,
    ]

    # Format flag
    if fmt in ("custom", "c"):
        cmd.extend(["-F", "c"])
    elif fmt in ("plain", "p"):
        cmd.extend(["-F", "p"])
    elif fmt in ("tar", "t"):
        cmd.extend(["-F", "t"])
    elif fmt in ("directory", "d"):
        cmd.extend(["-F", "d"])

    if args.schema:
        cmd.extend(["-n", args.schema])
    if args.table:
        cmd.extend(["-t", args.table])
    if args.schema_only:
        cmd.append("-s")
    if args.data_only:
        cmd.append("-a")
    if args.verbose:
        cmd.append("-v")

    cmd.extend(["-f", str(out_path)])

    start_time = datetime.datetime.now()
    try:
        res = subprocess.run(cmd, env=get_backup_env(password), check=False)
        duration = (datetime.datetime.now() - start_time).total_seconds()

        if res.returncode != 0:
            print(f"\n[ERROR] pg_dump failed with exit code {res.returncode}", file=sys.stderr)
            return res.returncode

        if out_path.is_file():
            size = format_size(out_path.stat().st_size)
            print(f"\n[SUCCESS] Backup completed in {duration:.2f}s!")
            print(f"          File: {out_path}")
            print(f"          Size: {size}")
        elif out_path.is_dir():
            print(f"\n[SUCCESS] Directory backup completed in {duration:.2f}s: {out_path}")
        return 0

    except Exception as exc:
        print(f"\n[ERROR] Failed to run pg_dump: {exc}", file=sys.stderr)
        return 1


def cmd_restore(args: argparse.Namespace, config: dict[str, str]) -> int:
    """Execute database restore."""
    host = args.host or config["host"]
    port = str(args.port or config["port"])
    dbname = args.dbname or config["dbname"]
    user = args.user or config["username"]
    password = args.password if args.password is not None else config["password"]

    # Locate backup file
    if args.file:
        file_path = Path(args.file).resolve()
    else:
        # Pick latest from default backup dir
        if not DEFAULT_BACKUP_DIR.is_dir():
            print(f"[ERROR] No backup file specified and '{DEFAULT_BACKUP_DIR}' does not exist.", file=sys.stderr)
            return 1
        backups = sorted(
            [p for p in DEFAULT_BACKUP_DIR.iterdir() if p.is_file() and not p.name.startswith(".")],
            key=lambda p: p.stat().st_mtime,
            reverse=True,
        )
        if not backups:
            print(f"[ERROR] No backup files found in '{DEFAULT_BACKUP_DIR}'.", file=sys.stderr)
            return 1
        file_path = backups[0]
        print(f"==> No file specified. Selected latest backup: {file_path.name}")

    if not file_path.exists():
        print(f"[ERROR] Backup file not found: {file_path}", file=sys.stderr)
        return 1

    # Detect format
    is_custom = is_custom_dump(file_path) or file_path.suffix.lower() in (".dump", ".backup")
    fmt_desc = "Custom archive (pg_restore)" if is_custom else "Plain SQL (psql)"

    print(f"\n==> Restore target: {dbname} on {host}:{port}")
    print(f"    Source file:    {file_path} ({format_size(file_path.stat().st_size)})")
    print(f"    Detected type:  {fmt_desc}")

    # Confirmation safety prompt
    if not args.yes:
        print(f"\n[WARNING] Restoring will overwrite existing data in database '{dbname}'!")
        confirm = input(f"Are you sure you want to proceed? [y/N]: ").strip().lower()
        if confirm not in ("y", "yes"):
            print("Restore operation cancelled by user.")
            return 0

    # Ensure database exists if --create-db specified
    if args.create_db:
        psql = find_pg_tool("psql", args.pg_bin)
        check_cmd = [
            psql, "-h", host, "-p", port, "-U", user, "-d", "postgres",
            "-tc", f"SELECT 1 FROM pg_database WHERE datname = '{dbname}'"
        ]
        res = subprocess.run(check_cmd, env=get_backup_env(password), capture_output=True, text=True)
        if "1" not in res.stdout:
            print(f"==> Creating database '{dbname}'...")
            create_cmd = [
                psql, "-h", host, "-p", port, "-U", user, "-d", "postgres",
                "-c", f"CREATE DATABASE \"{dbname}\";"
            ]
            c_res = subprocess.run(create_cmd, env=get_backup_env(password))
            if c_res.returncode != 0:
                print(f"[ERROR] Could not create database '{dbname}'.", file=sys.stderr)
                return c_res.returncode

    start_time = datetime.datetime.now()

    if is_custom:
        pg_restore = find_pg_tool("pg_restore", args.pg_bin)
        print(f"    pg_restore:     {pg_restore}")
        cmd = [
            pg_restore,
            "-h", host,
            "-p", port,
            "-U", user,
            "-d", dbname,
        ]
        if not args.no_clean:
            cmd.extend(["--clean", "--if-exists"])
        if not args.preserve_owner:
            cmd.append("--no-owner")
        if not args.preserve_privileges:
            cmd.append("--no-privileges")
        if args.verbose:
            cmd.append("-v")
        cmd.append(str(file_path))

        try:
            res = subprocess.run(cmd, env=get_backup_env(password))
            duration = (datetime.datetime.now() - start_time).total_seconds()
            # pg_restore exit code 1 can indicate harmless warnings (e.g. drop table if exists)
            if res.returncode in (0, 1):
                print(f"\n[SUCCESS] Restore completed in {duration:.2f}s!")
                return 0
            else:
                print(f"\n[ERROR] pg_restore failed with exit code {res.returncode}", file=sys.stderr)
                return res.returncode
        except Exception as exc:
            print(f"\n[ERROR] Failed to run pg_restore: {exc}", file=sys.stderr)
            return 1
    else:
        # Plain SQL restore via psql
        psql = find_pg_tool("psql", args.pg_bin)
        print(f"    psql:           {psql}")
        cmd = [
            psql,
            "-h", host,
            "-p", port,
            "-U", user,
            "-d", dbname,
            "-f", str(file_path),
        ]
        if args.verbose:
            cmd.append("-a")

        try:
            res = subprocess.run(cmd, env=get_backup_env(password))
            duration = (datetime.datetime.now() - start_time).total_seconds()
            if res.returncode == 0:
                print(f"\n[SUCCESS] SQL restore completed in {duration:.2f}s!")
                return 0
            else:
                print(f"\n[ERROR] psql failed with exit code {res.returncode}", file=sys.stderr)
                return res.returncode
        except Exception as exc:
            print(f"\n[ERROR] Failed to run psql: {exc}", file=sys.stderr)
            return 1


def cmd_list(args: argparse.Namespace) -> int:
    """List available backups."""
    backup_dir = Path(args.dir).resolve() if args.dir else DEFAULT_BACKUP_DIR
    if not backup_dir.is_dir():
        print(f"Backup directory '{backup_dir}' does not exist.")
        return 0

    files = [
        p for p in backup_dir.iterdir()
        if p.is_file() and not p.name.startswith(".")
    ]
    if not files:
        print(f"No backup files found in {backup_dir}")
        return 0

    files.sort(key=lambda p: p.stat().st_mtime, reverse=True)

    print(f"\nBackups in {backup_dir}:\n")
    print(f"{'Filename':<42} {'Type':<12} {'Size':<10} {'Created / Modified':<20}")
    print("-" * 86)
    for f in files:
        stat = f.stat()
        mtime = datetime.datetime.fromtimestamp(stat.st_mtime).strftime("%Y-%m-%d %H:%M:%S")
        size = format_size(stat.st_size)
        ftype = "Custom" if is_custom_dump(f) else "Plain SQL" if f.suffix == ".sql" else f.suffix or "Unknown"
        print(f"{f.name:<42} {ftype:<12} {size:<10} {mtime:<20}")
    print()
    return 0


def build_parser() -> argparse.ArgumentParser:
    """Build command-line parser."""
    parser = argparse.ArgumentParser(
        description="BlueMoon Database Backup and Restore Utility",
        formatter_class=argparse.RawTextHelpFormatter,
    )
    subparsers = parser.add_subparsers(dest="command", required=True)

    # Common connection options
    conn_parent = argparse.ArgumentParser(add_help=False)
    conn_parent.add_argument("-H", "--host", help="Database server host (default: from .env or localhost)")
    conn_parent.add_argument("-p", "--port", help="Database server port (default: from .env or 5432)")
    conn_parent.add_argument("-d", "--dbname", help="Database name (default: from .env or bluemoon_db)")
    conn_parent.add_argument("-U", "--user", help="Database user (default: from .env or postgres)")
    conn_parent.add_argument("-W", "--password", help="Database password (default: from .env)")
    conn_parent.add_argument("--pg-bin", help="Path to PostgreSQL bin directory (containing pg_dump/pg_restore/psql)")
    conn_parent.add_argument("-v", "--verbose", action="store_true", help="Verbose output")

    # Subcommand: backup
    p_backup = subparsers.add_parser("backup", parents=[conn_parent], help="Create a database backup")
    p_backup.add_argument(
        "-o", "--output",
        help="Output file or directory path (default: backups/<dbname>_<timestamp>.dump)",
    )
    p_backup.add_argument(
        "-F", "--format",
        default="custom",
        choices=["custom", "plain", "tar", "directory"],
        help="Backup format: 'custom' (.dump, default), 'plain' (.sql), 'tar', 'directory'",
    )
    p_backup.add_argument("-n", "--schema", help="Dump only the specified schema")
    p_backup.add_argument("-t", "--table", help="Dump only the specified table")
    p_backup.add_argument("-s", "--schema-only", action="store_true", help="Dump only schema/definitions, no data")
    p_backup.add_argument("-a", "--data-only", action="store_true", help="Dump only data, no schema")

    # Subcommand: restore
    p_restore = subparsers.add_parser("restore", parents=[conn_parent], help="Restore database from a backup")
    p_restore.add_argument(
        "file",
        nargs="?",
        help="Path to backup file (.dump or .sql). If omitted, the latest backup in backups/ is used.",
    )
    p_restore.add_argument(
        "-y", "--yes", action="store_true",
        help="Skip confirmation prompt before restoring",
    )
    p_restore.add_argument(
        "--create-db", action="store_true",
        help="Create target database if it does not exist",
    )
    p_restore.add_argument(
        "--no-clean", action="store_true",
        help="Do not clean (drop) database objects before restoring",
    )
    p_restore.add_argument(
        "--preserve-owner", action="store_true",
        help="Preserve original table ownership (default: restore objects without enforcing original owner)",
    )
    p_restore.add_argument(
        "--preserve-privileges", action="store_true",
        help="Preserve access privileges/grants (default: skip privileges)",
    )

    # Subcommand: list
    p_list = subparsers.add_parser("list", help="List available backups in the backups directory")
    p_list.add_argument("--dir", help="Directory containing backups (default: backups/)")

    return parser


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()
    config = load_db_config()

    if args.command == "backup":
        return cmd_backup(args, config)
    elif args.command == "restore":
        return cmd_restore(args, config)
    elif args.command == "list":
        return cmd_list(args)
    else:
        parser.print_help()
        return 1


if __name__ == "__main__":
    sys.exit(main())
