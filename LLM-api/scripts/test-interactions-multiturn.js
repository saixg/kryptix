import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';

dotenv.config();

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

async function run() {
  const result = await ai.interactions.create({
    model: 'gemini-3.5-flash-lite',
    input: 'User: My name is Alex.\nAssistant: Nice to meet you Alex.\nUser: What is my name?',
    system_instruction: 'You are Aria, an elite systems architect. Answer concisely.',
  });
  console.log('Result:', result.output_text);
  console.log('Usage:', JSON.stringify(result.usage));
  process.exit(0);
}

run().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});

