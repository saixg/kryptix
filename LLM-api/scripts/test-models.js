import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';

dotenv.config();

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const modelsToTest = ['gemini-3.8-flash', 'gemini-3.5-flash-lite', 'gemini-3.1-flash-lite'];

async function run() {
  for (const model of modelsToTest) {
    console.log(`\nTesting model: ${model}...`);
    try {
      const res = await ai.models.generateContent({
        model,
        contents: 'Hello! Respond with "Connection Verified" and your model name in one short sentence.',
      });
      console.log(`✅ SUCCESS [${model}]: ${res.text?.trim()}`);
      return model;
    } catch (err) {
      console.log(`❌ FAILED [${model}]: Status=${err.status} Message=${err.message}`);
    }
  }
}

run().then(workingModel => {
  if (workingModel) {
    console.log(`\n🎉 Best working model: ${workingModel}`);
  } else {
    console.log('\n⚠️ None of the tested models responded successfully.');
  }
  process.exit(0);
});

