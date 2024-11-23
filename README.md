# Email Summarizer Automation

A Node.js automation script that summarizes unread emails from your Gmail account and sends a daily summary email.
![emailsummary](https://github.com/user-attachments/assets/edb46538-56bd-4679-9729-18abc0d643f0)

## Features
- Summarizes unread Gmail emails from the last 24 hours.
- Filters emails by category (Primary inbox).


- Sends a summary email with sender, subject, and snippet.
- Runs automatically every day at a specified time using a cron job.

## Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/username/Email-Summarizer.git
   cd Email-Summarizer

1. Clone the repository:
   ```bash
   git clone https://github.com/username/Email-Summarizer.git
   cd Email-Summarizer
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Create a `.env` file for your environment variables:
   ```markdown
   EMAIL=your-email@gmail.com
   PASSWORD=your-email-password-or-app-specific-password
   SUMMARY_EMAIL=recipient-email@example.com
   ```

4. Obtain `credentials.json` by setting up a project on [Google Cloud Console](https://console.cloud.google.com/), enabling the Gmail API, and creating OAuth 2.0 credentials.
  ## Usage

- To run the script manually:
  ```bash
  node index.js
  ```

- The script is scheduled to run every day at 11:00 AM using a cron job. Ensure your local or server environment stays active for the schedule to work.
  ## Security Best Practices

- Ensure your `.env`, `credentials.json`, and other sensitive files are added to `.gitignore` to prevent them from being pushed to GitHub.
- Regenerate OAuth credentials if they are exposed and use environment variables for sensitive data.
  ## Acknowledgements

- [Google APIs Node.js Client](https://github.com/googleapis/google-api-nodejs-client)
- [Node.js](https://nodejs.org/)
- [Nodemailer](https://nodemailer.com/about/)
