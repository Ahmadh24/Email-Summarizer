require('dotenv').config();
const express = require('express');
const session = require('express-session');
const mongoose = require('mongoose');
const MongoStore = require('connect-mongo');
const path = require('path');
const { google } = require('googleapis');
const { generateSummaryForUser, generatePreviewForUser } = require('./services/emailSummary');
const { initializeSchedules, updateSchedule } = require('./services/scheduler');
const User = require('./models/user');

const app = express();

// Add ping endpoint for keep-alive
app.get('/ping', (req, res) => {
    console.log('Ping received at:', new Date().toISOString());
    res.send('pong');
});

// Trust proxy for secure cookies in production
if (process.env.NODE_ENV === 'production') {
    app.set('trust proxy', 1);
}

// Middleware
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Session configuration
app.use(session({
    secret: process.env.SESSION_SECRET || 'your-secret-key',
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({
        mongoUrl: process.env.MONGODB_URI || 'mongodb://localhost:27017/email-summarizer'
    }),
    cookie: {
        maxAge: 1000 * 60 * 60 * 24 * 7, // 1 week
        secure: process.env.NODE_ENV === 'production',
        sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax'
    }
}));

// Database connection with retry logic
const connectDB = async (retries = 5) => {
    try {
        await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/email-summarizer');
        console.log('Connected to MongoDB');
        // Initialize schedules after successful connection
        await initializeSchedules();
    } catch (error) {
        console.error('MongoDB connection error:', error);
        if (retries > 0) {
            console.log(`Retrying connection... (${retries} attempts remaining)`);
            setTimeout(() => connectDB(retries - 1), 5000);
        }
    }
};

connectDB();

// Routes
app.get('/', (req, res) => {
    res.render('index');
});

app.get('/dashboard', async (req, res) => {
    if (!req.session.userId) {
        return res.redirect('/');
    }
    const user = await User.findById(req.session.userId);
    res.render('dashboard', { user });
});

// Gmail OAuth routes
app.get('/auth/gmail', (req, res) => {
    const oauth2Client = new google.auth.OAuth2(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET,
        process.env.GOOGLE_REDIRECT_URI
    );

    const authUrl = oauth2Client.generateAuthUrl({
        access_type: 'offline',
        prompt: 'consent',
        scope: [
            'https://www.googleapis.com/auth/gmail.readonly',
            'https://www.googleapis.com/auth/gmail.modify'
        ]
    });

    res.redirect(authUrl);
});

app.get('/auth/gmail/callback', async (req, res) => {
    const { code } = req.query;
    const oauth2Client = new google.auth.OAuth2(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET,
        process.env.GOOGLE_REDIRECT_URI
    );

    try {
        const { tokens } = await oauth2Client.getToken(code);
        oauth2Client.setCredentials(tokens);

        // Get user's email
        const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
        const profile = await gmail.users.getProfile({ userId: 'me' });
        const email = profile.data.emailAddress;

        // Save or update user
        let user = await User.findOne({ email });
        if (!user) {
            user = new User({
                email,
                summaryEmail: email, // Default to same email
                gmailToken: tokens
            });
        } else {
            user.gmailToken = tokens;
        }
        await user.save();
        
        req.session.userId = user._id;
        res.redirect('/dashboard');
    } catch (error) {
        console.error('OAuth callback error:', error);
        res.redirect('/?error=auth_failed');
    }
});

// API routes
app.post('/api/update-preferences', async (req, res) => {
    if (!req.session.userId) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    try {
        const user = await User.findById(req.session.userId);
        user.summaryEmail = req.body.summaryEmail;
        
        // Parse delivery time from request
        const [hours, minutes] = req.body.deliveryTime.split(':').map(Number);
        
        user.preferences = {
            deliveryTime: {
                hours,
                minutes
            },
            categories: req.body.categories,
            lookbackDays: parseInt(req.body.lookbackDays)
        };
        
        await user.save();
        
        // Update the schedule for this user
        updateSchedule(user);
        
        res.json({ success: true });
    } catch (error) {
        console.error('Error updating preferences:', error);
        res.status(500).json({ error: 'Failed to update preferences' });
    }
});

// Preview summary without sending
app.get('/api/preview-summary', async (req, res) => {
    console.log('Preview summary requested');
    if (!req.session.userId) {
        console.log('No user session found');
        return res.status(401).json({ error: 'Unauthorized' });
    }

    try {
        console.log('Fetching user data for preview');
        const user = await User.findById(req.session.userId);
        console.log('Generating preview for user:', user.email);
        const preview = await generatePreviewForUser(user);
        console.log('Preview generated successfully');
        res.json(preview);
    } catch (error) {
        console.error('Error generating preview:', error);
        res.status(500).json({ error: 'Failed to generate preview' });
    }
});

// Send test summary
app.post('/api/send-test-summary', async (req, res) => {
    console.log('Test summary requested');
    if (!req.session.userId) {
        console.log('No user session found');
        return res.status(401).json({ error: 'Unauthorized' });
    }

    try {
        console.log('Fetching user data for test summary');
        const user = await User.findById(req.session.userId);
        console.log('Sending test summary for user:', user.email);
        await generateSummaryForUser(user);
        console.log('Test summary sent successfully');
        res.json({ success: true, message: 'Test summary sent!' });
    } catch (error) {
        console.error('Error sending test summary:', error);
        res.status(500).json({ error: 'Failed to send test summary' });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
}); 