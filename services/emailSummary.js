const { google } = require('googleapis');
const nodemailer = require('nodemailer');
const User = require('../models/user');

async function generateSummaryForUser(user) {
    const oauth2Client = new google.auth.OAuth2(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET,
        process.env.GOOGLE_REDIRECT_URI
    );

    oauth2Client.setCredentials(user.gmailToken);

    // Check if token needs refresh
    if (user.gmailToken.expiry_date < Date.now()) {
        try {
            const { tokens } = await oauth2Client.refreshToken(user.gmailToken.refresh_token);
            user.gmailToken = tokens;
            await user.save();
            oauth2Client.setCredentials(tokens);
        } catch (error) {
            console.error(`Token refresh failed for user ${user.email}:`, error);
            return;
        }
    }

    const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

    try {
        // Build query based on user preferences
        const categoryQueries = user.preferences.categories
            .map(cat => `category:${cat}`)
            .join(' OR ');
        
        const lookbackDays = user.preferences.lookbackDays || 1;
        const query = `is:unread (${categoryQueries}) newer_than:${lookbackDays}d`;

        const response = await gmail.users.messages.list({
            userId: 'me',
            q: query
        });

        const messages = response.data.messages || [];
        let summary = `You have ${messages.length} unread emails from the last ${lookbackDays} day(s):\n\n`;

        for (const message of messages) {
            const email = await gmail.users.messages.get({
                userId: 'me',
                id: message.id
            });

            const subject = email.data.payload.headers.find(header => header.name === 'Subject')?.value || 'No Subject';
            const from = email.data.payload.headers.find(header => header.name === 'From')?.value || 'Unknown Sender';
            const snippet = email.data.snippet;

            summary += `From: ${from}\nSubject: ${subject}\nPreview: ${snippet}\n\n`;
        }

        // Send summary email
        const transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: {
                user: process.env.EMAIL_SENDER,
                pass: process.env.EMAIL_PASSWORD
            }
        });

        await transporter.sendMail({
            from: process.env.EMAIL_SENDER,
            to: user.summaryEmail,
            subject: `Your Daily Email Summary (${messages.length} unread)`,
            text: summary
        });

        console.log(`Summary sent successfully to ${user.summaryEmail}`);
    } catch (error) {
        console.error(`Error processing summary for user ${user.email}:`, error);
    }
}

async function processAllUsers() {
    try {
        const users = await User.find({});
        console.log(`Processing summaries for ${users.length} users`);
        
        for (const user of users) {
            await generateSummaryForUser(user);
        }
    } catch (error) {
        console.error('Error processing users:', error);
    }
}

async function generatePreviewForUser(user) {
    const oauth2Client = new google.auth.OAuth2(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET,
        process.env.GOOGLE_REDIRECT_URI
    );

    oauth2Client.setCredentials(user.gmailToken);

    // Check if token needs refresh
    if (user.gmailToken.expiry_date < Date.now()) {
        try {
            const { tokens } = await oauth2Client.refreshToken(user.gmailToken.refresh_token);
            user.gmailToken = tokens;
            await user.save();
            oauth2Client.setCredentials(tokens);
        } catch (error) {
            throw new Error('Failed to refresh token');
        }
    }

    const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

    try {
        // Build query based on user preferences
        const categoryQueries = user.preferences.categories
            .map(cat => `category:${cat}`)
            .join(' OR ');
        
        const lookbackDays = user.preferences.lookbackDays || 1;
        const query = `is:unread (${categoryQueries}) newer_than:${lookbackDays}d`;

        const response = await gmail.users.messages.list({
            userId: 'me',
            q: query
        });

        const messages = response.data.messages || [];
        const preview = {
            totalEmails: messages.length,
            lookbackDays,
            categories: user.preferences.categories,
            deliveryTime: user.preferences.deliveryTime,
            summaryEmail: user.summaryEmail,
            sampleEmails: []
        };

        // Get details for up to 3 emails as a sample
        const sampleSize = Math.min(messages.length, 3);
        for (let i = 0; i < sampleSize; i++) {
            const email = await gmail.users.messages.get({
                userId: 'me',
                id: messages[i].id
            });

            preview.sampleEmails.push({
                from: email.data.payload.headers.find(header => header.name === 'From')?.value || 'Unknown Sender',
                subject: email.data.payload.headers.find(header => header.name === 'Subject')?.value || 'No Subject',
                snippet: email.data.snippet
            });
        }

        return preview;
    } catch (error) {
        throw new Error('Failed to generate preview');
    }
}

module.exports = {
    generateSummaryForUser,
    processAllUsers,
    generatePreviewForUser
}; 