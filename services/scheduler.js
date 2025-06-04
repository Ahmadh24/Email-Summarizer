const schedule = require('node-schedule');
const User = require('../models/user');
const { generateSummaryForUser } = require('./emailSummary');
const https = require('https');

// Store all scheduled jobs
const scheduledJobs = new Map();

// Keep-alive mechanism
function setupKeepAlive() {
    if (process.env.NODE_ENV === 'production') {
        setInterval(() => {
            https.get('https://email-summarizer-t43q.onrender.com/ping', (resp) => {
                console.log('Keep-alive ping sent at:', new Date().toISOString());
            }).on('error', (err) => {
                console.error('Keep-alive error:', err);
            });
        }, 14 * 60 * 1000); // 14 minutes
    }
}

// Check if it's time to send summary
function isTimeToSend(user) {
    const now = new Date();
    const userTime = user.preferences.deliveryTime;
    return now.getHours() === userTime.hours && now.getMinutes() === userTime.minutes;
}

// Schedule summary for a specific user
function scheduleForUser(user) {
    // Cancel existing job if any
    if (scheduledJobs.has(user._id.toString())) {
        scheduledJobs.get(user._id.toString()).cancel();
    }

    // Create cron expression for the user's delivery time
    const cronExpression = `${user.preferences.deliveryTime.minutes} ${user.preferences.deliveryTime.hours} * * *`;
    console.log(`Scheduling summary for user ${user.email} at ${user.preferences.deliveryTime.hours}:${user.preferences.deliveryTime.minutes}`);

    // Schedule new job
    const job = schedule.scheduleJob(cronExpression, async () => {
        console.log(`Executing scheduled summary for ${user.email}`);
        try {
            // Fetch fresh user data
            const freshUser = await User.findById(user._id);
            if (freshUser && isTimeToSend(freshUser)) {
                await generateSummaryForUser(freshUser);
                console.log(`Summary sent successfully to ${freshUser.summaryEmail}`);
            }
        } catch (error) {
            console.error(`Error sending scheduled summary for ${user.email}:`, error);
        }
    });

    // Store the job
    scheduledJobs.set(user._id.toString(), job);
}

// Initialize schedules for all users
async function initializeSchedules() {
    try {
        const users = await User.find({});
        console.log(`Initializing schedules for ${users.length} users`);
        
        users.forEach(user => {
            scheduleForUser(user);
        });

        // Setup keep-alive for production
        setupKeepAlive();
        
        console.log('Initialized schedules for', users.length, 'users');
    } catch (error) {
        console.error('Error initializing schedules:', error);
    }
}

// Update schedule for a user
function updateSchedule(user) {
    if (user.preferences?.deliveryTime) {
        scheduleForUser(user);
        console.log(`Updated schedule for ${user.email}`);
    }
}

module.exports = {
    initializeSchedules,
    updateSchedule: scheduleForUser
}; 