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
        return {'hex_data': {}, 'lines': []}
    
    admin_room = admin_rooms[admin_room_id]
    aggregated_hex_data = {}
    aggregated_lines = []
    
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
    
    return {
        'hex_data': aggregated_hex_data,
        'lines': aggregated_lines
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
                'created_at': room['created_at'],
                'last_activity': room['last_activity'],
                'owner': room.get('owner')  # Add owner info
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
                'users': {},  # Start with no active users
                'created_at': room_data['created_at'],
                'last_activity': room_data['last_activity'],
                'owner': room_data.get('owner')  # Load owner info
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

def create_new_room(room_name="Unnamed Room", owner=None):
    """Create a new room with initial state"""
    return {
        'name': room_name,
        'hex_data': {},  # hex_key -> {fillColor, ...}
        'lines': [],     # list of line objects
        'users': {},     # sid -> user_info
        'created_at': asyncio.get_event_loop().time(),
        'last_activity': asyncio.get_event_loop().time(),
        'owner': owner  # username of room owner
    }

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
        
        if user_data.get('is_admin_room') and room_id in admin_rooms:
            # Handle admin room disconnect
            if sid in admin_rooms[room_id]['users']:
                del admin_rooms[room_id]['users'][sid]
                
                # Update last activity
                admin_rooms[room_id]['last_activity'] = asyncio.get_event_loop().time()
                
                # Notify other users in the admin room
                await sio.emit('user_left', {
                    'user_name': user_data['user_name'],
                    'users_count': len(admin_rooms[room_id]['users'])
                }, room=room_id)
                
                if len(admin_rooms[room_id]['users']) == 0:
                    print(f'Admin room {room_id} ({admin_rooms[room_id]["name"]}) is now empty but preserved')
        elif room_id in rooms and sid in rooms[room_id]['users']:
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
    is_admin_room = data.get('is_admin_room', False)
    
    # Use authenticated username if available, otherwise use provided name
    if user_data.get('is_authenticated'):
        actual_user_name = user_data['username']
        room_owner = user_data['username']
        
        # Check if user is admin for admin room creation
        if is_admin_room and not is_admin_user(actual_user_name):
            await sio.emit('room_error', {
                'message': 'Only administrators can create admin rooms'
            }, room=sid)
            return
    else:
        actual_user_name = user_name
        room_owner = None  # Anonymous rooms have no owner
        
        # Anonymous users cannot create admin rooms
        if is_admin_room:
            await sio.emit('room_error', {
                'message': 'You must be logged in as an administrator to create admin rooms'
            }, room=sid)
            return
    
    # Ensure room name is not empty
    if not room_name:
        room_name = 'Admin Room' if is_admin_room else 'Unnamed Room'
    
    room_id = generate_room_id()
    
    if is_admin_room:
        # Create admin room
        while room_id in admin_rooms:  # Ensure uniqueness
            room_id = generate_room_id()
        
        admin_rooms[room_id] = create_admin_room(room_name, room_owner)
        
        # Join user to admin room
        await sio.enter_room(sid, room_id)
        
        # Update user session
        user_sessions[sid]['room_id'] = room_id
        user_sessions[sid]['user_name'] = actual_user_name
        user_sessions[sid]['is_admin_room'] = True
        
        # Add user to admin room
        admin_rooms[room_id]['users'][sid] = {
            'name': actual_user_name,
            'joined_at': asyncio.get_event_loop().time(),
            'is_authenticated': user_data.get('is_authenticated', False),
            'username': user_data.get('username')
        }
        
        print(f'Admin {actual_user_name} created and joined admin room {room_id} ({room_name})')
        
        # Get aggregated data and available rooms
        aggregated_data = get_aggregated_room_data(room_id)
        regular_rooms = []
        for rid, room in rooms.items():
            # Calculate hex and line counts for each room
            hex_count = sum(1 for hex_data in room['hex_data'].values() 
                           if hex_data.get('fillColor') and hex_data['fillColor'] != 'lightgray')
            line_count = len(room['lines'])
            
            # Initialize or update room toggle data with counts
            if rid not in admin_rooms[room_id]['room_toggles']:
                admin_rooms[room_id]['room_toggles'][rid] = {
                    'enabled': False,
                    'room_name': room['name'],
                    'hex_count': hex_count,
                    'line_count': line_count
                }
            else:
                # Update counts for existing toggle
                admin_rooms[room_id]['room_toggles'][rid].update({
                    'hex_count': hex_count,
                    'line_count': line_count
                })
            
            regular_rooms.append({
                'id': rid,  # Changed from 'room_id' to 'id' to match client expectation
                'name': room['name'],  # Changed from 'room_name' to 'name'
                'hex_count': hex_count,
                'line_count': line_count,
                'enabled': admin_rooms[room_id]['room_toggles'][rid]['enabled']
            })
        
        print(f'Available regular rooms for admin room: {len(regular_rooms)}')
        for room in regular_rooms:
            print(f'  - {room["name"]} ({room["id"]})')
        
        await sio.emit('admin_room_created', {
            'room_id': room_id,
            'room_name': room_name,
            'user_name': actual_user_name,
            'is_owner': True,
            'hex_data': aggregated_data['hex_data'],
            'lines': aggregated_data['lines'],
            'users': list(admin_rooms[room_id]['users'].values()),
            'available_rooms': regular_rooms,
            'room_toggles': admin_rooms[room_id]['room_toggles']
        }, room=sid)
    else:
        # Create regular room (existing logic)
        while room_id in rooms:  # Ensure uniqueness
            room_id = generate_room_id()
        
        # Create room
        rooms[room_id] = create_new_room(room_name, room_owner)
        
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
            'users': list(rooms[room_id]['users'].values())
        }, room=sid)

@sio.on('join_room')
async def handle_join_room(sid, data):
    """Join an existing room"""
    user_data = user_sessions.get(sid, {})
    room_id = data.get('room_id', '').upper()
    user_name = data.get('user_name', 'Anonymous')
    
    # Use authenticated username if available, otherwise use provided name
    if user_data.get('is_authenticated'):
        actual_user_name = user_data['username']
    else:
        actual_user_name = user_name
    
    # Check if it's an admin room
    if room_id in admin_rooms:
        # Check if user is admin for admin room access
        if not user_data.get('is_authenticated') or not is_admin_user(user_data['username']):
            await sio.emit('room_error', {
                'message': 'Only administrators can join admin rooms'
            }, room=sid)
            return
        
        # Join user to admin room
        await sio.enter_room(sid, room_id)
        
        # Update user session
        user_sessions[sid]['room_id'] = room_id
        user_sessions[sid]['user_name'] = actual_user_name
        user_sessions[sid]['is_admin_room'] = True
        
        # Add user to admin room
        admin_rooms[room_id]['users'][sid] = {
            'name': actual_user_name,
            'joined_at': asyncio.get_event_loop().time(),
            'is_authenticated': user_data.get('is_authenticated', False),
            'username': user_data.get('username')
        }
        
        # Update last activity
        admin_rooms[room_id]['last_activity'] = asyncio.get_event_loop().time()
        
        room_owner = admin_rooms[room_id].get('owner')
        is_owner = room_owner and user_data.get('username') == room_owner
        
        print(f'Admin {actual_user_name} joined admin room {room_id} ({admin_rooms[room_id]["name"]})')
        
        # Get aggregated data and available rooms
        aggregated_data = get_aggregated_room_data(room_id)
        regular_rooms = []
        for rid, room in rooms.items():
            # Calculate hex and line counts for each room
            hex_count = sum(1 for hex_data in room['hex_data'].values() 
                           if hex_data.get('fillColor') and hex_data['fillColor'] != 'lightgray')
            line_count = len(room['lines'])
            
            # Initialize or update room toggle data with counts
            if rid not in admin_rooms[room_id]['room_toggles']:
                admin_rooms[room_id]['room_toggles'][rid] = {
                    'enabled': False,
                    'room_name': room['name'],
                    'hex_count': hex_count,
                    'line_count': line_count
                }
            else:
                # Update counts for existing toggle
                admin_rooms[room_id]['room_toggles'][rid].update({
                    'hex_count': hex_count,
                    'line_count': line_count
                })
            
            regular_rooms.append({
                'id': rid,  # Changed from 'room_id' to 'id' to match client expectation
                'name': room['name'],  # Changed from 'room_name' to 'name'
                'hex_count': hex_count,
                'line_count': line_count,
                'enabled': admin_rooms[room_id]['room_toggles'][rid]['enabled']
            })
        
        # Send current admin room state to the new user
        await sio.emit('admin_room_joined', {
            'room_id': room_id,
            'room_name': admin_rooms[room_id]['name'],
            'user_name': actual_user_name,
            'is_owner': is_owner,
            'hex_data': aggregated_data['hex_data'],
            'lines': aggregated_data['lines'],
            'users': list(admin_rooms[room_id]['users'].values()),
            'available_rooms': regular_rooms,
            'room_toggles': admin_rooms[room_id]['room_toggles']
        }, room=sid)
        
        # Notify other users in the admin room
        await sio.emit('user_joined', {
            'user_name': actual_user_name,
            'is_authenticated': user_data.get('is_authenticated', False),
            'users_count': len(admin_rooms[room_id]['users'])
        }, room=room_id, skip_sid=sid)
        
    elif room_id not in rooms:
        await sio.emit('room_error', {
            'message': 'Room not found'
        }, room=sid)
        return
    else:
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
            # Update hex and line counts for the updated room
            updated_room = rooms[updated_room_id]
            hex_count = sum(1 for hex_data in updated_room['hex_data'].values() 
                           if hex_data.get('fillColor') and hex_data['fillColor'] != 'lightgray')
            line_count = len(updated_room['lines'])
            
            # Update the toggle data with new counts
            admin_room['room_toggles'][updated_room_id].update({
                'hex_count': hex_count,
                'line_count': line_count
            })
            
            # Get updated aggregated data
            aggregated_data = get_aggregated_room_data(admin_room_id)
            
            # Notify all users in this admin room
            await sio.emit('admin_room_data_updated', {
                'hex_data': aggregated_data['hex_data'],
                'lines': aggregated_data['lines'],
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
    
    # Update last activity
    rooms[room_id]['last_activity'] = asyncio.get_event_loop().time()
    
    # Broadcast to all users in the room except sender
    await sio.emit('hex_erased', {
        'hex_key': hex_key,
        'lines': rooms[room_id]['lines'],
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
            'is_active': len(room_data['users']) > 0
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
    
    if user_data.get('is_admin_room') and room_id in admin_rooms:
        # Handle leaving admin room
        if sid in admin_rooms[room_id]['users']:
            # Remove user from admin room
            del admin_rooms[room_id]['users'][sid]
            
            # Update last activity
            admin_rooms[room_id]['last_activity'] = asyncio.get_event_loop().time()
            
            # Leave the socket.io room
            await sio.leave_room(sid, room_id)
            
            # Notify other users in the admin room
            await sio.emit('user_left', {
                'user_name': user_data['user_name'],
                'users_count': len(admin_rooms[room_id]['users'])
            }, room=room_id)
            
            print(f'Admin {user_data["user_name"]} left admin room {room_id} ({admin_rooms[room_id]["name"]})')
            
            if len(admin_rooms[room_id]['users']) == 0:
                print(f'Admin room {room_id} ({admin_rooms[room_id]["name"]}) is now empty but preserved')
    elif room_id in rooms and sid in rooms[room_id]['users']:
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

@sio.on('admin_toggle_room')
async def handle_admin_toggle_room(sid, data):
    """Toggle room visibility in admin room"""
    user_data = user_sessions.get(sid)
    if not user_data or not user_data.get('is_admin_room') or not user_data['room_id']:
        await sio.emit('admin_error', {
            'message': 'Not in an admin room'
        }, room=sid)
        return
    
    room_id = user_data['room_id']
    if room_id not in admin_rooms:
        return
    
    target_room_id = data.get('room_id')
    enabled = data.get('enabled', False)
    
    if target_room_id not in rooms:
        await sio.emit('admin_error', {
            'message': 'Target room not found'
        }, room=sid)
        return
    
    # Calculate hex and line counts for the target room
    target_room = rooms[target_room_id]
    hex_count = sum(1 for hex_data in target_room['hex_data'].values() 
                   if hex_data.get('fillColor') and hex_data['fillColor'] != 'lightgray')
    line_count = len(target_room['lines'])
    
    # Update toggle state with counts
    admin_rooms[room_id]['room_toggles'][target_room_id] = {
        'enabled': enabled,
        'room_name': rooms[target_room_id]['name'],
        'hex_count': hex_count,
        'line_count': line_count
    }
    
    # Update last activity
    admin_rooms[room_id]['last_activity'] = asyncio.get_event_loop().time()
    
    # Get updated aggregated data
    aggregated_data = get_aggregated_room_data(room_id)
    
    # Broadcast updated data to all users in admin room
    await sio.emit('admin_room_data_updated', {
        'hex_data': aggregated_data['hex_data'],
        'lines': aggregated_data['lines'],
        'room_toggles': admin_rooms[room_id]['room_toggles'],
        'toggled_room_name': rooms[target_room_id]['name'],
        'enabled': enabled
    }, room=room_id)

@sio.on('get_admin_rooms')
async def handle_get_admin_rooms(sid):
    """Get list of available admin rooms (for admins only)"""
    user_data = user_sessions.get(sid, {})
    
    if not user_data.get('is_authenticated') or not is_admin_user(user_data['username']):
        await sio.emit('admin_error', {
            'message': 'Admin privileges required'
        }, room=sid)
        return
    
    admin_room_list = []
    current_time = asyncio.get_event_loop().time()
    
    for room_id, room_data in admin_rooms.items():
        # Calculate time since last activity
        time_since_activity = current_time - room_data['last_activity']
        hours_since_activity = time_since_activity / 3600
        
        admin_room_list.append({
            'room_id': room_id,
            'name': room_data['name'],
            'users_count': len(room_data['users']),
            'created_at': room_data['created_at'],
            'last_activity': room_data['last_activity'],
            'hours_since_activity': round(hours_since_activity, 1),
            'is_active': len(room_data['users']) > 0,
            'is_admin_room': True
        })
    
    # Sort by last activity (most recent first)
    admin_room_list.sort(key=lambda x: x['last_activity'], reverse=True)
    
    await sio.emit('admin_rooms_list', {'admin_rooms': admin_room_list}, room=sid)

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
        
        # Save to file
        save_users_to_file()
        
        logging.info(f"New user registered: {username}" + (" (admin)" if is_first_user else ""))
        
        return {
            "message": "User registered successfully" + (" as admin" if is_first_user else ""),
            "username": username,
            "is_admin": is_first_user
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
        "username": actual_username
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
