import OpenAI from "openai";
require("dotenv").config();

async function main() {

  const OAIClient = new OpenAI({
    ...(process.env.OPENAI_API_KEY ? { apiKey: process.env.OPENAI_API_KEY } : { apiKey: ""}),
    baseURL: "http://localhost:8080/v1",
  });

  const models = await OAIClient.models.list();
  console.log("Available models:", models.data.map(m => m.id));

  const chatResponse = await OAIClient.chat.completions.create({
    model: models.data[0].id,
    messages: [
      { role: "system", content: "You are a helpful assistant." },
      { role: "user", content: "look up what PolarLearn is online" }
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