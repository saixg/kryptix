import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';

dotenv.config();

const apiKey = process.env.GEMINI_API_KEY;
console.log(`API Key loaded: ${apiKey ? apiKey.slice(0, 8) + '...' + apiKey.slice(-4) : 'MISSING'}`);

const ai = new GoogleGenAI({ apiKey });

async function testInteractions() {
  console.log('Calling ai.interactions.create with gemini-3.8-flash...');
  const startTime = Date.now();
  
  try {
    const interaction = await ai.interactions.create({
      model: 'gemini-3.8-flash',
      input: 'Hello! Respond with: "Gemini is online and ready."',
    });

    console.log(`✅ Success in ${Date.now() - startTime}ms!`);
    console.log(`🤖 Output: ${interaction.output_text}`);
  } catch (err) {
    console.log(`❌ Failed in ${Date.now() - startTime}ms:`, err.status, err.message);
  }
}

testInteractions().then(() => process.exit(0));

