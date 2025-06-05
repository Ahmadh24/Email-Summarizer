const OpenAI = require('openai');

// Initialize OpenAI client
const openai = new OpenAI(process.env.OPENAI_API_KEY);

async function summarizeEmails(emails) {
    try {
        const emailsContext = emails.map(email => `
From: ${email.from}
Subject: ${email.subject}
Content: ${email.snippet}
        `).join('\n---\n');

        const response = await openai.chat.completions.create({
            model: "gpt-3.5-turbo",
            messages: [
                {
                    role: "system",
                    content: "You are a helpful email assistant. Analyze the provided emails and create a concise summary that includes:\n" +
                            "1. Key action items or important deadlines\n" +
                            "2. Main topics or themes\n" +
                            "3. Priority level for each email (High/Medium/Low)\n" +
                            "Format the summary in a clear, easy-to-read way."
                },
                {
                    role: "user",
                    content: `Please summarize these emails:\n\n${emailsContext}`
                }
            ],
            temperature: 0.7,
            max_tokens: 500
        });

        return response.choices[0].message.content;
    } catch (error) {
        console.error('Error in OpenAI summarization:', error);
        throw new Error('Failed to generate AI summary');
    }
}

module.exports = {
    summarizeEmails
}; 