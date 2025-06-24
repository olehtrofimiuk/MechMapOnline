import json
import numpy as np
import logging
import uuid
from typing import Dict, Set, Any, Optional
import asyncio
import socketio
import os
from pathlib import Path
import hashlib
import secrets
from datetime import datetime, timedelta


from fastapi import FastAPI, Request, HTTPException, Depends
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from pydantic import BaseModel

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')

# Room and user management
rooms: Dict[str, Dict[str, Any]] = {}  # room_id -> room_data
user_sessions: Dict[str, Dict[str, Any]] = {}  # sid -> user_data
users_db: Dict[str, Dict[str, Any]] = {}  # username -> user_data
user_tokens: Dict[str, str] = {}  # token -> username
admin_rooms: Dict[str, Dict[str, Any]] = {}  # admin_room_id -> admin_room_data

# File paths
ROOMS_FILE = "room_data/rooms.json"
USERS_FILE = "room_data/users.json"

# Pydantic models for API
class UserRegister(BaseModel):
    username: str
    password: str

class UserLogin(BaseModel):
    username: str
    password: str

class CreateRoomRequest(BaseModel):
    room_name: str
    token: str

def hash_password(password: str) -> str:
    """Hash password with salt"""
    salt = secrets.token_hex(16)
    password_hash = hashlib.pbkdf2_hmac('sha256', password.encode(), salt.encode(), 100000)
    return f"{salt}:{password_hash.hex()}"

def verify_password(password: str, hashed: str) -> bool:
    """Verify password against hash"""
    try:
        salt, password_hash = hashed.split(':')
        new_hash = hashlib.pbkdf2_hmac('sha256', password.encode(), salt.encode(), 100000)
        return password_hash == new_hash.hex()
    except:
        return False

def generate_token() -> str:
    """Generate secure random token"""
    return secrets.token_urlsafe(32)

def get_user_from_token(token: str) -> Optional[str]:
    """Get username from token"""
    return user_tokens.get(token)

def is_admin_user(username: str) -> bool:
    """Check if a user has admin privileges"""
    if not username or username not in users_db:
        return False
    return users_db[username].get('is_admin', False)

def create_admin_room(room_name="Admin Room", owner=None):
    """Create a new admin room with initial state"""
    return {
        'name': room_name,
        'room_toggles': {},  # room_id -> {enabled: bool, room_name: str}
        'users': {},     # sid -> user_info
        'created_at': asyncio.get_event_loop().time(),
        'last_activity': asyncio.get_event_loop().time(),
        'owner': owner,  # username of admin room owner
        'is_admin_room': True
    }

def get_aggregated_room_data(admin_room_id: str) -> Dict[str, Any]:
    """Get aggregated hex_data and lines from enabled rooms for admin room"""
    if admin_room_id not in admin_rooms:
        return {'hex_data': {}, 'lines': [], 'units': []}
    
    admin_room = admin_rooms[admin_room_id]
    aggregated_hex_data = {}
    aggregated_lines = []
    aggregated_units = []
    
    for room_id, toggle_data in admin_room['room_toggles'].items():
        if toggle_data.get('enabled', False) and room_id in rooms:
            room = rooms[room_id]
            
            # Keep original hex keys but add room metadata for layered display
            for hex_key, hex_data in room['hex_data'].items():
                if hex_key not in aggregated_hex_data:
                    # First room to have this hex - create base structure
                    aggregated_hex_data[hex_key] = {
                        'fillColor': hex_data.get('fillColor', 'lightgray'),
                        'rooms': []
                    }
                
                # Add this room's data to the hex
                if hex_data.get('fillColor') and hex_data['fillColor'] != 'lightgray':
                    aggregated_hex_data[hex_key]['rooms'].append({
                        'room_id': room_id,
                        'room_name': room['name'],
                        'fillColor': hex_data['fillColor']
                    })
                    
                    # If this is the first colored hex from any room, use its color as primary
                    if aggregated_hex_data[hex_key]['fillColor'] == 'lightgray':
                        aggregated_hex_data[hex_key]['fillColor'] = hex_data['fillColor']
            
            # Add room information to lines with prefixed keys for conflict resolution
            for line in room['lines']:
                aggregated_line = {
                    **line,
                    'room_id': room_id,
                    'room_name': room['name'],
                    'line_id': f"{room_id}_{line.get('id', 'line')}",  # Add unique line ID
                    'start': {
                        **line['start']
                        # Keep original hex keys for start/end so lines connect properly
                    },
                    'end': {
                        **line['end']
                        # Keep original hex keys for start/end so lines connect properly
                    }
                }
                aggregated_lines.append(aggregated_line)
            
            # Add room information to units with prefixed IDs for conflict resolution
            for unit in room.get('units', []):
                aggregated_unit = {
                    **unit,
                    'room_id': room_id,
                    'room_name': room['name'],
                    'unit_id': f"{room_id}_{unit.get('id', 'unit')}",  # Add unique unit ID
                    'is_read_only': True  # Mark as read-only in admin view
                }
                aggregated_units.append(aggregated_unit)
    
    return {
        'hex_data': aggregated_hex_data,
        'lines': aggregated_lines,
        'units': aggregated_units
    }

def ensure_data_directory():
    """Ensure the room_data directory exists"""
    Path("room_data").mkdir(exist_ok=True)

def save_rooms_to_file():
    """Save current rooms state to JSON file"""
    try:
        ensure_data_directory()
        
        # Prepare rooms data for JSON serialization
        rooms_data = {}
        for room_id, room in rooms.items():
            rooms_data[room_id] = {
                'name': room['name'],
                'hex_data': room['hex_data'],
                'lines': room['lines'],
                'units': room.get('units', []),  # Include units in save
                'created_at': room['created_at'],
                'last_activity': room['last_activity'],
                'owner': room.get('owner'),  # Add owner info
                'has_password': room.get('has_password', False),  # Save password flag
                'password_hash': room.get('password_hash')  # Save password hash
                # Note: we don't save 'users' as they are session-specific
            }
        
        # Write to file
        with open(ROOMS_FILE, 'w', encoding='utf-8') as f:
            json.dump(rooms_data, f, indent=2, ensure_ascii=False)
        
        logging.info(f"Saved {len(rooms_data)} rooms to {ROOMS_FILE}")
        
    except Exception as e:
        logging.error(f"Error saving rooms to file: {e}")

def save_users_to_file():
    """Save users database to JSON file"""
    try:
        ensure_data_directory()
        
        # Write to file
        with open(USERS_FILE, 'w', encoding='utf-8') as f:
            json.dump(users_db, f, indent=2, ensure_ascii=False)
        
        logging.info(f"Saved {len(users_db)} users to {USERS_FILE}")
        
    except Exception as e:
        logging.error(f"Error saving users to file: {e}")

def load_rooms_from_file():
    """Load rooms state from JSON file on startup"""
    try:
        if not os.path.exists(ROOMS_FILE):
            logging.info("No existing rooms file found, starting with empty rooms")
            return
        
        with open(ROOMS_FILE, 'r', encoding='utf-8') as f:
            rooms_data = json.load(f)
        
        # Restore rooms data
        for room_id, room_data in rooms_data.items():
            rooms[room_id] = {
                'name': room_data['name'],
                'hex_data': room_data['hex_data'],
                'lines': room_data['lines'],
                'units': room_data.get('units', []),  # Load units, default to empty list for old saves
                'users': {},  # Start with no active users
                'created_at': room_data['created_at'],
                'last_activity': room_data['last_activity'],
                'owner': room_data.get('owner'),  # Load owner info
                'has_password': room_data.get('has_password', False),  # Backward compatibility
                'password_hash': room_data.get('password_hash')  # Backward compatibility
            }
        
        logging.info(f"Loaded {len(rooms_data)} rooms from {ROOMS_FILE}")
        
    except Exception as e:
        logging.error(f"Error loading rooms from file: {e}")

def load_users_from_file():
    """Load users database from JSON file on startup"""
    try:
        if not os.path.exists(USERS_FILE):
            logging.info("No existing users file found, starting with empty user database")
            return
        
        with open(USERS_FILE, 'r', encoding='utf-8') as f:
            global users_db
            users_db = json.load(f)
        
        logging.info(f"Loaded {len(users_db)} users from {USERS_FILE}")
        
    except Exception as e:
        logging.error(f"Error loading users from file: {e}")

async def periodic_save():
    """Background task to save rooms and users every 10 seconds"""
    while True:
        try:
            await asyncio.sleep(10)  # Wait 10 seconds
            save_rooms_to_file()
            save_users_to_file()
        except Exception as e:
            logging.error(f"Error in periodic save: {e}")

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup code
    logging.info("Startup event")
    ensure_data_directory()
    load_rooms_from_file()
    load_users_from_file()
    
    # Start the periodic save task
    save_task = asyncio.create_task(periodic_save())
    logging.info("Started periodic saving (every 10 seconds)")
    
    yield
    
    # Shutdown code
    logging.info("Shutdown event")
    save_task.cancel()
    try:
        await save_task
    except asyncio.CancelledError:
        pass
    
    # Final save on shutdown
    save_rooms_to_file()
    save_users_to_file()
    logging.info("Final save completed")


app = FastAPI(lifespan=lifespan)

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000", 
        "http://127.0.0.1:3000",
        "http://mechmaponline.fun",
        "https://mechmaponline.fun"
    ],  # React dev server + production domain (without port)
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize templates
templates = Jinja2Templates(directory="templates")

sio=socketio.AsyncServer(cors_allowed_origins='*',async_mode='asgi',ping_timeout=2000,ping_interval=1000)
socket_app = socketio.ASGIApp(sio, socketio_path="/ws/socket.io")
app.mount("/ws", socket_app)


def generate_room_id():
    """Generate a unique 6-character room ID"""
    return str(uuid.uuid4())[:6].upper()

def create_new_room(room_name="Unnamed Room", owner=None, password=None):
    """Create a new room with initial state"""
    room_data = {
        'name': room_name,
        'hex_data': {},  # hex_key -> {fillColor, ...}
        'lines': [],     # list of line objects
        'units': [],     # list of unit objects: {id, name, color, hex_key, created_by}
        'users': {},     # sid -> user_info
        'created_at': asyncio.get_event_loop().time(),
        'last_activity': asyncio.get_event_loop().time(),
        'owner': owner,  # username of room owner
        'has_password': password is not None,  # Flag to indicate if room has password
        'password_hash': hash_password(password) if password else None  # Hashed password
    }
    return room_data

def verify_room_password(room_data: dict, password: str) -> bool:
    """Verify password against room's password hash"""
    if not room_data.get('has_password'):
        return True  # No password required
    
    if not password:
        return False  # Password required but none provided
    
    room_password_hash = room_data.get('password_hash')
    if not room_password_hash:
        return True  # No hash stored (shouldn't happen if has_password is True)
    
    return verify_password(password, room_password_hash)

@sio.on("connect")
async def handle_connect(sid, environ):
    print(f'Client connected: {sid}')
    user_sessions[sid] = {
        'room_id': None,
        'user_name': None,
        'username': None,  # authenticated username
        'is_authenticated': False
    }

@sio.on('disconnect')
async def handle_disconnect(sid):
    print(f'Client disconnected: {sid}')
    
    # Remove user from their room if they were in one
    user_data = user_sessions.get(sid)
    if user_data and user_data['room_id']:
        room_id = user_data['room_id']
        
        if room_id in rooms and sid in rooms[room_id]['users']:
            # Handle regular room disconnect
            del rooms[room_id]['users'][sid]
            
            # Update last activity
            rooms[room_id]['last_activity'] = asyncio.get_event_loop().time()
            
            # Notify other users in the room
            await sio.emit('user_left', {
                'user_name': user_data['user_name'],
                'users_count': len(rooms[room_id]['users'])
            }, room=room_id)
            
            # Note: We no longer delete empty rooms - they persist for later use
            if len(rooms[room_id]['users']) == 0:
                print(f'Room {room_id} ({rooms[room_id]["name"]}) is now empty but preserved')
    
    # Clean up user session
    if sid in user_sessions:
        del user_sessions[sid]

@sio.on('authenticate')
async def handle_authenticate(sid, data):
    """Authenticate user with token"""
    token = data.get('token')
    if not token:
        await sio.emit('auth_error', {'message': 'No token provided'}, room=sid)
        return
    
    username = get_user_from_token(token)
    if username and username in users_db:
        user_sessions[sid]['username'] = username
        user_sessions[sid]['is_authenticated'] = True
        user_sessions[sid]['user_name'] = username  # Use username as display name
        
        await sio.emit('auth_success', {
            'username': username,
            'message': 'Authentication successful'
        }, room=sid)
        
        logging.info(f"User {username} authenticated via socket")
    else:
        await sio.emit('auth_error', {'message': 'Invalid token'}, room=sid)

@sio.on('create_room')
async def handle_create_room(sid, data):
    """Create a new room"""
    user_data = user_sessions.get(sid, {})
    user_name = data.get('user_name', 'Anonymous')
    room_name = data.get('room_name', 'Unnamed Room').strip()
    room_password = data.get('room_password', '').strip() if data.get('room_password') else None
    # Use authenticated username if available, otherwise use provided name
    if user_data.get('is_authenticated'):
        actual_user_name = user_data['username']
        room_owner = user_data['username']
    else:
        actual_user_name = user_name
        room_owner = None  # Anonymous rooms have no owner
    
    # Ensure room name is not empty
    if not room_name:
        room_name = 'Unnamed Room'
    
    room_id = generate_room_id()
    
    # Create regular room
    while room_id in rooms:  # Ensure uniqueness
        room_id = generate_room_id()
    
    # Create room
    rooms[room_id] = create_new_room(room_name, room_owner, room_password)
    
    # Join user to room
    await sio.enter_room(sid, room_id)
    
    # Update user session
    user_sessions[sid]['room_id'] = room_id
    user_sessions[sid]['user_name'] = actual_user_name
    user_sessions[sid]['is_admin_room'] = False
    
    # Add user to room
    rooms[room_id]['users'][sid] = {
        'name': actual_user_name,
        'joined_at': asyncio.get_event_loop().time(),
        'is_authenticated': user_data.get('is_authenticated', False),
        'username': user_data.get('username')  # None for anonymous users
    }
    
    print(f'User {actual_user_name} created and joined room {room_id} ({room_name})')
    
    await sio.emit('room_created', {
        'room_id': room_id,
        'room_name': room_name,
        'user_name': actual_user_name,
        'is_owner': room_owner is not None,
        'hex_data': rooms[room_id]['hex_data'],
        'lines': rooms[room_id]['lines'],
        'units': rooms[room_id].get('units', []),
        'users': list(rooms[room_id]['users'].values())
    }, room=sid)

@sio.on('join_room')
async def handle_join_room(sid, data):
    """Join an existing room"""
    user_data = user_sessions.get(sid, {})
    room_id = data.get('room_id', '').upper()
    user_name = data.get('user_name', 'Anonymous')
    room_password = data.get('room_password', '')
    
    # Use authenticated username if available, otherwise use provided name
    if user_data.get('is_authenticated'):
        actual_user_name = user_data['username']
    else:
        actual_user_name = user_name
    
    # Check if room exists
    if room_id not in rooms:
        await sio.emit('room_error', {
            'message': 'Room not found'
        }, room=sid)
        return
    else:
        # Check room password before joining
        room_data = rooms[room_id]
        if not verify_room_password(room_data, room_password):
            await sio.emit('room_error', {
                'message': 'Invalid room password'
            }, room=sid)
            return
        
        # Join regular room (existing logic)
        # Join user to room
        await sio.enter_room(sid, room_id)
        
        # Update user session
        user_sessions[sid]['room_id'] = room_id
        user_sessions[sid]['user_name'] = actual_user_name
        user_sessions[sid]['is_admin_room'] = False
        
        # Add user to room
        rooms[room_id]['users'][sid] = {
            'name': actual_user_name,
            'joined_at': asyncio.get_event_loop().time(),
            'is_authenticated': user_data.get('is_authenticated', False),
            'username': user_data.get('username')  # None for anonymous users
        }
        
        # Update last activity
        rooms[room_id]['last_activity'] = asyncio.get_event_loop().time()
        
        room_owner = rooms[room_id].get('owner')
        is_owner = room_owner and user_data.get('username') == room_owner
        
        print(f'User {actual_user_name} joined room {room_id} ({rooms[room_id]["name"]})')
        
        # Send current room state to the new user
        await sio.emit('room_joined', {
            'room_id': room_id,
            'room_name': rooms[room_id]['name'],
            'user_name': actual_user_name,
            'is_owner': is_owner,
            'hex_data': rooms[room_id]['hex_data'],
            'lines': rooms[room_id]['lines'],
            'units': rooms[room_id].get('units', []),
            'users': list(rooms[room_id]['users'].values())
        }, room=sid)
        
        # Notify other users in the room
        await sio.emit('user_joined', {
            'user_name': actual_user_name,
            'is_authenticated': user_data.get('is_authenticated', False),
            'users_count': len(rooms[room_id]['users'])
        }, room=room_id, skip_sid=sid)

async def notify_admin_rooms_of_room_update(updated_room_id: str):
    """Notify all admin rooms that have this room enabled"""
    for admin_room_id, admin_room in admin_rooms.items():
        if updated_room_id in admin_room['room_toggles'] and admin_room['room_toggles'][updated_room_id].get('enabled', False):
            # Update hex, line, and unit counts for the updated room
            updated_room = rooms[updated_room_id]
            hex_count = sum(1 for hex_data in updated_room['hex_data'].values() 
                           if hex_data.get('fillColor') and hex_data['fillColor'] != 'lightgray')
            line_count = len(updated_room['lines'])
            unit_count = len(updated_room.get('units', []))
            
            # Update the toggle data with new counts
            admin_room['room_toggles'][updated_room_id].update({
                'hex_count': hex_count,
                'line_count': line_count,
                'unit_count': unit_count
            })
            
            # Get updated aggregated data
            aggregated_data = get_aggregated_room_data(admin_room_id)
            
            # Notify all users in this admin room
            await sio.emit('admin_room_data_updated', {
                'hex_data': aggregated_data['hex_data'],
                'lines': aggregated_data['lines'],
                'units': aggregated_data['units'],
                'room_toggles': admin_room['room_toggles'],
                'updated_room': updated_room_id,
                'updated_room_name': rooms[updated_room_id]['name']
            }, room=admin_room_id)

@sio.on('hex_update')
async def handle_hex_update(sid, data):
    """Handle hex color updates"""
    user_data = user_sessions.get(sid)
    if not user_data or not user_data['room_id']:
        return
    
    # Admin rooms don't allow direct hex updates
    if user_data.get('is_admin_room'):
        await sio.emit('admin_error', {
            'message': 'Cannot edit markers in admin room - markers are read-only here'
        }, room=sid)
        return
    
    room_id = user_data['room_id']
    if room_id not in rooms:
        return
    
    hex_key = data.get('hex_key')
    fill_color = data.get('fill_color')
    
    # Update room state
    if hex_key not in rooms[room_id]['hex_data']:
        rooms[room_id]['hex_data'][hex_key] = {}
    rooms[room_id]['hex_data'][hex_key]['fillColor'] = fill_color
    
    # Update last activity
    rooms[room_id]['last_activity'] = asyncio.get_event_loop().time()
    
    # Broadcast to all users in the room except sender
    await sio.emit('hex_updated', {
        'hex_key': hex_key,
        'fill_color': fill_color,
        'user_name': user_data['user_name']
    }, room=room_id, skip_sid=sid)
    
    # Notify admin rooms that have this room enabled
    await notify_admin_rooms_of_room_update(room_id)

@sio.on('line_add')
async def handle_line_add(sid, data):
    """Handle new line creation"""
    user_data = user_sessions.get(sid)
    if not user_data or not user_data['room_id']:
        return
    
    # Admin rooms don't allow direct line additions
    if user_data.get('is_admin_room'):
        await sio.emit('admin_error', {
            'message': 'Cannot add lines in admin room - lines are read-only here'
        }, room=sid)
        return
    
    room_id = user_data['room_id']
    if room_id not in rooms:
        return
    
    line_data = data.get('line')
    
    # Add line to room state
    rooms[room_id]['lines'].append(line_data)
    
    # Update last activity
    rooms[room_id]['last_activity'] = asyncio.get_event_loop().time()
    
    # Broadcast to all users in the room except sender
    await sio.emit('line_added', {
        'line': line_data,
        'user_name': user_data['user_name']
    }, room=room_id, skip_sid=sid)
    
    # Notify admin rooms that have this room enabled
    await notify_admin_rooms_of_room_update(room_id)

@sio.on('hex_erase')
async def handle_hex_erase(sid, data):
    """Handle hex and associated lines erasing"""
    user_data = user_sessions.get(sid)
    if not user_data or not user_data['room_id']:
        return
    
    # Admin rooms don't allow direct hex erasing
    if user_data.get('is_admin_room'):
        await sio.emit('admin_error', {
            'message': 'Cannot erase markers in admin room - markers are read-only here'
        }, room=sid)
        return
    
    room_id = user_data['room_id']
    if room_id not in rooms:
        return
    
    hex_key = data.get('hex_key')
    
    # Reset hex color in room state
    if hex_key in rooms[room_id]['hex_data']:
        rooms[room_id]['hex_data'][hex_key]['fillColor'] = 'lightgray'
    
    # Remove lines connected to this hex
    rooms[room_id]['lines'] = [
        line for line in rooms[room_id]['lines'] 
        if line['start']['key'] != hex_key and line['end']['key'] != hex_key
    ]
    
    # Remove units on this hex
    if 'units' not in rooms[room_id]:
        rooms[room_id]['units'] = []
    rooms[room_id]['units'] = [
        unit for unit in rooms[room_id]['units'] 
        if unit['hex_key'] != hex_key
    ]
    
    # Update last activity
    rooms[room_id]['last_activity'] = asyncio.get_event_loop().time()
    
    # Broadcast to all users in the room except sender
    await sio.emit('hex_erased', {
        'hex_key': hex_key,
        'lines': rooms[room_id]['lines'],
        'units': rooms[room_id]['units'],
        'user_name': user_data['user_name']
    }, room=room_id, skip_sid=sid)
    
    # Notify admin rooms that have this room enabled
    await notify_admin_rooms_of_room_update(room_id)

@sio.on('cursor_update')
async def handle_cursor_update(sid, data):
    """Handle cursor position updates for showing other users' cursors"""
    user_data = user_sessions.get(sid)
    if not user_data or not user_data['room_id']:
        return
    
    room_id = user_data['room_id']
    if room_id not in rooms:
        return
    
    # Broadcast cursor position to other users in the room
    await sio.emit('cursor_moved', {
        'user_name': user_data['user_name'],
        'hex_key': data.get('hex_key'),
        'mode': data.get('mode')
    }, room=room_id, skip_sid=sid)

@sio.on('get_rooms')
async def handle_get_rooms(sid):
    """Get list of available rooms"""
    room_list = []
    current_time = asyncio.get_event_loop().time()
    
    for room_id, room_data in rooms.items():
        # Calculate time since last activity
        time_since_activity = current_time - room_data['last_activity']
        hours_since_activity = time_since_activity / 3600
        
        room_list.append({
            'room_id': room_id,
            'name': room_data['name'],
            'users_count': len(room_data['users']),
            'created_at': room_data['created_at'],
            'last_activity': room_data['last_activity'],
            'hours_since_activity': round(hours_since_activity, 1),
            'is_active': len(room_data['users']) > 0,
            'has_password': room_data.get('has_password', False)
        })
    
    # Sort by last activity (most recent first)
    room_list.sort(key=lambda x: x['last_activity'], reverse=True)
    
    await sio.emit('rooms_list', {'rooms': room_list}, room=sid)

@sio.on('leave_room')
async def handle_leave_room(sid):
    """Handle user leaving a room without disconnecting"""
    user_data = user_sessions.get(sid)
    if not user_data or not user_data['room_id']:
        # User not in a room, just acknowledge
        await sio.emit('room_left', {'success': True}, room=sid)
        return
    
    room_id = user_data['room_id']
    
    if room_id in rooms and sid in rooms[room_id]['users']:
        # Handle leaving regular room
        # Remove user from room
        del rooms[room_id]['users'][sid]
        
        # Update last activity
        rooms[room_id]['last_activity'] = asyncio.get_event_loop().time()
        
        # Leave the socket.io room
        await sio.leave_room(sid, room_id)
        
        # Notify other users in the room
        await sio.emit('user_left', {
            'user_name': user_data['user_name'],
            'users_count': len(rooms[room_id]['users'])
        }, room=room_id)
        
        print(f'User {user_data["user_name"]} left room {room_id} ({rooms[room_id]["name"]})')
        
        # Note: Room persists even if empty
        if len(rooms[room_id]['users']) == 0:
            print(f'Room {room_id} ({rooms[room_id]["name"]}) is now empty but preserved')
    
    # Clear user's room association
    user_sessions[sid]['room_id'] = None
    user_sessions[sid]['is_admin_room'] = False
    
    # Confirm room left to user
    await sio.emit('room_left', {'success': True}, room=sid)

@sio.on('delete_room')
async def handle_delete_room(sid, data):
    """Delete a room (only if user is in the room and it's empty)"""
    user_data = user_sessions.get(sid)
    if not user_data or not user_data['room_id']:
        await sio.emit('room_error', {
            'message': 'You must be in a room to delete it'
        }, room=sid)
        return
    
    room_id = user_data['room_id']
    if room_id not in rooms:
        await sio.emit('room_error', {
            'message': 'Room not found'
        }, room=sid)
        return
    
    # Only allow deletion if room is empty or user is the only one
    if len(rooms[room_id]['users']) > 1:
        await sio.emit('room_error', {
            'message': 'Cannot delete room with other users present'
        }, room=sid)
        return
    
    # Delete the room
    room_name = rooms[room_id]['name']
    del rooms[room_id]
    
    # Remove user from room
    user_sessions[sid]['room_id'] = None
    await sio.leave_room(sid, room_id)
    
    print(f'Room {room_id} ({room_name}) deleted by {user_data["user_name"]}')
    
    await sio.emit('room_deleted', {
        'message': f'Room "{room_name}" has been deleted'
    }, room=sid)

@sio.on('message')
async def handle_message(sid, data):
    print(f'Message from {sid}: {data}')

@sio.on('get_admin_data_for_room')
async def handle_get_admin_data_for_room(sid):
    """Get admin data for current room (for admin users in any room)"""
    user_data = user_sessions.get(sid, {})
    
    # Check if user is authenticated and has admin privileges
    if not user_data.get('is_authenticated') or not is_admin_user(user_data['username']):
        await sio.emit('admin_error', {
            'message': 'Admin privileges required'
        }, room=sid)
        return
    
    # Get current room info
    current_room_id = user_data.get('room_id')
    if not current_room_id or current_room_id not in rooms:
        return
    
    # Get all other rooms for admin panel
    other_rooms = []
    room_toggles = {}
    
    for room_id, room_data in rooms.items():
        if room_id != current_room_id:  # Exclude current room
            # Calculate hex, line, and unit counts for each room
            hex_count = sum(1 for hex_data in room_data['hex_data'].values() 
                           if hex_data.get('fillColor') and hex_data['fillColor'] != 'lightgray')
            line_count = len(room_data['lines'])
            unit_count = len(room_data.get('units', []))
            
            other_rooms.append({
                'id': room_id,
                'name': room_data['name'],
                'hex_count': hex_count,
                'line_count': line_count,
                'unit_count': unit_count
            })
            
            # Initialize room toggle (disabled by default)
            room_toggles[room_id] = {
                'enabled': False,
                'room_name': room_data['name'],
                'hex_count': hex_count,
                'line_count': line_count,
                'unit_count': unit_count
            }
    
    # Send admin data to the user
    await sio.emit('admin_data_updated', {
        'available_rooms': other_rooms,
        'room_toggles': room_toggles
    }, room=sid)

@sio.on('admin_toggle_room')
async def handle_admin_toggle_room(sid, data):
    """Toggle room visibility overlay in current room (for admin users)"""
    user_data = user_sessions.get(sid)
    
    # Check if user is authenticated and has admin privileges
    if not user_data.get('is_authenticated') or not is_admin_user(user_data['username']):
        await sio.emit('admin_error', {
            'message': 'Admin privileges required'
        }, room=sid)
        return
    
    current_room_id = user_data.get('room_id')
    if not current_room_id or current_room_id not in rooms:
        await sio.emit('admin_error', {
            'message': 'Not in a valid room'
        }, room=sid)
        return
    
    target_room_id = data.get('room_id')
    enabled = data.get('enabled', False)
    
    if target_room_id not in rooms:
        await sio.emit('admin_error', {
            'message': 'Target room not found'
        }, room=sid)
        return
    
    # Store the toggle state in user session (per-user toggle state)
    if 'admin_toggles' not in user_sessions[sid]:
        user_sessions[sid]['admin_toggles'] = {}
    
    # Calculate hex, line, and unit counts for the target room
    target_room = rooms[target_room_id]
    hex_count = sum(1 for hex_data in target_room['hex_data'].values() 
                   if hex_data.get('fillColor') and hex_data['fillColor'] != 'lightgray')
    line_count = len(target_room['lines'])
    unit_count = len(target_room.get('units', []))
    
    # Update toggle state
    user_sessions[sid]['admin_toggles'][target_room_id] = {
        'enabled': enabled,
        'room_name': target_room['name'],
        'hex_count': hex_count,
        'line_count': line_count,
        'unit_count': unit_count
    }
    
    # Get overlay data for enabled rooms
    overlay_hex_data = dict(rooms[current_room_id]['hex_data'])
    overlay_lines = list(rooms[current_room_id]['lines'])
    overlay_units = list(rooms[current_room_id].get('units', []))
    
    # Add data from enabled rooms
    for room_id, toggle_data in user_sessions[sid]['admin_toggles'].items():
        if toggle_data.get('enabled', False) and room_id in rooms:
            room = rooms[room_id]
            
            # Overlay hex data (keep original structure but overlay colors)
            for hex_key, hex_data in room['hex_data'].items():
                if hex_data.get('fillColor') and hex_data['fillColor'] != 'lightgray':
                    if hex_key not in overlay_hex_data:
                        overlay_hex_data[hex_key] = {'fillColor': 'lightgray'}
                    
                    # Create layered information
                    if not hasattr(overlay_hex_data[hex_key], 'rooms'):
                        overlay_hex_data[hex_key]['rooms'] = []
                    
                    overlay_hex_data[hex_key]['rooms'] = overlay_hex_data[hex_key].get('rooms', [])
                    overlay_hex_data[hex_key]['rooms'].append({
                        'room_id': room_id,
                        'room_name': room['name'],
                        'fillColor': hex_data['fillColor']
                    })
                    
                    # Use the overlay color as primary if current hex is empty
                    if overlay_hex_data[hex_key]['fillColor'] == 'lightgray':
                        overlay_hex_data[hex_key]['fillColor'] = hex_data['fillColor']
            
            # Add lines with room information
            for line in room['lines']:
                overlay_line = {
                    **line,
                    'room_id': room_id,
                    'room_name': room['name'],
                    'line_id': f"{room_id}_{line.get('id', 'line')}",
                    'overlay': True
                }
                overlay_lines.append(overlay_line)
            
            # Add units with room information
            for unit in room.get('units', []):
                overlay_unit = {
                    **unit,
                    'room_id': room_id,
                    'room_name': room['name'],
                    'unit_id': f"{room_id}_{unit.get('id', 'unit')}",
                    'is_read_only': True,
                    'overlay': True
                }
                overlay_units.append(overlay_unit)
    
    # Send updated overlay data to the admin user
    await sio.emit('admin_room_overlay_updated', {
        'hex_data': overlay_hex_data,
        'lines': overlay_lines,
        'units': overlay_units,
        'room_toggles': user_sessions[sid]['admin_toggles'],
        'toggled_room_name': target_room['name'],
        'enabled': enabled
    }, room=sid)

@app.get("/")
async def read_root(request: Request):
    # Serve the React app's index.html for the root route
    from fastapi.responses import FileResponse
    import os
    
    build_path = os.path.join(os.path.dirname(__file__), "..", "client", "build", "index.html")
    if os.path.exists(build_path):
        return FileResponse(build_path)
    else:
        # Fallback to template if build doesn't exist
        return templates.TemplateResponse(name="index.html", context={"request": request})

@app.post("/api/register")
async def register_user(user_data: UserRegister):
    """Register a new user"""
    try:
        username = user_data.username.strip()
        password = user_data.password
        
        # Validation
        if not username or len(username) < 2:
            raise HTTPException(status_code=400, detail="Username must be at least 2 characters long")
        
        if not password or len(password) < 4:
            raise HTTPException(status_code=400, detail="Password must be at least 4 characters long")
        
        # Check if username already exists
        if username in users_db:
            raise HTTPException(status_code=409, detail="Username already exists")
        
        # Check if this is the first user (make them admin)
        is_first_user = len(users_db) == 0
        
        # Hash password and create user
        password_hash = hash_password(password)
        
        users_db[username] = {
            'username': username,
            'password_hash': password_hash,
            'created_at': asyncio.get_event_loop().time(),
            'last_login': None,
            'is_admin': is_first_user  # First user becomes admin
        }
        
        # Generate token for automatic login
        token = generate_token()
        user_tokens[token] = username
        
        # Save to file
        save_users_to_file()
        
        logging.info(f"New user registered: {username}" + (" (admin)" if is_first_user else ""))
        
        return {
            "message": "User registered successfully" + (" as admin" if is_first_user else ""),
            "username": username,
            "is_admin": is_first_user,
            "token": token
        }
    
    except HTTPException:
        raise
    except Exception as e:
        logging.error(f"Registration error: {e}")
        raise HTTPException(status_code=500, detail="Registration failed")

@app.post("/api/login")
async def login_user(user_data: UserLogin):
    """Login existing user"""
    username = user_data.username.strip()
    password = user_data.password
    
    # Find user (case-insensitive)
    actual_username = None
    for stored_username in users_db.keys():
        if stored_username.lower() == username.lower():
            actual_username = stored_username
            break
    
    if not actual_username:
        raise HTTPException(status_code=401, detail="Invalid username or password")
    
    user = users_db[actual_username]
    
    # Verify password
    if not verify_password(password, user['password_hash']):
        raise HTTPException(status_code=401, detail="Invalid username or password")
    
    # Update last login
    users_db[actual_username]['last_login'] = asyncio.get_event_loop().time()
    
    # Generate token
    token = generate_token()
    user_tokens[token] = actual_username
    
    logging.info(f"User logged in: {actual_username}")
    
    return {
        "success": True,
        "message": "Login successful",
        "token": token,
        "username": actual_username,
        "is_admin": user.get('is_admin', False)
    }

@app.post("/api/logout")
async def logout_user(request: Request):
    """Logout user and invalidate token"""
    try:
        auth_header = request.headers.get('Authorization')
        if not auth_header or not auth_header.startswith('Bearer '):
            raise HTTPException(status_code=401, detail="No valid token provided")
        
        token = auth_header.split(' ')[1]
        username = get_user_from_token(token)
        
        if username and token in user_tokens:
            # Remove token
            del user_tokens[token]
            logging.info(f"User {username} logged out successfully")
        
        return {"message": "Logged out successfully"}
    
    except Exception as e:
        logging.error(f"Logout error: {e}")
        raise HTTPException(status_code=500, detail="Logout failed")

@app.post("/api/promote-admin")
async def promote_to_admin(request: Request):
    """Promote user to admin (requires existing admin or first user)"""
    try:
        auth_header = request.headers.get('Authorization')
        if not auth_header or not auth_header.startswith('Bearer '):
            raise HTTPException(status_code=401, detail="No valid token provided")
        
        token = auth_header.split(' ')[1]
        requesting_username = get_user_from_token(token)
        
        if not requesting_username or requesting_username not in users_db:
            raise HTTPException(status_code=401, detail="Invalid token")
        
        # Allow if requesting user is already admin OR if no admin exists yet
        has_any_admin = any(user.get('is_admin', False) for user in users_db.values())
        if not (is_admin_user(requesting_username) or not has_any_admin):
            raise HTTPException(status_code=403, detail="Admin privileges required")
        
        data = await request.json()
        target_username = data.get('username')
        
        if not target_username or target_username not in users_db:
            raise HTTPException(status_code=404, detail="User not found")
        
        # Promote user to admin
        users_db[target_username]['is_admin'] = True
        save_users_to_file()
        
        logging.info(f"User {target_username} promoted to admin by {requesting_username}")
        
        return {
            "message": f"User {target_username} promoted to admin successfully",
            "username": target_username,
            "is_admin": True
        }
    
    except HTTPException:
        raise
    except Exception as e:
        logging.error(f"Admin promotion error: {e}")
        raise HTTPException(status_code=500, detail="Admin promotion failed")

@app.get("/api/verify-token")
async def verify_token(request: Request):
    """Verify token and return user info"""
    try:
        auth_header = request.headers.get('Authorization')
        if not auth_header or not auth_header.startswith('Bearer '):
            return {"valid": False, "message": "No token provided"}
        
        token = auth_header.split(' ')[1]
        username = get_user_from_token(token)
        
        if username and username in users_db:
            return {
                "valid": True, 
                "username": username,
                "is_admin": users_db[username].get('is_admin', False)
            }
        else:
            return {"valid": False, "message": "Invalid token"}
    
    except Exception as e:
        logging.error(f"Token verification error: {e}")
        return {"valid": False, "message": "Token verification failed"}

@app.get("/api/save-rooms")
async def manual_save_rooms():
    """Manual endpoint to save rooms (for admin use)"""
    try:
        save_rooms_to_file()
        save_users_to_file()
        return {"success": True, "message": f"Saved {len(rooms)} rooms and {len(users_db)} users to file"}
    except Exception as e:
        logging.error(f"Manual save failed: {e}")
        return {"success": False, "message": str(e)}

@app.get("/api/rooms-status")
async def get_rooms_status():
    """Get current rooms status (for admin/debugging)"""
    try:
        current_time = asyncio.get_event_loop().time()
        status = {
            "total_rooms": len(rooms),
            "active_rooms": len([r for r in rooms.values() if len(r['users']) > 0]),
            "total_active_users": sum(len(r['users']) for r in rooms.values()),
            "total_registered_users": len(users_db),
            "rooms": []
        }
        
        for room_id, room_data in rooms.items():
            hours_since_activity = (current_time - room_data['last_activity']) / 3600
            status["rooms"].append({
                "room_id": room_id,
                "name": room_data['name'],
                "owner": room_data.get('owner', 'Anonymous'),
                "users_count": len(room_data['users']),
                "hours_since_activity": round(hours_since_activity, 1),
                "hex_count": len(room_data['hex_data']),
                "lines_count": len(room_data['lines'])
            })
        
        return status
    except Exception as e:
        return {"error": str(e)}

# Mount static files for the React app
try:
    import os
    client_build_path = os.path.join(os.path.dirname(__file__), "..", "client", "build")
    if os.path.exists(client_build_path):
        # Serve React app static files
        app.mount("/static", StaticFiles(directory=os.path.join(client_build_path, "static")), name="static")
        logging.info(f"Serving React app from: {client_build_path}")
    else:
        # Fallback to server static files
        app.mount("/static", StaticFiles(directory="static"), name="static")
        logging.warning("React build not found, serving from server static directory")
except RuntimeError as e:
    logging.error(f"Error mounting static files: {e}")

# Catch-all route for React app (must be at the end)
@app.get("/{full_path:path}")
async def serve_react_app(full_path: str):
    """Serve React app for all non-API routes"""
    from fastapi.responses import FileResponse
    import os
    
    # Skip API routes and WebSocket routes
    if full_path.startswith(("api/", "ws/")):
        raise HTTPException(status_code=404, detail="Not found")
    
    build_path = os.path.join(os.path.dirname(__file__), "..", "client", "build", "index.html")
    if os.path.exists(build_path):
        return FileResponse(build_path)
    else:
        raise HTTPException(status_code=404, detail="React app not found")

@sio.on('unit_add')
async def handle_unit_add(sid, data):
    """Handle new unit creation"""
    user_data = user_sessions.get(sid)
    if not user_data or not user_data['room_id']:
        return
    
    # Admin rooms don't allow direct unit additions
    if user_data.get('is_admin_room'):
        await sio.emit('admin_error', {
            'message': 'Cannot add units in admin room - units are read-only here'
        }, room=sid)
        return
    
    room_id = user_data['room_id']
    if room_id not in rooms:
        return
    
    unit_data = data.get('unit')
    if not unit_data:
        return
    
    # Add unique ID to unit and created_by field
    unit_data['id'] = str(uuid.uuid4())[:8]
    unit_data['created_by'] = user_data['user_name']
    unit_data['created_at'] = asyncio.get_event_loop().time()
    
    # Ensure units array exists in room
    if 'units' not in rooms[room_id]:
        rooms[room_id]['units'] = []
    
    # Add unit to room state
    rooms[room_id]['units'].append(unit_data)
    
    # Update last activity
    rooms[room_id]['last_activity'] = asyncio.get_event_loop().time()
    
    print(f"Unit added to room {room_id}: {unit_data}")
    
    # Broadcast to all users in the room (including sender for confirmation)
    await sio.emit('unit_added', {
        'unit': unit_data,
        'user_name': user_data['user_name']
    }, room=room_id)
    
    # Notify admin rooms that have this room enabled
    await notify_admin_rooms_of_room_update(room_id)

@sio.on('unit_move')
async def handle_unit_move(sid, data):
    """Handle unit movement"""
    user_data = user_sessions.get(sid)
    if not user_data or not user_data['room_id']:
        return
    
    # Admin rooms don't allow direct unit movements
    if user_data.get('is_admin_room'):
        await sio.emit('admin_error', {
            'message': 'Cannot move units in admin room - units are read-only here'
        }, room=sid)
        return
    
    room_id = user_data['room_id']
    if room_id not in rooms:
        return
    
    unit_id = data.get('unit_id')
    new_hex_key = data.get('hex_key')
    
    # Find and update the unit
    if 'units' not in rooms[room_id]:
        rooms[room_id]['units'] = []
    
    for unit in rooms[room_id]['units']:
        if unit['id'] == unit_id:
            unit['hex_key'] = new_hex_key
            unit['moved_by'] = user_data['user_name']
            unit['moved_at'] = asyncio.get_event_loop().time()
            break
    
    # Update last activity
    rooms[room_id]['last_activity'] = asyncio.get_event_loop().time()
    
    # Broadcast to all users in the room except sender
    await sio.emit('unit_moved', {
        'unit_id': unit_id,
        'hex_key': new_hex_key,
        'user_name': user_data['user_name']
    }, room=room_id, skip_sid=sid)
    
    # Notify admin rooms that have this room enabled
    await notify_admin_rooms_of_room_update(room_id)

@sio.on('unit_delete')
async def handle_unit_delete(sid, data):
    """Handle unit deletion"""
    user_data = user_sessions.get(sid)
    if not user_data or not user_data['room_id']:
        return
    
    # Admin rooms don't allow direct unit deletions
    if user_data.get('is_admin_room'):
        await sio.emit('admin_error', {
            'message': 'Cannot delete units in admin room - units are read-only here'
        }, room=sid)
        return
    
    room_id = user_data['room_id']
    if room_id not in rooms:
        return
    
    unit_id = data.get('unit_id')
    
    # Remove the unit
    if 'units' not in rooms[room_id]:
        rooms[room_id]['units'] = []
    
    rooms[room_id]['units'] = [unit for unit in rooms[room_id]['units'] if unit['id'] != unit_id]
    
    # Update last activity
    rooms[room_id]['last_activity'] = asyncio.get_event_loop().time()
    
    # Broadcast to all users in the room except sender
    await sio.emit('unit_deleted', {
        'unit_id': unit_id,
        'user_name': user_data['user_name']
    }, room=room_id, skip_sid=sid)
    
    # Notify admin rooms that have this room enabled
    await notify_admin_rooms_of_room_update(room_id)

@sio.on('admin_delete_room')
async def handle_admin_delete_room(sid, data):
    """Delete a room (admin only - can delete any room)"""
    user_data = user_sessions.get(sid, {})
    
    # Check if user is authenticated and has admin privileges
    if not user_data.get('is_authenticated') or not is_admin_user(user_data['username']):
        await sio.emit('room_error', {
            'message': 'Admin privileges required to delete rooms'
        }, room=sid)
        return
    
    target_room_id = data.get('room_id', '').upper()
    if not target_room_id:
        await sio.emit('room_error', {
            'message': 'Room ID is required'
        }, room=sid)
        return
    
    # Check if room exists
    if target_room_id not in rooms:
        await sio.emit('room_error', {
            'message': 'Room not found'
        }, room=sid)
        return
    
    room_name = rooms[target_room_id]['name']
    
    # Notify all users in the room that it's being deleted
    if len(rooms[target_room_id]['users']) > 0:
        await sio.emit('room_deleted', {
            'message': f'This room has been deleted by an administrator',
            'force_leave': True
        }, room=target_room_id)
        
        # Remove all users from the room
        for user_sid in list(rooms[target_room_id]['users'].keys()):
            if user_sid in user_sessions:
                user_sessions[user_sid]['room_id'] = None
                user_sessions[user_sid]['is_admin_room'] = False
            await sio.leave_room(user_sid, target_room_id)
    
    # Delete the room
    del rooms[target_room_id]
    
    # Update all admin rooms that might have this room in their toggles
    for admin_room_id, admin_room_data in admin_rooms.items():
        if target_room_id in admin_room_data['room_toggles']:
            del admin_room_data['room_toggles'][target_room_id]
            
            # Notify admin room users about the deletion
            aggregated_data = get_aggregated_room_data(admin_room_id)
            await sio.emit('admin_room_data_updated', {
                'hex_data': aggregated_data['hex_data'],
                'lines': aggregated_data['lines'],
                'units': aggregated_data['units'],
                'room_toggles': admin_room_data['room_toggles'],
                'deleted_room_name': room_name
            }, room=admin_room_id)
    
    print(f'Room {target_room_id} ({room_name}) deleted by admin {user_data["username"]}')
    
    # Confirm deletion to the admin
    await sio.emit('room_deleted', {
        'message': f'Room "{room_name}" ({target_room_id}) has been deleted successfully',
        'deleted_room_id': target_room_id,
        'admin_action': True
    }, room=sid)
    
    # Refresh room list for all users by emitting a broadcast signal
    await sio.emit('room_list_refresh', {
        'deleted_room_id': target_room_id,
        'deleted_room_name': room_name
    }, broadcast=True)
