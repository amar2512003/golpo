import { getGroqChatReply, isGroqConfigured } from "../lib/groq.js";

// Keep the round-trip to Groq bounded — recent context is enough for a
// chatty assistant and keeps latency/cost predictable.
const MAX_HISTORY_MESSAGES = 20;
const MAX_MESSAGE_LENGTH = 4000;

export async function sendAiMessage(req, res) {
  try {
    if (!isGroqConfigured()) {
      res.status(503).json({
        message: "The AI assistant isn't configured yet. Add GROQ_API_KEY to the backend .env.",
      });
      return;
    }

    const { messages } = req.body;

    if (!Array.isArray(messages) || messages.length === 0) {
      res.status(400).json({ message: "messages array is required" });
      return;
    }

    const sanitizedHistory = messages
      .filter(
        (message) =>
          message &&
          typeof message.content === "string" &&
          message.content.trim().length > 0 &&
          (message.role === "user" || message.role === "assistant"),
      )
      .slice(-MAX_HISTORY_MESSAGES)
      .map((message) => ({
        role: message.role,
        content: message.content.slice(0, MAX_MESSAGE_LENGTH),
      }));

    if (sanitizedHistory.length === 0) {
      res.status(400).json({ message: "No valid messages provided" });
      return;
    }

    const replyContent = await getGroqChatReply(sanitizedHistory);

    res.status(200).json({ message: { role: "assistant", content: replyContent } });
  } catch (error) {
    console.error("Error in sendAiMessage:", error.message);
    res.status(500).json({ message: "The AI assistant is unavailable right now" });
  }
}
