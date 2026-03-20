"""SQLite database connection and migrations"""
import sqlite3
import logging
import os
from pathlib import Path
from typing import Optional, Dict, Any, List
from contextlib import contextmanager
import json

logger = logging.getLogger(__name__)

DB_PATH = "room_data/mechmap.sqlite"

def ensure_data_directory():
    """Ensure the room_data directory exists"""
    Path("room_data").mkdir(exist_ok=True)

def get_db_connection() -> sqlite3.Connection:
    """Get a database connection"""
    ensure_data_directory()
    conn = sqlite3.connect(DB_PATH, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    return conn

@contextmanager
def db_transaction():
    """Context manager for database transactions"""
    conn = get_db_connection()
    try:
        yield conn
        conn.commit()
    except Exception as e:
        conn.rollback()
        logger.error(f"Database transaction failed: {e}")
        raise
    finally:
        conn.close()

def init_database():
    """Initialize database schema"""
    conn = get_db_connection()
    try:
        cursor = conn.cursor()
        
        # Users table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS users (
                username TEXT PRIMARY KEY,
                password_hash TEXT NOT NULL,
                created_at REAL NOT NULL,
                last_login REAL,
                is_admin INTEGER NOT NULL DEFAULT 0
            )
        """)
        
        # Tokens table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS tokens (
                token TEXT PRIMARY KEY,
                username TEXT NOT NULL,
                created_at REAL NOT NULL,
                expires_at REAL,
                FOREIGN KEY (username) REFERENCES users(username) ON DELETE CASCADE
            )
        """)
        
        # Rooms table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS rooms (
                room_id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                owner_username TEXT,
                has_password INTEGER NOT NULL DEFAULT 0,
                password_hash TEXT,
                created_at REAL NOT NULL,
                last_activity REAL NOT NULL,
                version INTEGER NOT NULL DEFAULT 1,
                FOREIGN KEY (owner_username) REFERENCES users(username) ON DELETE SET NULL
            )
        """)
        
        # Hexes table (sparse - only non-default colors)
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS hexes (
                room_id TEXT NOT NULL,
                hex_key TEXT NOT NULL,
                fill_color TEXT NOT NULL,
                updated_at REAL NOT NULL,
                updated_by TEXT,
                PRIMARY KEY (room_id, hex_key),
                FOREIGN KEY (room_id) REFERENCES rooms(room_id) ON DELETE CASCADE
            )
        """)
        
        # Lines table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS lines (
                room_id TEXT NOT NULL,
                line_id TEXT PRIMARY KEY,
                payload_json TEXT NOT NULL,
                created_at REAL NOT NULL,
                created_by TEXT,
                FOREIGN KEY (room_id) REFERENCES rooms(room_id) ON DELETE CASCADE
            )
        """)
        
        # Units table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS units (
                room_id TEXT NOT NULL,
                unit_id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                color TEXT NOT NULL,
                hex_key TEXT NOT NULL,
                created_at REAL NOT NULL,
                created_by TEXT,
                moved_at REAL,
                moved_by TEXT,
                FOREIGN KEY (room_id) REFERENCES rooms(room_id) ON DELETE CASCADE
            )
        """)

        def ensure_units_columns() -> None:
            cursor.execute("PRAGMA table_info(units)")
            existing_columns = {row["name"] for row in cursor.fetchall()}

            required_columns: list[tuple[str, str]] = [
                ("icon_path", "TEXT"),
                ("tint_color", "TEXT"),
                ("description", "TEXT"),
                ("parent_unit_id", "TEXT"),
            ]

            for column_name, column_type in required_columns:
                if column_name in existing_columns:
                    continue
                cursor.execute(f"ALTER TABLE units ADD COLUMN {column_name} {column_type}")
                logger.info(f"Added units column: {column_name} ({column_type})")

        ensure_units_columns()
        
        # Ensure rooms table has map_filename column
        def ensure_rooms_columns() -> None:
            cursor.execute("PRAGMA table_info(rooms)")
            existing_columns = {row["name"] for row in cursor.fetchall()}
            
            if "map_filename" not in existing_columns:
                cursor.execute("ALTER TABLE rooms ADD COLUMN map_filename TEXT")
                logger.info("Added rooms column: map_filename (TEXT)")
        
        ensure_rooms_columns()
        
        # Indexes for performance
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_hexes_room ON hexes(room_id)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_lines_room ON lines(room_id)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_units_room ON units(room_id)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_tokens_username ON tokens(username)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_tokens_expires ON tokens(expires_at)")
        
        conn.commit()
        logger.info("Database schema initialized")
        
    except Exception as e:
        conn.rollback()
        logger.error(f"Failed to initialize database: {e}")
        raise
    finally:
        conn.close()

def database_exists() -> bool:
    """Check if database file exists and has tables"""
    if not os.path.exists(DB_PATH):
        return False
    # Check if database has tables (not just an empty file)
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table' LIMIT 1")
        has_tables = cursor.fetchone() is not None
        conn.close()
        return has_tables
    except Exception:
        return False

