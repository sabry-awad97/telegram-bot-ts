import "dotenv/config";
import { z } from "zod";
import Bot from "./bot";

const TELEGRAM_BOT_TOKEN = z.string().parse(process.env.TELEGRAM_BOT_TOKEN);
const TELEGRAM_CHAT_ID = z.coerce.number().parse(process.env.TELEGRAM_CHAT_ID);

const bot = new Bot(TELEGRAM_BOT_TOKEN);

bot.command({
  name: "start",
  description: "Start the registration process",
  prompts: [
    {
      key: "name",
      text: "What's your name?",
      schema: z.string().min(1, "Name cannot be empty"),
    },
    {
      key: "age",
      text: "How old are you?",
      schema: z.coerce.number().int().positive().max(120),
    },
    {
      key: "email",
      text: "What's your email address?",
      schema: z.string().email(),
    },
  ] as const,
});

bot.command({
  name: "status",
  description: "Update your current status",
  prompts: [
    {
      key: "status",
      text: "Please enter your current status (Pending, Processing, or Completed):",
      schema: z.enum(["Pending", "Processing", "Completed"]),
    },
  ],
});

bot
  .executeCommand("start", TELEGRAM_CHAT_ID)
  .then((responses) => {
    console.log("User responses:", responses);
  })
  .catch((error) => {
    console.error("Error executing command:", error);
  });

console.log("Bot is running...");
