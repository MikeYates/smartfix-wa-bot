require('dotenv').config();
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const express = require('express');
const moment = require('moment-timezone');
const OpenAI = require('openai');
const chromium = require('chrome-aws-lambda');
const puppeteer = require('puppeteer-core');

const app = express();
const port = process.env.PORT || 8080;

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const unknownReplies = new Set();

function isBusinessOpen() {
  const now = moment().tz('Asia/Makassar');
  const day = now.day();
  const hour = now.hour();
  return day !== 0 && hour >= 9 && hour < 20;
}

async function startClient() {
  const executablePath = await chromium.executablePath;

  const client = new Client({
    authStrategy: new LocalAuth({
      clientId: 'default',
      dataPath: '/wwebjs_data'
    }),
    puppeteer: {
      executablePath,
      args: chromium.args,
      headless: chromium.headless
    }
  });

  client.on('qr', (qr) => {
    qrcode.generate(qr, { small: true });
    console.log('Scan the QR code above with your WhatsApp mobile app.');
  });

  client.on('ready', () => {
    console.log('WhatsApp client is ready!');
  });

  client.on('message', async msg => {
    const from = msg.from;
    const allowedNumber = '6285190338194@c.us';

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
        return;
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

  await client.initialize();
}

startClient().catch(err => {
  console.error('Failed to start WhatsApp client:', err);
});

app.get('/', (req, res) => {
  res.send('WhatsApp ChatGPT bot is running');
});

app.listen(port, () => {
  console.log(`Express server listening on port ${port}`);
});