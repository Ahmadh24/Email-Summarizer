const schedule = require('node-schedule');
const User = require('../models/user');
const { generateSummaryForUser } = require('./emailSummary');
const https = require('https');

// Store all scheduled jobs
const scheduledJobs = new Map();

// Enhanced keep-alive mechanism
function setupKeepAlive() {
    if (process.env.NODE_ENV === 'production') {
        // Send keep-alive ping every 10 minutes
        setInterval(() => {
            https.get('https://email-summarizer-t43q.onrender.com/ping', (resp) => {
                console.log('Keep-alive ping sent at:', new Date().toISOString());
            }).on('error', (err) => {
                console.error('Keep-alive error:', err);
                // Retry on failure after 1 minute
                setTimeout(setupKeepAlive, 60000);
            });
        }, 10 * 60 * 1000); // 10 minutes
    }
}

// Check if time is today or tomorrow
function getScheduleDate(hours, minutes) {
    const now = new Date();
    const scheduleTime = new Date();
    scheduleTime.setHours(hours, minutes, 0, 0);

    // If the time has passed for today, schedule for tomorrow
    if (scheduleTime <= now) {
        scheduleTime.setDate(scheduleTime.getDate() + 1);
    }

    console.log(`Calculated schedule time: ${scheduleTime.toISOString()} (${scheduleTime.toLocaleString()})`);
    return scheduleTime;
}

// Handle the summary generation and next schedule
async function handleScheduledJob(user) {
    console.log(`\n=== Executing Scheduled Job ===`);
    console.log(`⏰ Triggered for ${user.email} at ${new Date().toISOString()}`);
    try {
        // Fetch fresh user data
        const freshUser = await User.findById(user._id);
        if (!freshUser) {
            console.error(`❌ User ${user.email} not found in database`);
            return;
        }

        console.log(`🚀 Generating summary for ${freshUser.email}`);
        await generateSummaryForUser(freshUser);
        console.log(`✅ Summary sent successfully to ${freshUser.summaryEmail}`);

        // Schedule next day's summary
        console.log(`📅 Scheduling next day's summary`);
        await scheduleForUser(freshUser, true); // true indicates this is a reschedule
    } catch (error) {
        console.error(`❌ Error in scheduled job for ${user.email}:`, error);
        // Retry after 5 minutes if there's an error
        setTimeout(() => handleScheduledJob(user), 5 * 60 * 1000);
    }
}

// Schedule summary for a specific user
async function scheduleForUser(user, isReschedule = false) {
    console.log('\n=== Scheduling Summary for User ===');
    console.log(`User Email: ${user.email}`);
    console.log(`Current Time: ${new Date().toISOString()}`);

    if (!user.preferences?.deliveryTime) {
        console.log(`❌ Cannot schedule for user ${user.email}: No delivery time preferences set`);
        return;
    }

    // Cancel existing job if any
    if (scheduledJobs.has(user._id.toString())) {
        console.log(`🔄 Cancelling existing schedule for user ${user.email}`);
        scheduledJobs.get(user._id.toString()).cancel();
    }

    const { hours, minutes } = user.preferences.deliveryTime;
    console.log(`Requested delivery time: ${hours}:${minutes}`);
    
    const scheduleTime = getScheduleDate(hours, minutes);
    console.log(`🕒 Setting up schedule for ${scheduleTime.toLocaleString()}`);

    // Store the next run time in the database
    user.nextScheduledRun = scheduleTime;
    await user.save();
    console.log(`💾 Saved next run time to database: ${scheduleTime}`);

    // Schedule new job
    const job = schedule.scheduleJob(scheduleTime, () => handleScheduledJob(user));

    if (job) {
        scheduledJobs.set(user._id.toString(), job);
        console.log(`✅ Schedule created successfully for ${user.email}`);
        console.log(`📅 Next execution: ${job.nextInvocation()}`);
        
        // Verify the job is in the scheduledJobs map
        console.log(`🔍 Verifying job in scheduledJobs map: ${scheduledJobs.has(user._id.toString())}`);
    } else {
        console.error(`❌ Failed to create schedule for ${user.email}`);
    }
    console.log('=== End Scheduling ===\n');
}

// Check for missed schedules
async function checkMissedSchedules() {
    console.log('\n=== Checking Missed Schedules ===');
    const now = new Date();
    try {
        // Find users with missed schedules (scheduled time is in the past)
        const users = await User.find({
            nextScheduledRun: { $lt: now },
            'preferences.deliveryTime': { $exists: true }
        });

        console.log(`Found ${users.length} missed schedules`);

        for (const user of users) {
            console.log(`Processing missed schedule for ${user.email}`);
            try {
                // Generate summary for missed schedule
                await generateSummaryForUser(user);
                // Schedule next run
                await scheduleForUser(user, true);
            } catch (error) {
                console.error(`Error processing missed schedule for ${user.email}:`, error);
            }
        }
    } catch (error) {
        console.error('Error checking missed schedules:', error);
    }
    console.log('=== End Checking Missed Schedules ===\n');
}

// Initialize schedules for all users
async function initializeSchedules() {
    console.log('\n=== Initializing All Schedules ===');
    try {
        // First, check for any missed schedules
        await checkMissedSchedules();

        const users = await User.find({
            'preferences.deliveryTime': { $exists: true }
        });
        console.log(`🔄 Found ${users.length} users to schedule`);
        
        for (const user of users) {
            await scheduleForUser(user);
        }

        // Setup keep-alive for production
        setupKeepAlive();
        
        console.log('✅ Initialized all schedules');
        
        // Log all scheduled jobs
        console.log('\n=== Current Scheduled Jobs ===');
        scheduledJobs.forEach((job, userId) => {
            const nextRun = job.nextInvocation();
            console.log(`📋 User ${userId}: Next run at ${nextRun}`);
        });
        console.log('=== End Current Jobs ===\n');

        // Set up periodic check for missed schedules (every 15 minutes)
        setInterval(checkMissedSchedules, 15 * 60 * 1000);
    } catch (error) {
        console.error('❌ Error initializing schedules:', error);
    }
}

// Update schedule for a user
async function updateSchedule(user) {
    console.log('\n=== Updating Schedule ===');
    if (user.preferences?.deliveryTime) {
        await scheduleForUser(user);
        console.log(`✅ Updated schedule for ${user.email}`);
    } else {
        console.log(`❌ No delivery time set for ${user.email}`);
    }
    console.log('=== End Update ===\n');
}

module.exports = {
    initializeSchedules,
    updateSchedule: scheduleForUser
}; 