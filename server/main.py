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
        "http://mechmaponline.fun:3000",
        "https://mechmaponline.fun:3000"
    ],  # React dev server + production domain
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
        if room_id in rooms and sid in rooms[room_id]['users']:
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
    while room_id in rooms:  # Ensure uniqueness
        room_id = generate_room_id()
    
    # Create room
    rooms[room_id] = create_new_room(room_name, room_owner)
    
    # Join user to room
    await sio.enter_room(sid, room_id)
    
    # Update user session
    user_sessions[sid]['room_id'] = room_id
    user_sessions[sid]['user_name'] = actual_user_name
    
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
    
    if room_id not in rooms:
        await sio.emit('room_error', {
            'message': 'Room not found'
        }, room=sid)
        return
    
    # Join user to room
    await sio.enter_room(sid, room_id)
    
    # Update user session
    user_sessions[sid]['room_id'] = room_id
    user_sessions[sid]['user_name'] = actual_user_name
    
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

@sio.on('hex_update')
async def handle_hex_update(sid, data):
    """Handle hex color updates"""
    user_data = user_sessions.get(sid)
    if not user_data or not user_data['room_id']:
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

@sio.on('line_add')
async def handle_line_add(sid, data):
    """Handle new line creation"""
    user_data = user_sessions.get(sid)
    if not user_data or not user_data['room_id']:
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

@sio.on('hex_erase')
async def handle_hex_erase(sid, data):
    """Handle hex and associated lines erasing"""
    user_data = user_sessions.get(sid)
    if not user_data or not user_data['room_id']:
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
    if room_id in rooms and sid in rooms[room_id]['users']:
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
    print(f'Received message: {data}')

@app.get("/")
async def read_root(request: Request):
    return templates.TemplateResponse(name="index.html", context={"request": request})

@app.post("/api/register")
async def register_user(user_data: UserRegister):
    """Register a new user"""
    username = user_data.username.strip()
    password = user_data.password
    
    # Validate input
    if not username or len(username) < 3:
        raise HTTPException(status_code=400, detail="Username must be at least 3 characters")
    if not password or len(password) < 4:
        raise HTTPException(status_code=400, detail="Password must be at least 4 characters")
    
    # Check if username already exists
    if username.lower() in [u.lower() for u in users_db.keys()]:
        raise HTTPException(status_code=400, detail="Username already exists")
    
    # Create user
    users_db[username] = {
        'username': username,
        'password_hash': hash_password(password),
        'created_at': asyncio.get_event_loop().time(),
        'last_login': None
    }
    
    # Generate token
    token = generate_token()
    user_tokens[token] = username
    
    logging.info(f"New user registered: {username}")
    
    return {
        "success": True,
        "message": "User registered successfully",
        "token": token,
        "username": username
    }

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
    """Logout user"""
    auth_header = request.headers.get("Authorization")
    if not auth_header or not auth_header.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="No token provided")
    
    token = auth_header.split(" ")[1]
    username = user_tokens.pop(token, None)
    
    if username:
        logging.info(f"User logged out: {username}")
        return {"success": True, "message": "Logout successful"}
    else:
        raise HTTPException(status_code=401, detail="Invalid token")

@app.get("/api/verify-token")
async def verify_token(request: Request):
    """Verify if token is valid"""
    auth_header = request.headers.get("Authorization")
    if not auth_header or not auth_header.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="No token provided")
    
    token = auth_header.split(" ")[1]
    username = get_user_from_token(token)
    
    if username and username in users_db:
        return {
            "valid": True,
            "username": username
        }
    else:
        raise HTTPException(status_code=401, detail="Invalid token")

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

try:
    app.mount("/static", StaticFiles(directory="static"), name="static")
except RuntimeError as e:
    logging.error(f"Error mounting static files: {e}")
