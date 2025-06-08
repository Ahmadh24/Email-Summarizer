const schedule = require('node-schedule');
const User = require('../models/user');
const { generateSummaryForUser } = require('./emailSummary');

// Store all scheduled jobs
const scheduledJobs = new Map();

// Time zone offset for Eastern Time (ET)
const TIME_ZONE = 'America/New_York';
const TIME_OPTIONS = { 
    timeZone: TIME_ZONE, 
    hour12: true,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric'
};

// Debug function to log all current jobs
function logCurrentJobs() {
    console.log('\n=== Current Jobs Status ===');
    console.log(`Total jobs in memory: ${scheduledJobs.size}`);
    scheduledJobs.forEach((job, userId) => {
        console.log(`Job for user ${userId}:`);
        console.log(`Next run: ${job.nextInvocation().toLocaleString('en-US', TIME_OPTIONS)}`);
    });
    console.log('=== End Jobs Status ===\n');
}

// Get next schedule time
function getNextScheduleTime(hours, minutes) {
    // Get current time in ET
    const now = new Date();
    console.log(`Raw current time: ${now.toISOString()}`);
    console.log(`Current time (ET): ${now.toLocaleString('en-US', TIME_OPTIONS)}`);

    // Create schedule time in ET
    const scheduleTime = new Date();
    scheduleTime.setHours(hours, minutes, 0, 0);
    console.log(`Raw target time: ${scheduleTime.toISOString()}`);
    console.log(`Target time (ET): ${scheduleTime.toLocaleString('en-US', TIME_OPTIONS)}`);

    // If the time hasn't passed for today, use today's date
    if (scheduleTime > now) {
        console.log('Scheduling for today');
        return scheduleTime;
    }

    // If the time has passed, schedule for tomorrow
    console.log('Time has passed for today, scheduling for tomorrow');
    scheduleTime.setDate(scheduleTime.getDate() + 1);
    return scheduleTime;
}

// Schedule summary for a specific user
async function scheduleForUser(user, isReschedule = false) {
    console.log('\n=== Scheduling Summary for User ===');
    console.log(`User Email: ${user.email}`);
    console.log(`Current Time (ET): ${new Date().toLocaleString('en-US', TIME_OPTIONS)}`);
    console.log(`Is Reschedule: ${isReschedule}`);
    console.log(`Process ID: ${process.pid}`);
    console.log(`Memory Usage: ${JSON.stringify(process.memoryUsage())}`);

    try {
        if (!user.preferences?.deliveryTime) {
            console.log(`❌ Cannot schedule for user ${user.email}: No delivery time preferences set`);
            return;
        }

        // Log existing jobs before cancellation
        console.log('\n=== Existing Jobs Before Cancellation ===');
        logCurrentJobs();

        // Cancel ALL existing jobs for this user
        const userId = user._id.toString();
        if (scheduledJobs.has(userId)) {
            console.log(`🔄 Cancelling existing schedule for user ${user.email}`);
            console.log(`Previous schedule: ${scheduledJobs.get(userId).nextInvocation().toLocaleString('en-US', TIME_OPTIONS)}`);
            scheduledJobs.get(userId).cancel();
            scheduledJobs.delete(userId);
            console.log('Previous schedule cancelled successfully');
        } else {
            console.log('No existing schedule found to cancel');
        }

        const { hours, minutes } = user.preferences.deliveryTime;
        console.log(`Requested delivery time: ${hours}:${minutes}`);

        // Create a rule for the schedule
        const rule = new schedule.RecurrenceRule();
        rule.tz = TIME_ZONE;
        rule.hour = hours;
        rule.minute = minutes;
        console.log(`Created schedule rule: ${hours}:${minutes} ET daily`);

        // Schedule the job
        const job = schedule.scheduleJob(rule, async () => {
            console.log(`\n=== Executing Scheduled Job ===`);
            console.log(`⏰ Triggered for ${user.email} at ${new Date().toLocaleString('en-US', TIME_OPTIONS)}`);
            console.log(`Process ID: ${process.pid}`);
            
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
            } catch (error) {
                console.error(`❌ Error in scheduled job for ${user.email}:`, error);
                console.error('Full error details:', error.stack);
            }
        });

        if (job) {
            // Store the job
            scheduledJobs.set(userId, job);
            
            // Get next invocation time
            const nextRun = job.nextInvocation();
            console.log(`✅ Schedule created successfully for ${user.email}`);
            console.log(`📅 Next execution (ET): ${nextRun.toLocaleString('en-US', TIME_OPTIONS)}`);
            
            // Store the next run time in the database
            user.nextScheduledRun = nextRun;
            await user.save();
            console.log(`💾 Saved next run time to database: ${nextRun.toLocaleString('en-US', TIME_OPTIONS)}`);
            
            // Log final job status
            console.log('\n=== Final Jobs Status After Update ===');
            logCurrentJobs();
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
    console.log(`Current time (ET): ${new Date().toLocaleString('en-US', TIME_OPTIONS)}`);
    
    try {
        // Clear all existing jobs first
        scheduledJobs.forEach(job => job.cancel());
        scheduledJobs.clear();
        console.log('Cleared all existing jobs');

        // First, check for any missed schedules
        await checkMissedSchedules();

        const users = await User.find({
            'preferences.deliveryTime': { $exists: true }
        });
        console.log(`🔄 Found ${users.length} users to schedule`);
        
        for (const user of users) {
            await scheduleForUser(user);
        }
        
        console.log('✅ Initialized all schedules');
        
        // Log final job status
        logCurrentJobs();

        // Set up periodic check for missed schedules (every 15 minutes)
        const checkInterval = 15 * 60 * 1000; // 15 minutes
        console.log(`Setting up periodic check for missed schedules every ${checkInterval/60000} minutes`);
        setInterval(checkMissedSchedules, checkInterval);
    } catch (error) {
        console.error('❌ Error initializing schedules:', error);
        console.error('Full error details:', error.stack);
    }
}

module.exports = {
    initializeSchedules,
    updateSchedule: scheduleForUser
}; 