import "dotenv/config";
import { z } from "zod";
import Bot from "./bot";

const TELEGRAM_BOT_TOKEN = z.string().parse(process.env.TELEGRAM_BOT_TOKEN);

const bot = new Bot(TELEGRAM_BOT_TOKEN);

// Define prompts for the /specialorder_create command
bot.command("/specialorder_create", [
  {
    key: "name",
    text: "Let's begin! What's your name?",
    validate: (input: string) => {
      if (input.trim().length === 0) {
        return { valid: false, message: "Name cannot be empty" };
      }
      return { valid: true };
    },
  },
  {
    key: "status",
    text: "What is the status of the order? (Pending/Processing/Completed)",
    validate: (input: string) => {
      const validStatuses = ["Pending", "Processing", "Completed"];
      if (!validStatuses.includes(input)) {
        return {
          valid: false,
          message:
            "Invalid status. Please enter Pending, Processing, or Completed.",
        };
      }
      return { valid: true };
    },
  },
  {
    key: "notes",
    text: "Any notes for this order?",
    validate: (input: string) => {
      return { valid: true };
    },
  },
]);
