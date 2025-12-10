import OpenAI from "openai";
require("dotenv").config();

async function main() {

  const OAIClient = new OpenAI({
    apiKey: process.env.API_KEY,
  });

  // const models = await OAIClient.models.list();
  // console.log("Available models:", models.data.map(m => m.id));

  const chatResponse = await OAIClient.chat.completions.create({
    model: process.env.MODEL || "gpt-5-mini",
    messages: [
      { role: "system", content: "You are a helpful assistant." },
      { role: "user", content: "hallo chatgpt" }
    ],
    stream: true
  });

  for await (const chunk of chatResponse) {
    const content = chunk.choices[0]?.delta?.content;
    if (content) {
      process.stdout.write(content);
    }
  }
  console.log();
}

main().catch(console.error);