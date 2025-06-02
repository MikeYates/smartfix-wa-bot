require('dotenv').config();
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const express = require('express');
const moment = require('moment-timezone');
const OpenAI = require('openai'); // NEW client for v4.104.0

const app = express();
const port = process.env.PORT || 8080;

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Setup WhatsApp client with persistent auth, specifying dataPath for Fly.io volume
const client = new Client({
  authStrategy: new LocalAuth({
    clientId: 'default',        // optional but useful if multiple clients
    dataPath: '/wwebjs_data'    // must match Fly.io volume mount path
  })
});

// Track unknown replies to prevent repeat fallback responses
const unknownReplies = new Set();

// Generate QR code for WhatsApp login
client.on('qr', (qr) => {
  qrcode.generate(qr, { small: true });
  console.log('Scan the QR code above with your WhatsApp mobile app.');
});

// Log ready message
client.on('ready', () => {
  console.log('WhatsApp client is ready!');
});

// Helper: check if business is open
function isBusinessOpen() {
  const now = moment().tz('Asia/Makassar'); // GMT+8
  const day = now.day(); // Sunday = 0
  const hour = now.hour();
  return day !== 0 && hour >= 9 && hour < 20;
}

// Message handler
client.on('message', async msg => {
  const from = msg.from;
  const allowedNumber = '6285190338194@c.us'; // Format used by whatsapp-web.js

  if (from !== allowedNumber) {
    console.log(`Blocked message from unauthorized number: ${from}`);
    return;
  }

  const text = msg.body.trim();
  console.log(`Received message from ${from}: ${text}`);

  const prompt = text;

  try {
    const nowOpen = isBusinessOpen();
    const messages = [
      {
        role: 'system',
        content: `
You are a helpful AI bot for Smartfix Repair, a phone repair business specializing in Apple products, primarily iPhones. 
The shop is located at Jalan Majapahit No. 83, Kuta, Badung, Bali. Google Maps: https://maps.app.goo.gl/E6nHaKsVpRnP9Vd39

Only reply if the question can be answered with available knowledge. If the question cannot be answered, follow these rules:
- If it is during business hours (9 AM – 8 PM, daily except Sunday), say: "Thank you for your message. As an AI assistant, I currently do not have access to the specific information you’re requesting. Our team will follow up with you once we resume business hours."
- If it is outside business hours, say: "Thank you for your message. As an AI assistant, I currently do not have access to the specific information you’re requesting. Our team will follow up with you once we reopen."

Always reply in the user's language. Be polite but not overly formal. Add "**- Smartfix AI Customer Service**" at the end of each reply.

Do not mention operating hours unless explicitly asked. If the user repeats a question that you couldn't answer before, do not reply again.
        `.trim()
      },
      {
        role: 'user',
        content: prompt
      }
    ];

    const response = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages,
      max_tokens: 200,
    });

    const answer = response.choices[0].message.content.trim();

    if (
      answer.includes("our team will follow up") &&
      unknownReplies.has(from)
    ) {
      return; // Don't repeat fallback message
    }

    if (answer.includes("our team will follow up")) {
      unknownReplies.add(from);
    }

    await msg.reply(answer);
    console.log('Sent reply:', answer);
  } catch (error) {
    console.error('OpenAI API error:', error);
    await msg.reply('Sorry, something went wrong while processing your message.');
  }
});

// Start WhatsApp client
client.initialize();

// Health check endpoint for Render
app.get('/', (req, res) => {
  res.send('WhatsApp ChatGPT bot is running');
});

// Start HTTP server
app.listen(port, () => {
  console.log(`Express server listening on port ${port}`);
});