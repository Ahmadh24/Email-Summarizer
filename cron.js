const cron = require('node-cron');
const { generateSummaryForUser } = require('./services/emailSummary');
const User = require('./models/user');

// Check every hour
cron.schedule('0 * * * *', async () => {
    const currentHour = new Date().getHours();
    console.log(`Checking for summaries to send at ${currentHour}:00`);

    try {
        // Find users who want their summary at this hour
        const users = await User.find({ 'preferences.deliveryTime': currentHour });
        console.log(`Found ${users.length} users scheduled for ${currentHour}:00`);

        for (const user of users) {
            await generateSummaryForUser(user);
        }
    } catch (error) {
        console.error('Error processing scheduled summaries:', error);
    }
}); 