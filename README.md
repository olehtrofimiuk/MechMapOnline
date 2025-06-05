# Hex Map Online - Collaborative Mapping Tool

A real-time collaborative hex grid mapping tool for tabletop RPGs, strategy games, and world-building. Draw on a shared hex grid with friends, create measurement lines, and work together to create detailed maps.

## 🎮 Features

### Core Mapping Features
- **Interactive Hex Grid**: Large scrollable hex grid perfect for maps and battle grids
- **Real-time Collaboration**: See other users' changes instantly
- **Multiple Tools**: Paint hexes, draw measurement lines, and erase elements
- **Zoom & Pan**: Smooth zooming and panning with mouse controls
- **Color Picker**: Full color palette with preset colors for quick access

### Room Management
- **Named Persistent Rooms**: Create rooms with custom names that persist when empty
- **Room Ownership**: Authenticated users own the rooms they create
- **Activity Tracking**: See when rooms were last active
- **Auto-save**: Rooms automatically save every 10 seconds to preserve your work

### User Authentication (Optional)
- **Simple Authentication**: Username and password only - no email required
- **Anonymous Access**: Continue using the tool without an account
- **Room Ownership**: Authenticated users can own and manage rooms
- **Mixed Sessions**: Authenticated and anonymous users can collaborate in the same room

## 🚀 Quick Start

### Prerequisites
- Python 3.8+
- Node.js 16+
- A modern web browser

### Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd MechMapOnline
   ```

2. **Set up the Python backend**
   ```bash
   cd server
   python -m venv venv
   
   # On Windows:
   venv\Scripts\activate
   # On macOS/Linux:
   source venv/bin/activate
   
   pip install fastapi uvicorn python-socketio python-multipart
   ```

3. **Set up the React frontend**
   ```bash
   cd ../client
   npm install
   ```

### Running the Application

1. **Start the backend server**
   ```bash
   cd server
   # Activate virtual environment if not already active
   venv\Scripts\activate  # Windows
   # source venv/bin/activate  # macOS/Linux
   
   python main.py
   ```
   The server will start on `http://localhost:8000`

2. **Start the frontend development server**
   ```bash
   cd client
   npm start
   ```
   The client will start on `http://localhost:3000`

3. **Open your browser**
   Navigate to `http://localhost:3000` to access the application

## 📖 How to Use

### Getting Started
1. **Choose Authentication Method**:
   - **Register/Login**: Create an account for room ownership and persistent identity
   - **Continue as Anonymous**: Use the tool without an account

2. **Create or Join a Room**:
   - **Create**: Give your room a name and start mapping
   - **Join**: Enter a room ID to join an existing session

### Mapping Tools

#### Paint Tool
- Select colors from the palette or color picker
- Click or drag to paint hexes
- Great for marking territories, terrain types, or zones

#### Measure Tool
- Click two hexes to create a measurement line
- Shows distance in hex units
- Perfect for movement ranges, spell areas, or distance calculations

#### Erase Tool
- Remove painted colors from hexes
- Delete measurement lines
- Clean up mistakes or change your map

#### Select Tool
- Default cursor mode for navigation
- Pan by right-clicking and dragging
- Zoom with mouse wheel

### Room Features

#### Room Ownership (Authenticated Users)
- Create named rooms that you own
- Rooms persist even when empty
- Owner indicator shown in room header

#### Anonymous Collaboration
- Join any room without an account
- Full access to all mapping tools
- Participate in real-time collaboration

#### Activity Indicators
- See active rooms with online users
- View when inactive rooms were last used
- Real-time user count for each room

## 🔧 Configuration

### Server Configuration
The server runs on `localhost:8000` by default. Key features:

- **Auto-save**: Rooms save automatically every 10 seconds
- **Data Persistence**: Room data stored in `server/room_data/rooms.json`
- **User Database**: User accounts stored in `server/room_data/users.json`
- **CORS**: Configured for local development

### Client Configuration
The React client connects to `localhost:8000` by default. Update the server URL in:
- `client/src/components/MainWindow.jsx`
- `client/src/components/AuthManager.jsx`

## 🛡️ Security Notes

### Password Security
- Passwords are hashed using PBKDF2 with SHA-256
- Each password has a unique salt
- Tokens are cryptographically secure random strings

### Authentication Flow
1. User registers or logs in
2. Server returns a secure token
3. Token stored in browser localStorage
4. Token sent with socket authentication
5. Server validates token for all requests

### Data Privacy
- No email addresses collected
- Only username and hashed password stored
- Room data persists for collaborative mapping
- Anonymous users leave no permanent trace

## 🏗️ Project Structure

```
MechMapOnline/
├── client/                 # React frontend
│   ├── src/
│   │   ├── components/     # React components
│   │   │   ├── AuthManager.jsx     # Login/register interface
│   │   │   ├── MainWindow.jsx      # Main application component
│   │   │   ├── RoomManager.jsx     # Room creation/joining
│   │   │   ├── HexGrid.jsx         # Main hex grid component
│   │   │   ├── Hexagon.jsx         # Individual hex component
│   │   │   ├── Line.jsx            # Measurement line component
│   │   │   └── Arrow.jsx           # Arrow indicators
│   │   └── package.json
│   └── public/
├── server/                 # Python FastAPI backend
│   ├── main.py            # Main server application
│   ├── room_data/         # Persistent data storage
│   │   ├── rooms.json     # Room data (auto-generated)
│   │   └── users.json     # User accounts (auto-generated)
│   ├── static/            # Static file serving
│   └── templates/         # Jinja2 templates
├── README.md
└── .gitignore
```

## 🔌 API Endpoints

### Authentication Endpoints
- `POST /api/register` - Create new user account
- `POST /api/login` - Authenticate existing user
- `POST /api/logout` - Invalidate user token
- `GET /api/verify-token` - Validate authentication token

### Admin Endpoints
- `GET /api/save-rooms` - Manually trigger room save
- `GET /api/rooms-status` - View room and user statistics

### Socket.IO Events

#### Client → Server
- `authenticate` - Authenticate with token
- `create_room` - Create new room
- `join_room` - Join existing room
- `leave_room` - Leave current room
- `hex_update` - Update hex color
- `line_add` - Add measurement line
- `hex_erase` - Erase hex and connected lines
- `cursor_update` - Share cursor position
- `get_rooms` - Request available rooms list

#### Server → Client
- `auth_success` / `auth_error` - Authentication results
- `room_created` / `room_joined` - Room join confirmations
- `room_error` - Room operation errors
- `user_joined` / `user_left` - User presence updates
- `hex_updated` / `line_added` / `hex_erased` - Map updates
- `cursor_moved` - Other users' cursor positions
- `rooms_list` - Available rooms data

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## 📝 License

This project is open source. Feel free to use, modify, and distribute according to your needs.

## 🐛 Troubleshooting

### Common Issues

**"Connection failed"**
- Ensure the Python server is running on port 8000
- Check that no firewall is blocking the connection
- Verify the server URL in the client configuration

**"Room not found"**
- Room IDs are case-sensitive (automatically converted to uppercase)
- Ensure the room hasn't been deleted
- Try refreshing the available rooms list

**"Authentication failed"**
- Check username and password are correct
- Clear browser localStorage if having token issues
- Ensure server is accepting connections

**Performance Issues**
- Large maps may slow down with many painted hexes
- Consider creating multiple rooms for different map sections
- Close unused browser tabs to free up memory

### Server Logs
Check the server console for detailed error messages and connection information.

### Client Debugging
Use browser developer tools to check for JavaScript errors and network issues. 