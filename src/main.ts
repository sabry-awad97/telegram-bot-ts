import TelegramBot from "node-telegram-bot-api";
import { z } from "zod";
import { CommandHandler } from "./commandHandler";
import { loadEnv } from "./util";

loadEnv();

const TELEGRAM_BOT_TOKEN = z.string().parse(process.env.TELEGRAM_BOT_TOKEN);
const bot = new TelegramBot(TELEGRAM_BOT_TOKEN, { polling: true });

const commandHandler = new CommandHandler(bot);

commandHandler.addCommand({
  name: "survey",
  description: "Take a simple survey",
  prompts: [
    {
      type: "input",
      name: "name",
      message: "What's your name?",
    },
    {
      type: "number",
      name: "age",
      message: "How old are you?",
      validate: (value) => {
        const age = Number(value);
        return (
          (age >= 0 && age <= 120) ||
          "Please enter a valid age between 0 and 120."
        );
      },
    },
    {
      type: "list",
      name: "color",
      message: "What is your favorite color?",
      choices: ["Red", "Blue", "Green", "Yellow"],
    },
    {
      type: "confirm",
      name: "likesIceCream",
      message: "Do you like ice cream?",
    },
    {
      type: "checkbox",
      name: "hobbies",
      message: "Select your hobbies (comma-separated):",
      choices: ["Reading", "Gaming", "Sports", "Cooking", "Traveling"],
    },
  ],
});

console.log("Bot is running...");
