const schedule = require('node-schedule');
const User = require('../models/user');
const { generateSummaryForUser } = require('./emailSummary');
const https = require('https');

// Store all scheduled jobs
const scheduledJobs = new Map();

// Enhanced keep-alive mechanism
function setupKeepAlive() {
    console.log(`Setting up keep-alive. NODE_ENV: ${process.env.NODE_ENV}`);
    if (process.env.NODE_ENV === 'production') {
        console.log('Starting production keep-alive mechanism');
        // Send initial ping
        sendKeepAlivePing();
        // Send keep-alive ping every 5 minutes
        setInterval(sendKeepAlivePing, 5 * 60 * 1000); // 5 minutes
    } else {
        console.log('Keep-alive not started (not in production)');
    }
}

function sendKeepAlivePing() {
    console.log('Sending keep-alive ping...');
    https.get('https://email-summarizer-t43q.onrender.com/ping', (resp) => {
        console.log(`Keep-alive ping sent at: ${new Date().toISOString()}, Status: ${resp.statusCode}`);
    }).on('error', (err) => {
        console.error('Keep-alive error:', err);
        // Retry on failure after 1 minute
        console.log('Will retry keep-alive in 1 minute...');
        setTimeout(sendKeepAlivePing, 60000);
    });
}

// Check if time is today or tomorrow
function getScheduleDate(hours, minutes) {
    const now = new Date();
    console.log(`Current time: ${now.toISOString()}`);
    
    const scheduleTime = new Date();
    scheduleTime.setHours(hours, minutes, 0, 0);
    
    // If the time has passed for today, schedule for tomorrow
    if (scheduleTime <= now) {
        scheduleTime.setDate(scheduleTime.getDate() + 1);
        console.log('Time has passed for today, scheduling for tomorrow');
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
        // Log the full error stack
        console.error('Full error details:', error.stack);
        // Retry after 5 minutes if there's an error
        console.log(`Will retry in 5 minutes for ${user.email}`);
        setTimeout(() => handleScheduledJob(user), 5 * 60 * 1000);
    }
}

// Schedule summary for a specific user
async function scheduleForUser(user, isReschedule = false) {
    console.log('\n=== Scheduling Summary for User ===');
    console.log(`User Email: ${user.email}`);
    console.log(`Current Time: ${new Date().toISOString()}`);
    console.log(`Is Reschedule: ${isReschedule}`);

    try {
        if (!user.preferences?.deliveryTime) {
            console.log(`❌ Cannot schedule for user ${user.email}: No delivery time preferences set`);
            return;
        }

        // Cancel existing job if any
        if (scheduledJobs.has(user._id.toString())) {
            console.log(`🔄 Cancelling existing schedule for user ${user.email}`);
            scheduledJobs.get(user._id.toString()).cancel();
            scheduledJobs.delete(user._id.toString());
        }

        const { hours, minutes } = user.preferences.deliveryTime;
        console.log(`Requested delivery time: ${hours}:${minutes}`);
        
        const scheduleTime = getScheduleDate(hours, minutes);
        console.log(`🕒 Setting up schedule for ${scheduleTime.toLocaleString()}`);

        // Store the next run time in the database
        user.nextScheduledRun = scheduleTime;
        await user.save();
        console.log(`💾 Saved next run time to database: ${scheduleTime}`);

        // Create a rule for the schedule
        const rule = new schedule.RecurrenceRule();
        rule.hour = hours;
        rule.minute = minutes;
        console.log(`Created recurrence rule for ${hours}:${minutes}`);

        // Schedule new job with the rule
        const job = schedule.scheduleJob(rule, () => handleScheduledJob(user));

        if (job) {
            scheduledJobs.set(user._id.toString(), job);
            console.log(`✅ Schedule created successfully for ${user.email}`);
            console.log(`📅 Next execution: ${job.nextInvocation()}`);
            
            // Verify the job is in the scheduledJobs map
            console.log(`🔍 Verifying job in scheduledJobs map: ${scheduledJobs.has(user._id.toString())}`);
            console.log(`Current jobs count: ${scheduledJobs.size}`);
        } else {
            console.error(`❌ Failed to create schedule for ${user.email}`);
        }
    } catch (error) {
        console.error(`❌ Error scheduling for user ${user.email}:`, error);
        console.error('Full error details:', error.stack);
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
                console.error('Full error details:', error.stack);
            }
        }
    } catch (error) {
        console.error('Error checking missed schedules:', error);
        console.error('Full error details:', error.stack);
    }
    console.log('=== End Checking Missed Schedules ===\n');
}

// Initialize schedules for all users
async function initializeSchedules() {
    console.log('\n=== Initializing All Schedules ===');
    console.log(`NODE_ENV: ${process.env.NODE_ENV}`);
    console.log(`Current time: ${new Date().toISOString()}`);
    
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
        console.log(`Total scheduled jobs: ${scheduledJobs.size}`);
        console.log('=== End Current Jobs ===\n');

        // Set up periodic check for missed schedules (every 15 minutes)
        const checkInterval = 15 * 60 * 1000; // 15 minutes
        console.log(`Setting up periodic check for missed schedules every ${checkInterval/60000} minutes`);
        setInterval(checkMissedSchedules, checkInterval);
    } catch (error) {
        console.error('❌ Error initializing schedules:', error);
        console.error('Full error details:', error.stack);
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