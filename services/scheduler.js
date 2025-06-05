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
    if (!user.preferences?.deliveryTime) {
        console.log(`No delivery time set for user ${user.email}`);
        return false;
    }

    const now = new Date();
    const userTime = user.preferences.deliveryTime;
    const isTime = now.getHours() === userTime.hours && now.getMinutes() === userTime.minutes;
    
    console.log(`Time check for ${user.email}: Current time: ${now.getHours()}:${now.getMinutes()}, User time: ${userTime.hours}:${userTime.minutes}, Should send: ${isTime}`);
    
    return isTime;
}

// Schedule summary for a specific user
function scheduleForUser(user) {
    if (!user.preferences?.deliveryTime) {
        console.log(`Cannot schedule for user ${user.email}: No delivery time preferences set`);
        return;
    }

    // Cancel existing job if any
    if (scheduledJobs.has(user._id.toString())) {
        console.log(`Cancelling existing schedule for user ${user.email}`);
        scheduledJobs.get(user._id.toString()).cancel();
    }

    const { hours, minutes } = user.preferences.deliveryTime;
    const cronExpression = `${minutes} ${hours} * * *`;
    console.log(`Setting up schedule for user ${user.email} with cron: ${cronExpression}`);

    // Schedule new job
    const job = schedule.scheduleJob(cronExpression, async () => {
        console.log(`⏰ Cron triggered for ${user.email} at ${new Date().toISOString()}`);
        try {
            // Fetch fresh user data
            const freshUser = await User.findById(user._id);
            if (!freshUser) {
                console.error(`User ${user.email} not found in database`);
                return;
            }

            if (isTimeToSend(freshUser)) {
                console.log(`🚀 Generating summary for ${freshUser.email}`);
                await generateSummaryForUser(freshUser);
                console.log(`✅ Summary sent successfully to ${freshUser.summaryEmail}`);
            } else {
                console.log(`⏳ Not time to send summary for ${freshUser.email}`);
            }
        } catch (error) {
            console.error(`❌ Error in scheduled job for ${user.email}:`, error);
        }
    });

    if (job) {
        scheduledJobs.set(user._id.toString(), job);
        console.log(`✅ Schedule created successfully for ${user.email}`);
        
        // Log next invocation
        const nextInvocation = job.nextInvocation();
        console.log(`📅 Next summary for ${user.email} will be at: ${nextInvocation}`);
    } else {
        console.error(`Failed to create schedule for ${user.email}`);
    }
}

// Initialize schedules for all users
async function initializeSchedules() {
    try {
        const users = await User.find({});
        console.log(`🔄 Initializing schedules for ${users.length} users`);
        
        users.forEach(user => {
            scheduleForUser(user);
        });

        // Setup keep-alive for production
        setupKeepAlive();
        
        console.log('✅ Initialized schedules for', users.length, 'users');
        
        // Log all scheduled jobs
        scheduledJobs.forEach((job, userId) => {
            const nextRun = job.nextInvocation();
            console.log(`📋 Scheduled job for user ${userId}: Next run at ${nextRun}`);
        });
    } catch (error) {
        console.error('❌ Error initializing schedules:', error);
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