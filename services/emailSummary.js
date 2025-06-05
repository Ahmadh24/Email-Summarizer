const { google } = require('googleapis');
const nodemailer = require('nodemailer');
const User = require('../models/user');
const { summarizeEmails } = require('./openai');

async function generateSummaryForUser(user) {
    const oauth2Client = new google.auth.OAuth2(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET,
        process.env.GOOGLE_REDIRECT_URI
    );

    if (!user.gmailToken) {
        throw new Error('No Gmail token found for user');
    }

    oauth2Client.setCredentials(user.gmailToken);

    // Check if token needs refresh
    if (!user.gmailToken.refresh_token) {
        console.error('No refresh token available for user:', user.email);
        throw new Error('No refresh token available. Please re-authenticate.');
    }

    if (user.gmailToken.expiry_date < Date.now()) {
        try {
            console.log('Refreshing token for user:', user.email);
            const { tokens } = await oauth2Client.refreshToken(user.gmailToken.refresh_token);
            user.gmailToken = tokens;
            await user.save();
            oauth2Client.setCredentials(tokens);
            console.log('Token refreshed successfully for user:', user.email);
        } catch (error) {
            console.error(`Token refresh failed for user ${user.email}:`, error);
            throw new Error('Failed to refresh token. Please re-authenticate.');
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
        let emailDetails = [];

        // Collect email details for AI summarization
        for (const message of messages) {
            const email = await gmail.users.messages.get({
                userId: 'me',
                id: message.id
            });

            emailDetails.push({
                from: email.data.payload.headers.find(header => header.name === 'From')?.value || 'Unknown Sender',
                subject: email.data.payload.headers.find(header => header.name === 'Subject')?.value || 'No Subject',
                snippet: email.data.snippet || 'No preview available'
            });
        }

        // Generate basic stats
        const basicStats = `📊 Email Summary Stats:
• Total unread emails: ${messages.length}
• Time period: Last ${lookbackDays} day(s)
• Categories: ${user.preferences.categories.join(', ')}
`;

        // Get AI-powered summary if there are emails
        let aiSummary = '';
        if (emailDetails.length > 0) {
            try {
                aiSummary = await summarizeEmails(emailDetails);
            } catch (error) {
                console.error('AI summarization failed, falling back to basic summary:', error);
                // Fallback to basic summary if AI fails
                aiSummary = emailDetails.map(email => 
                    `From: ${email.from}\nSubject: ${email.subject}\nPreview: ${email.snippet}`
                ).join('\n\n');
            }
        }

        // Combine summaries
        const finalSummary = `${basicStats}\n\n${aiSummary}`;

        // Send summary email using nodemailer
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
            subject: `📬 Your AI Email Summary (${messages.length} unread)`,
            text: finalSummary
        });

        console.log(`Summary sent successfully to ${user.summaryEmail}`);
    } catch (error) {
        console.error(`Error processing summary for user ${user.email}:`, error);
        throw error; // Re-throw the error so it can be caught by the caller
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

    if (!user.gmailToken) {
        throw new Error('No Gmail token found for user');
    }

    oauth2Client.setCredentials(user.gmailToken);

    // Check if token needs refresh
    if (!user.gmailToken.refresh_token) {
        console.error('No refresh token available for user:', user.email);
        throw new Error('No refresh token available. Please re-authenticate.');
    }

    if (user.gmailToken.expiry_date < Date.now()) {
        try {
            console.log('Refreshing token for user:', user.email);
            const { tokens } = await oauth2Client.refreshToken(user.gmailToken.refresh_token);
            user.gmailToken = tokens;
            await user.save();
            oauth2Client.setCredentials(tokens);
            console.log('Token refreshed successfully for user:', user.email);
        } catch (error) {
            console.error(`Token refresh failed for user ${user.email}:`, error);
            throw new Error('Failed to refresh token. Please re-authenticate.');
        }
    }

    const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

    try {
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
        const emailDetails = [];

        // Get details for up to 3 emails as a sample
        const sampleSize = Math.min(messages.length, 3);
        for (let i = 0; i < sampleSize; i++) {
            const email = await gmail.users.messages.get({
                userId: 'me',
                id: messages[i].id
            });

            emailDetails.push({
                from: email.data.payload.headers.find(header => header.name === 'From')?.value || 'Unknown Sender',
                subject: email.data.payload.headers.find(header => header.name === 'Subject')?.value || 'No Subject',
                snippet: email.data.snippet || 'No preview available'
            });
        }

        // Generate AI summary for preview
        let aiSummary = '';
        if (emailDetails.length > 0) {
            try {
                aiSummary = await summarizeEmails(emailDetails);
            } catch (error) {
                console.error('AI summarization failed for preview:', error);
                aiSummary = 'AI summarization preview not available. Please check your OpenAI API key.';
            }
        }

        return {
            totalEmails: messages.length,
            lookbackDays,
            categories: user.preferences.categories,
            deliveryTime: user.preferences.deliveryTime,
            summaryEmail: user.summaryEmail,
            sampleSummary: aiSummary,
            sampleEmails: emailDetails
        };
    } catch (error) {
        throw new Error('Failed to generate preview');
    }
}

module.exports = {
    generateSummaryForUser,
    processAllUsers,
    generatePreviewForUser
}; 