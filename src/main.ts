import TelegramBot from "node-telegram-bot-api";
import { z } from "zod";
import { CommandHandler } from "./commandHandler";
import { loadEnv } from "./util";

loadEnv();

const TELEGRAM_BOT_TOKEN = z.string().parse(process.env.TELEGRAM_BOT_TOKEN);
const bot = new TelegramBot(TELEGRAM_BOT_TOKEN, {
  polling: { interval: 1000 },
});

const commandHandler = new CommandHandler(bot);

commandHandler.addCommand({
  name: "create_product",
  description: "Create a new product",
  isPrivate: true,
  category: "Inventory",
  prompts: [
    {
      type: "text",
      name: "productName",
      message: "What's the name of the product?",
      help: "Provide a name for the product.",
    },
    {
      type: "text",
      name: "productDescription",
      message: "Describe the product:",
      help: "Provide a brief description of the product.",
    },
    {
      type: "number",
      name: "productPrice",
      message: "What is the price of the product?",
      help: "Enter the price of the product.",
    },
    {
      type: "number",
      name: "productStock",
      message: "How many units are in stock?",
      help: "Enter the number of units currently in stock.",
    },
    {
      type: "text",
      name: "productCategory",
      message: "Which category does the product belong to?",
      help: "Specify the category of the product.",
    },
  ],
  handler: async ({ bot, chatId, answers }) => {
    const {
      productName,
      productDescription,
      productPrice,
      productStock,
      productCategory,
    } = answers as {
      productName: string;
      productDescription: string;
      productPrice: number;
      productStock: number;
      productCategory: string;
    };

    const summary = `
🛒 New Product Created! 🛒

**Product Name:** ${productName}
**Description:** ${productDescription}
**Price:** $${productPrice.toFixed(2)}
**Stock Quantity:** ${productStock}
**Category:** ${productCategory}

Thank you for adding a new product! 🎉
    `;

    await bot.sendMessage(chatId, summary, { parse_mode: "Markdown" });
  },
});

commandHandler.addCommand({
  name: "stats",
  description: "View bot statistics",
  isPrivate: true,
  category: "General",
  prompts: [],
  handler: async ({ bot, chatId }) => {
    const stats = await bot.getMe();
    await bot.sendMessage(chatId, `Bot stats:\n${JSON.stringify(stats)}`);
  },
});

console.log("🤖 Bot is running...");
