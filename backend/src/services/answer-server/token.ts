import OpenAI from "openai";

export async function generateToken() {
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  const session = await openai.realtime.clientSecrets.create({ session: { type: "realtime", model: "gpt-realtime" } });

  return session.value;
}
