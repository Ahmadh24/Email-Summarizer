require('dotenv').config();
const { google } = require('googleapis');
const nodemailer = require('nodemailer');
const fs = require('fs');
const { authorize } = require('./gmailAPI');
const cron = require('node-cron');

const CREDENTIALS_PATH = 'credentials.json';

// Load client secrets and authorize the app
fs.readFile(CREDENTIALS_PATH, (err, content) => {
    if (err) return console.log('Error loading client secret file:', err);
    authorize(JSON.parse(content), (auth) => {
       // runEmailSummarizer(auth);  // Call it directly to test now
        // Schedule the task to run every day at 11:00 AM after authorization
        cron.schedule('0 11 * * *', () => {
            console.log('Running daily email summarizer at 11:00 AM...');
            runEmailSummarizer(auth);  // Make sure your main function is called here
        });
        
        console.log('Scheduled email summarizer to run at 11:00 AM every day.');
        
    });
});

async function runEmailSummarizer(auth) {
    const gmail = google.gmail({ version: 'v1', auth });

    const query = 'is:unread category:primary newer_than:1d';  // Fetch unread Primary inbox emails from the last 24 hours
    console.log('Query:', query);  // Debugging

    const res = await gmail.users.messages.list({
        userId: 'me',  // Now using 'me' to refer to the authorized account
        q: query,
    });

    const messages = res.data.messages || [];

    if (messages.length) {
        let summary = `You have ${messages.length} unread emails from the Primary inbox:\n\n`;

        for (const message of messages) {
            const email = await getEmailDetails(auth, message.id);
            summary += `From: ${email.from}\nSubject: ${email.subject}\nSnippet: ${email.snippet}\n\n`;
        }

        await sendSummaryEmail(summary);
    } else {
        console.log('No unread emails.');
    }
}

async function getEmailDetails(auth, messageId) {
    const gmail = google.gmail({ version: 'v1', auth });
    const message = await gmail.users.messages.get({
        userId: 'me',
        id: messageId,
    });

    const subject = message.data.payload.headers.find(header => header.name === 'Subject')?.value || 'No Subject';
    const from = message.data.payload.headers.find(header => header.name === 'From')?.value || 'Unknown Sender';
    const snippet = message.data.snippet;

    return { subject, from, snippet };
}

async function sendSummaryEmail(summary) {
    const transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
            user: process.env.EMAIL,
            pass: process.env.PASSWORD,
        },
    });

    const mailOptions = {
        from: process.env.EMAIL,
        to: process.env.SUMMARY_EMAIL,
        subject: 'Daily Email Summary',
        text: summary,
    };

    await transporter.sendMail(mailOptions);
    console.log('Summary email sent!');
}













// require('dotenv').config();
// const { google } = require('googleapis');
// const nodemailer = require('nodemailer');
// const fs = require('fs');
// const { authorize } = require('./gmailAPI');

// const CREDENTIALS_PATH = 'credentials.json';

// fs.readFile(CREDENTIALS_PATH, (err, content) => {
//     if (err) return console.log('Error loading client secret file:', err);
//     authorize(JSON.parse(content), runEmailSummarizer);
// });

// async function runEmailSummarizer(auth) {
//     const gmail = google.gmail({ version: 'v1', auth });

//     const query = 'is:unread category:primary newer_than:1d';  // Fetch unread Primary inbox emails from the last 24 hours
//     console.log('Query:', query);  // Debugging
    
    
//     const res = await gmail.users.messages.list({
//         userId: 'ahmadhamoudeh1999@gmail.com',
//         q: query,
//     });
    

//     const messages = res.data.messages || [];

//     if (messages.length) {
//         let summary = You have ${messages.length} unread emails:\n\n;

//         for (const message of messages) {
//             const email = await getEmailDetails(auth, message.id);
//             summary += From: ${email.from}\nSubject: ${email.subject}\nSnippet: ${email.snippet}\n\n;
//         }

//         await sendSummaryEmail(summary);
//     } else {
//         console.log('No unread emails.');
//     }
// }

// async function getEmailDetails(auth, messageId) {
//     const gmail = google.gmail({ version: 'v1', auth });
//     const message = await gmail.users.messages.get({
//         userId: 'me',
//         id: messageId,
//     });

//     const subject = message.data.payload.headers.find(header => header.name === 'Subject')?.value || 'No Subject';
//     const from = message.data.payload.headers.find(header => header.name === 'From')?.value || 'Unknown Sender';
//     const snippet = message.data.snippet;

//     return { subject, from, snippet };
// }

// async function sendSummaryEmail(summary) {
//     const transporter = nodemailer.createTransport({
//         service: 'gmail',
//         auth: {
//             user: process.env.EMAIL,
//             pass: process.env.PASSWORD,
//         },
//     });

//     const mailOptions = {
//         from: process.env.EMAIL,
//         to: process.env.SUMMARY_EMAIL,
//         subject: 'Daily Email Summary',
//         text: summary,
//     };

//     await transporter.sendMail(mailOptions);
//     console.log('Summary email sent!');
// }

// const cron = require('node-cron');

// // Schedule the task to run every day at 9:00 AM
// cron.schedule('0 9 * * *', () => {
//     console.log('Running daily email summarizer...');
//     runEmailSummarizer(auth);  // Make sure your main function is called here
// });

// console.log('Scheduled email summarizer to run at 9:00 AM every day.');