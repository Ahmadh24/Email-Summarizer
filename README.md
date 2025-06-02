# Email Summarizer

An automated email summary service that sends daily digests of your unread emails at your preferred time.

## Features

- Google OAuth integration for secure email access
- Customizable delivery times
- Filter emails by category (Primary, Social, Promotions)
- Adjustable lookback period
- Preview summaries before scheduling
- Test summary delivery
- Modern, responsive UI

## Environment Variables

Create a `.env` file with the following variables:

```env
MONGODB_URI=your_mongodb_uri
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret
GOOGLE_REDIRECT_URI=https://your-domain/auth/gmail/callback
SESSION_SECRET=your_session_secret
```

## Local Development

1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   ```
3. Set up environment variables in `.env`
4. Run the development server:
   ```bash
   npm run dev
   ```

## Deployment

This application can be deployed to any Node.js hosting platform. Make sure to:

1. Set all required environment variables
2. Configure MongoDB connection
3. Update Google OAuth redirect URI to match your domain
4. Ensure Node.js version >= 18.0.0

## Tech Stack

- Node.js
- Express.js
- MongoDB
- EJS Templates
- Tailwind CSS
- Google Gmail API
- Node Schedule
