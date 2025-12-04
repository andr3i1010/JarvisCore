import OpenAI from "openai";
require("dotenv").config();

async function main() {
  const token = await fetch("http://localhost:8081/token", {
    body: JSON.stringify({ password: process.env.PASSWORD }),
    method: "POST",
    headers: { "Content-Type": "application/json" },
  });

  const OAIClient = new OpenAI({
    apiKey: (await token.json()).token,
    baseURL: "http://localhost:8081/v1",
  });

  const models = await OAIClient.models.list();
  console.log("Available models:", models.data.map(m => m.id));

  const chatResponse = await OAIClient.chat.completions.create({
    model: models.data[0].id,
    messages: [
      { role: "system", content: "You are a helpful assistant." },
      { role: "user", content: "How do you execute tools?" }
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