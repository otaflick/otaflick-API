require('dotenv').config()
const express = require('express')
const app = express()
const cors = require('cors');
const bodyParser = require('body-parser');
const http = require('http');
const { Server } = require('socket.io');

app.set('view engine', 'hbs');
const hbs = require('hbs');


hbs.registerHelper('includes', function (array, value) {
    return Array.isArray(array) && array.includes(value);
});
// Add this with your other hbs.registerHelper calls
hbs.registerHelper('substr', function(str, start, length) {
    if (typeof str !== 'string') return '';
    
    // Handle negative start (count from end)
    if (start < 0) {
        start = Math.max(0, str.length + start);
    }
    
    // If length is provided, use substring; otherwise go to end
    if (length !== undefined) {
        return str.substring(start, start + length);
    }
    
    return str.substring(start);
});

// Add this with your other hbs.registerHelper calls
hbs.registerHelper('formatDate', function(date, format) {
    if (!date) return '';
    
    // If date is a string, convert to Date object
    const dateObj = typeof date === 'string' ? new Date(date) : date;
    
    // If it's not a valid date, return empty string
    if (isNaN(dateObj.getTime())) return '';
    
    // Default format if none provided
    if (!format) {
        return dateObj.toLocaleDateString();
    }
    
    // Handle different format types
    switch (format) {
        case 'short':
            return dateObj.toLocaleDateString();
        case 'medium':
            return dateObj.toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'short',
                day: 'numeric'
            });
        case 'long':
            return dateObj.toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'long',
                day: 'numeric'
            });
        case 'time':
            return dateObj.toLocaleTimeString('en-US', {
                hour: '2-digit',
                minute: '2-digit'
            });
        case 'datetime':
            return dateObj.toLocaleString('en-US', {
                year: 'numeric',
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            });
        case 'iso':
            return dateObj.toISOString();
        case 'relative':
            // Relative time (e.g., "2 hours ago")
            const now = new Date();
            const diffMs = now - dateObj;
            const diffMins = Math.floor(diffMs / (1000 * 60));
            const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
            const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
            
            if (diffMins < 1) return 'Just now';
            if (diffMins < 60) return `${diffMins} minute${diffMins > 1 ? 's' : ''} ago`;
            if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
            if (diffDays < 7) return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
            
            return dateObj.toLocaleDateString();
        default:
            // Custom format handling
            return dateObj.toLocaleDateString();
    }
});

// Add this new helper for safe JavaScript strings
hbs.registerHelper('jsString', function(str) {
    if (typeof str !== 'string') return '';
    // Escape quotes and backslashes for JavaScript strings
    return str
        .replace(/\\/g, '\\\\')
        .replace(/'/g, "\\'")
        .replace(/"/g, '\\"')
        .replace(/\n/g, '\\n')
        .replace(/\r/g, '\\r')
        .replace(/\t/g, '\\t');
});
const port = process.env.PORT

// Create HTTP server
const server = http.createServer(app);

// Initialize Socket.IO
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

// Socket.IO connection handling
const connectedUsers = new Map(); // Store socketId -> userId mapping


io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    // Handle user registration (when user logs in) - FIXED EVENT NAME
    socket.on('register', async (data) => {
        try {
            console.log('User registering:', data);
            
            // Extract userId from the data object
            const { userId } = data;
            
            // Store the connection
            connectedUsers.set(socket.id, userId);
            socket.userId = userId;

            // Update user online status in database
            await User.findByIdAndUpdate(userId, { 
                isOnline: true
            });

            console.log(`User ${userId} is now online`);

            // Send confirmation to the user
            socket.emit('registered', { success: true });

        } catch (error) {
            console.error('Error during user registration:', error);
            socket.emit('error', { message: 'Failed to register user' });
        }
    });

    // Handle user disconnection
    socket.on('disconnect', async () => {
        try {
            const userId = connectedUsers.get(socket.id);
            
            if (userId) {
                // Remove from connected users
                connectedUsers.delete(socket.id);

                // Check if user has other active connections
                const hasOtherConnections = Array.from(connectedUsers.values()).some(id => id === userId);

                if (!hasOtherConnections) {
                    // Update user offline status in database
                    await User.findByIdAndUpdate(userId, { 
                        isOnline: false
                    });

                    console.log(`User ${userId} is now offline`);
                }
            }

            console.log('User disconnected:', socket.id);
        } catch (error) {
            console.error('Error during user disconnection:', error);
        }
    });

    // Handle manual logout
    socket.on('logout', async (data) => { //  Now accepts data object
        try {
            const { userId } = data; // Extract userId from data
            
            if (!userId) {
                console.log('No userId provided in logout event');
                return;
            }

            console.log(`User ${userId} logging out via socket`);

            // Remove all connections for this user
            for (let [socketId, uid] of connectedUsers.entries()) {
                if (uid === userId) {
                    connectedUsers.delete(socketId);
                    console.log(`Removed socket connection ${socketId} for user ${userId}`);
                }
            }

            // Update user offline status
            await User.findByIdAndUpdate(userId, { 
                isOnline: false,
                lastSeen: new Date() // Add this
            });

            console.log(`User ${userId} status updated to offline (manual logout)`);

        } catch (error) {
            console.error('Error during socket logout:', error);
        }
    });
});

// Connect to MongoDB database
const mongoose = require('mongoose');
mongoose.connect(process.env.MONGO_DB_URL, { useNewUrlParser: true, useUnifiedTopology: true });
const db = mongoose.connection;

// Set up session management with Express
const session = require('express-session');
const User = require('./models/User')
const MongoStore = require('connect-mongo')
app.use(session({
    secret: 'abcd1234',
    resave: false,
    saveUninitialized: false,
    store: new MongoStore({ mongoUrl: process.env.MONGO_DB_URL }),
    cookie: {
        maxAge: 1000 * 60 * 60 * 24 * 7,
    },
}));

// Set up Passport.js for user authentication
const passport = require('passport');
const LocalStrategy = require('passport-local').Strategy;
app.use(passport.initialize());
app.use(passport.session());
passport.use(new LocalStrategy({
    usernameField: 'email',    
    passwordField: 'password'  
}, User.authenticate()));passport.serializeUser(User.serializeUser());
passport.deserializeUser(User.deserializeUser());

// Serve static files from the 'public' directory
const path = require('path');
app.use(express.static(path.join(__dirname, 'public')));

app.use(cors());
app.use(bodyParser.json({ limit: '1gb' }));
app.use(bodyParser.urlencoded({ limit: '1gb', extended: true }));

const Movie = require('./models/movie')

// Handle MongoDB connection errors
db.on('error', console.error.bind(console, 'MongoDB connection error:'));
db.once('open', () => {
    console.log('Connected to MongoDB');
});

// Import routes
const dashboard = require('./routes/dashboard')
const addMovie = require('./routes/addMovie')
const updateMovieRoute = require('./routes/updateMovie')
const deleteMovie = require('./routes/deleteMovie')
const getMovies = require('./routes/getMovies')
const authRoutes = require('./routes/authRoutes')
const myList = require('./routes/mylist')
const watcheMovie = require('./routes/watchedMovie')
const scanAllMovies = require('./routes/scanAllMovies')

const addShows = require('./routes/addShows')
const updateShows = require('./routes/updateShows')
const deleteShow = require('./routes/deleteShow')
const scanAllShows = require('./routes/scanAllShows')
const getShows = require('./routes/getShows')
const watchedShows = require('./routes/watchedShows')
const showsMylist = require('./routes/showsMylist')
const managePosters = require('./routes/managePosters')
const checkCon = require('./routes/checkcon')

const addAnime = require('./routes/addAnime')
const updateAnime = require('./routes/updateAnime')
const deleteAnime = require('./routes/deleteAnime')
const getAnime = require('./routes/getAnime')
const watchedAnime = require('./routes/watchedAnime')
const AnimeMylist = require('./routes/animeMylist')

// Use routes
app.use('/', checkCon)
app.use('/', dashboard)
app.use('/', addMovie)
app.use('/', updateMovieRoute)
app.use('/', deleteMovie)
app.use('/', getMovies)
app.use('/', authRoutes)
app.use('/', myList)
app.use('/', watcheMovie)
app.use('/', scanAllMovies)

app.use('/', addShows)
app.use('/', updateShows)
app.use('/', deleteShow)
app.use('/', scanAllShows)
app.use('/', getShows)
app.use('/', watchedShows)
app.use('/', showsMylist)
app.use('/', managePosters)

app.use('/', addAnime)
app.use('/', updateAnime)
app.use('/', deleteAnime)
app.use('/', getAnime)
app.use('/', watchedAnime)
app.use('/', AnimeMylist)

// Start server
server.listen(port, () => {
    console.log(`API is running on port ${port}`)
});

// Export io for use in other files if needed
module.exports = { io, connectedUsers };