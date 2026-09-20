// Thin wrapper around Groq's OpenAI-compatible chat completions endpoint.
// The API key stays server-side (process.env.GROQ_API_KEY) so it never
// reaches the browser bundle.

const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";

// llama-3.3-70b-versatile is Groq's current general-purpose flagship model
// and is available on Groq's free tier. Overridable via env without a
// code change if Groq renames/retires a model.
const DEFAULT_MODEL = process.env.GROQ_MODEL || "llama-3.3-70b-versatile";

const SYSTEM_PROMPT =
  "You are a friendly, helpful AI assistant built into the Golpo chat app. " +
  "Reply the way you would in a chat conversation: concise and conversational " +
  "by default, going into more depth only when the user's question calls for it.";

export function isGroqConfigured() {
  return Boolean(process.env.GROQ_API_KEY);
}

// `messages` is an array of { role: "user" | "assistant", content: string },
// oldest first. Returns the assistant's reply text, or throws on failure.
export async function getGroqChatReply(messages) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    throw new Error("GROQ_API_KEY is not configured on the server");
  }

  const response = await fetch(GROQ_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: DEFAULT_MODEL,
      messages: [{ role: "system", content: SYSTEM_PROMPT }, ...messages],
      temperature: 0.7,
      max_tokens: 1024,
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text().catch(() => "");
    throw new Error(`Groq API error (${response.status}): ${errorBody}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content?.trim();

  if (!content) {
    throw new Error("Groq API returned an empty response");
  }

  return content;
}
