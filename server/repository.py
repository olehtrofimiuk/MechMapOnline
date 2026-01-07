"""Repository layer for database operations"""
import sqlite3
import logging
import asyncio
import json
import os
from typing import Dict, Any, Optional, List
from datetime import datetime, timedelta
from db import get_db_connection, db_transaction, database_exists

logger = logging.getLogger(__name__)

def get_current_time() -> float:
    """Get current time as float (for compatibility with existing code)"""
    return asyncio.get_event_loop().time()

# User operations
def create_user(username: str, password_hash: str, is_admin: bool = False) -> None:
    """Create a new user"""
    with db_transaction() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            INSERT INTO users (username, password_hash, created_at, is_admin)
            VALUES (?, ?, ?, ?)
        """, (username, password_hash, get_current_time(), 1 if is_admin else 0))

def get_user(username: str) -> Optional[Dict[str, Any]]:
    """Get user by username"""
    conn = get_db_connection()
    try:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM users WHERE username = ?", (username,))
        row = cursor.fetchone()
        if row:
            return {
                'username': row['username'],
                'password_hash': row['password_hash'],
                'created_at': row['created_at'],
                'last_login': row['last_login'],
                'is_admin': bool(row['is_admin'])
            }
        return None
    finally:
        conn.close()

def update_user_last_login(username: str) -> None:
    """Update user's last login time"""
    with db_transaction() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            UPDATE users SET last_login = ? WHERE username = ?
        """, (get_current_time(), username))

def get_all_users() -> Dict[str, Dict[str, Any]]:
    """Get all users as a dictionary"""
    conn = get_db_connection()
    try:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM users")
        users = {}
        for row in cursor.fetchall():
            users[row['username']] = {
                'username': row['username'],
                'password_hash': row['password_hash'],
                'created_at': row['created_at'],
                'last_login': row['last_login'],
                'is_admin': bool(row['is_admin'])
            }
        return users
    finally:
        conn.close()

# Token operations
def create_token(token: str, username: str, expires_in_hours: Optional[int] = None) -> None:
    """Create a new token"""
    created_at = get_current_time()
    expires_at = None
    if expires_in_hours:
        expires_at = created_at + (expires_in_hours * 3600)
    
    with db_transaction() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            INSERT INTO tokens (token, username, created_at, expires_at)
            VALUES (?, ?, ?, ?)
        """, (token, username, created_at, expires_at))

def get_token_username(token: str) -> Optional[str]:
    """Get username from token, checking expiration"""
    conn = get_db_connection()
    try:
        cursor = conn.cursor()
        current_time = get_current_time()
        cursor.execute("""
            SELECT username FROM tokens 
            WHERE token = ? AND (expires_at IS NULL OR expires_at > ?)
        """, (token, current_time))
        row = cursor.fetchone()
        return row['username'] if row else None
    finally:
        conn.close()

def delete_token(token: str) -> None:
    """Delete a token"""
    with db_transaction() as conn:
        cursor = conn.cursor()
        cursor.execute("DELETE FROM tokens WHERE token = ?", (token,))

def delete_all_user_tokens(username: str) -> None:
    """Delete all tokens for a user"""
    with db_transaction() as conn:
        cursor = conn.cursor()
        cursor.execute("DELETE FROM tokens WHERE username = ?", (username,))

# Room operations
def create_room(room_id: str, room_name: str, owner_username: Optional[str] = None, 
                password_hash: Optional[str] = None) -> None:
    """Create a new room"""
    current_time = get_current_time()
    with db_transaction() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            INSERT INTO rooms (room_id, name, owner_username, has_password, password_hash, 
                             created_at, last_activity, version)
            VALUES (?, ?, ?, ?, ?, ?, ?, 1)
        """, (room_id, room_name, owner_username, 1 if password_hash else 0, 
              password_hash, current_time, current_time))

def get_room(room_id: str) -> Optional[Dict[str, Any]]:
    """Get room metadata"""
    conn = get_db_connection()
    try:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM rooms WHERE room_id = ?", (room_id,))
        row = cursor.fetchone()
        if row:
            return {
                'room_id': row['room_id'],
                'name': row['name'],
                'owner': row['owner_username'],
                'has_password': bool(row['has_password']),
                'password_hash': row['password_hash'],
                'created_at': row['created_at'],
                'last_activity': row['last_activity'],
                'version': row['version']
            }
        return None
    finally:
        conn.close()

def get_room_state(room_id: str) -> Dict[str, Any]:
    """Get complete room state including hexes, lines, and units"""
    conn = get_db_connection()
    try:
        cursor = conn.cursor()
        
        # Get room metadata
        room = get_room(room_id)
        if not room:
            raise ValueError(f"Room {room_id} not found")
        
        # Get hexes
        cursor.execute("SELECT hex_key, fill_color FROM hexes WHERE room_id = ?", (room_id,))
        hex_data = {}
        for row in cursor.fetchall():
            hex_data[row['hex_key']] = {'fillColor': row['fill_color']}
        
        # Get lines
        cursor.execute("SELECT payload_json FROM lines WHERE room_id = ? ORDER BY created_at", (room_id,))
        lines = []
        for row in cursor.fetchall():
            lines.append(json.loads(row['payload_json']))
        
        # Get units
        cursor.execute("""
            SELECT unit_id, name, color, hex_key, created_by, created_at, moved_by, moved_at
            FROM units WHERE room_id = ? ORDER BY created_at
        """, (room_id,))
        units = []
        for row in cursor.fetchall():
            unit = {
                'id': row['unit_id'],
                'name': row['name'],
                'color': row['color'],
                'hex_key': row['hex_key'],
                'created_by': row['created_by'],
                'created_at': row['created_at']
            }
            if row['moved_by']:
                unit['moved_by'] = row['moved_by']
                unit['moved_at'] = row['moved_at']
            units.append(unit)
        
        return {
            'name': room['name'],
            'hex_data': hex_data,
            'lines': lines,
            'units': units,
            'created_at': room['created_at'],
            'last_activity': room['last_activity'],
            'owner': room['owner'],
            'has_password': room['has_password'],
            'password_hash': room['password_hash'],
            'version': room['version']
        }
    finally:
        conn.close()

def update_room_activity(room_id: str) -> None:
    """Update room's last activity timestamp"""
    with db_transaction() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            UPDATE rooms SET last_activity = ? WHERE room_id = ?
        """, (get_current_time(), room_id))

def increment_room_version(room_id: str) -> int:
    """Increment room version and return new version"""
    with db_transaction() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            UPDATE rooms SET version = version + 1 WHERE room_id = ?
        """, (room_id,))
        cursor.execute("SELECT version FROM rooms WHERE room_id = ?", (room_id,))
        row = cursor.fetchone()
        return row['version'] if row else 1

def delete_room(room_id: str) -> None:
    """Delete a room (cascade deletes hexes, lines, units)"""
    with db_transaction() as conn:
        cursor = conn.cursor()
        cursor.execute("DELETE FROM rooms WHERE room_id = ?", (room_id,))

def get_all_rooms() -> List[Dict[str, Any]]:
    """Get all rooms with metadata"""
    conn = get_db_connection()
    try:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT room_id, name, owner_username, has_password, created_at, last_activity
            FROM rooms ORDER BY last_activity DESC
        """)
        rooms = []
        for row in cursor.fetchall():
            rooms.append({
                'room_id': row['room_id'],
                'name': row['name'],
                'owner': row['owner_username'],
                'has_password': bool(row['has_password']),
                'created_at': row['created_at'],
                'last_activity': row['last_activity']
            })
        return rooms
    finally:
        conn.close()

# Hex operations
def update_hex(room_id: str, hex_key: str, fill_color: str, updated_by: Optional[str] = None) -> None:
    """Update or insert a hex"""
    current_time = get_current_time()
    with db_transaction() as conn:
        cursor = conn.cursor()
        # Delete if setting to default color (sparse storage)
        if fill_color == 'lightgray':
            cursor.execute("DELETE FROM hexes WHERE room_id = ? AND hex_key = ?", (room_id, hex_key))
        else:
            cursor.execute("""
                INSERT INTO hexes (room_id, hex_key, fill_color, updated_at, updated_by)
                VALUES (?, ?, ?, ?, ?)
                ON CONFLICT(room_id, hex_key) DO UPDATE SET
                    fill_color = excluded.fill_color,
                    updated_at = excluded.updated_at,
                    updated_by = excluded.updated_by
            """, (room_id, hex_key, fill_color, current_time, updated_by))

def erase_hex(room_id: str, hex_key: str) -> None:
    """Erase a hex (set to default or delete)"""
    with db_transaction() as conn:
        cursor = conn.cursor()
        cursor.execute("DELETE FROM hexes WHERE room_id = ? AND hex_key = ?", (room_id, hex_key))

# Line operations
def add_line(room_id: str, line_id: str, line_data: Dict[str, Any], created_by: Optional[str] = None) -> None:
    """Add a line"""
    current_time = get_current_time()
    with db_transaction() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            INSERT INTO lines (room_id, line_id, payload_json, created_at, created_by)
            VALUES (?, ?, ?, ?, ?)
        """, (room_id, line_id, json.dumps(line_data), current_time, created_by))

def delete_lines_by_hex(room_id: str, hex_key: str) -> None:
    """Delete all lines connected to a hex"""
    with db_transaction() as conn:
        cursor = conn.cursor()
        # Get all lines for the room
        cursor.execute("SELECT line_id, payload_json FROM lines WHERE room_id = ?", (room_id,))
        lines_to_delete = []
        for row in cursor.fetchall():
            line_data = json.loads(row['payload_json'])
            if (line_data.get('start', {}).get('key') == hex_key or 
                line_data.get('end', {}).get('key') == hex_key):
                lines_to_delete.append(row['line_id'])
        
        # Delete matching lines
        for line_id in lines_to_delete:
            cursor.execute("DELETE FROM lines WHERE line_id = ?", (line_id,))

def get_room_lines(room_id: str) -> List[Dict[str, Any]]:
    """Get all lines for a room"""
    conn = get_db_connection()
    try:
        cursor = conn.cursor()
        cursor.execute("SELECT payload_json FROM lines WHERE room_id = ? ORDER BY created_at", (room_id,))
        return [json.loads(row['payload_json']) for row in cursor.fetchall()]
    finally:
        conn.close()

# Unit operations
def add_unit(room_id: str, unit_id: str, unit_data: Dict[str, Any], created_by: Optional[str] = None) -> None:
    """Add a unit"""
    current_time = get_current_time()
    with db_transaction() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            INSERT INTO units (room_id, unit_id, name, color, hex_key, created_at, created_by)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        """, (room_id, unit_id, unit_data['name'], unit_data['color'], 
              unit_data['hex_key'], current_time, created_by))

def move_unit(room_id: str, unit_id: str, new_hex_key: str, moved_by: Optional[str] = None) -> None:
    """Move a unit to a new hex"""
    current_time = get_current_time()
    with db_transaction() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            UPDATE units SET hex_key = ?, moved_at = ?, moved_by = ?
            WHERE room_id = ? AND unit_id = ?
        """, (new_hex_key, current_time, moved_by, room_id, unit_id))

def delete_unit(room_id: str, unit_id: str) -> None:
    """Delete a unit"""
    with db_transaction() as conn:
        cursor = conn.cursor()
        cursor.execute("DELETE FROM units WHERE room_id = ? AND unit_id = ?", (room_id, unit_id))

def delete_units_by_hex(room_id: str, hex_key: str) -> None:
    """Delete all units on a hex"""
    with db_transaction() as conn:
        cursor = conn.cursor()
        cursor.execute("DELETE FROM units WHERE room_id = ? AND hex_key = ?", (room_id, hex_key))

def replace_room_state(room_id: str, hex_data: Dict[str, Any], lines: List[Dict[str, Any]], 
                      units: List[Dict[str, Any]], updated_by: Optional[str] = None) -> None:
    """Replace entire room state (for bulk imports)"""
    current_time = get_current_time()
    with db_transaction() as conn:
        cursor = conn.cursor()
        
        # Clear existing data
        cursor.execute("DELETE FROM hexes WHERE room_id = ?", (room_id,))
        cursor.execute("DELETE FROM lines WHERE room_id = ?", (room_id,))
        cursor.execute("DELETE FROM units WHERE room_id = ?", (room_id,))
        
        # Insert hexes (sparse - only non-default colors)
        for hex_key, hex_info in hex_data.items():
            fill_color = hex_info.get('fillColor', 'lightgray')
            if fill_color != 'lightgray':
                cursor.execute("""
                    INSERT INTO hexes (room_id, hex_key, fill_color, updated_at, updated_by)
                    VALUES (?, ?, ?, ?, ?)
                """, (room_id, hex_key, fill_color, current_time, updated_by))
        
        # Insert lines
        for idx, line in enumerate(lines):
            line_id = line.get('id') or f"{room_id}_line_{idx}"
            cursor.execute("""
                INSERT INTO lines (room_id, line_id, payload_json, created_at, created_by)
                VALUES (?, ?, ?, ?, ?)
            """, (room_id, line_id, json.dumps(line), current_time, updated_by))
        
        # Insert units
        for unit in units:
            unit_id = unit.get('id') or unit.get('unit_id')
            if not unit_id:
                continue
            cursor.execute("""
                INSERT INTO units (room_id, unit_id, name, color, hex_key, created_at, created_by)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            """, (room_id, unit_id, unit['name'], unit['color'], 
                  unit['hex_key'], current_time, updated_by))

def migrate_json_to_sqlite(rooms_file: str = "room_data/rooms.json", 
                           users_file: str = "room_data/users.json") -> None:
    """Migrate data from JSON files to SQLite database"""
    # Check if we already have data (don't migrate if users exist)
    existing_users = get_all_users()
    if existing_users:
        logger.info(f"Database already has {len(existing_users)} users, skipping migration")
        return
    
    logger.info("Starting migration from JSON to SQLite")
    
    # Migrate users
    if os.path.exists(users_file):
        try:
            with open(users_file, 'r', encoding='utf-8') as f:
                users_data = json.load(f)
            
            for username, user_data in users_data.items():
                create_user(
                    username=username,
                    password_hash=user_data['password_hash'],
                    is_admin=user_data.get('is_admin', False)
                )
                if user_data.get('last_login'):
                    update_user_last_login(username)
            
            logger.info(f"Migrated {len(users_data)} users")
        except Exception as e:
            logger.error(f"Error migrating users: {e}")
    
    # Migrate rooms
    if os.path.exists(rooms_file):
        try:
            with open(rooms_file, 'r', encoding='utf-8') as f:
                rooms_data = json.load(f)
            
            for room_id, room_data in rooms_data.items():
                create_room(
                    room_id=room_id,
                    room_name=room_data['name'],
                    owner_username=room_data.get('owner'),
                    password_hash=room_data.get('password_hash')
                )
                
                # Import hexes
                hex_data = room_data.get('hex_data', {})
                for hex_key, hex_info in hex_data.items():
                    fill_color = hex_info.get('fillColor', 'lightgray')
                    if fill_color != 'lightgray':
                        update_hex(room_id, hex_key, fill_color)
                
                # Import lines
                lines = room_data.get('lines', [])
                for idx, line in enumerate(lines):
                    line_id = line.get('id') or f"{room_id}_line_{idx}"
                    add_line(room_id, line_id, line)
                
                # Import units
                units = room_data.get('units', [])
                for unit in units:
                    unit_id = unit.get('id') or unit.get('unit_id')
                    if unit_id:
                        add_unit(room_id, unit_id, unit, unit.get('created_by'))
                
                # Update activity timestamp
                if room_data.get('last_activity'):
                    with db_transaction() as conn:
                        cursor = conn.cursor()
                        cursor.execute("""
                            UPDATE rooms SET last_activity = ? WHERE room_id = ?
                        """, (room_data['last_activity'], room_id))
            
            logger.info(f"Migrated {len(rooms_data)} rooms")
        except Exception as e:
            logger.error(f"Error migrating rooms: {e}")
    
    logger.info("Migration completed")

