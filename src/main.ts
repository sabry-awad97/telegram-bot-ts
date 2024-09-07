import "dotenv/config";
import { z } from "zod";
import Bot from "./bot";

const TELEGRAM_BOT_TOKEN = z.string().parse(process.env.TELEGRAM_BOT_TOKEN);
const TELEGRAM_CHAT_ID = z.coerce.number().parse(process.env.TELEGRAM_CHAT_ID);

const bot = new Bot(TELEGRAM_BOT_TOKEN);

const customerInfoSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
});

const orderItemSchema = z.object({
  productName: z.string().min(1),
  quantity: z.number().int().positive(),
});

const specialOrderSchema = z.object({
  customerInfo: customerInfoSchema,
  items: z.array(orderItemSchema).min(1),
  status: z.enum(["Pending", "Processing", "Completed"]),
  fulfillmentDate: z.date(),
  notes: z.string().nullable(),
});

bot.schema(customerInfoSchema).command({
  title: "Customer Info",
  description: "Enter customer information",
  prompts: [
    {
      key: "name",
      text: "What is the customer's name?",
      help: "Enter the customer's full name (at least 2 characters).",
    },
    {
      key: "email",
      text: "What is the customer's email?",
      help: "Enter a valid email address.",
    },
  ],
});

bot.schema(orderItemSchema).command({
  title: "Order Item",
  description: "Enter an order item",
  prompts: [
    {
      key: "productName",
      text: "What is the product name?",
      help: "Enter the name of the product (non-empty).",
    },
    {
      key: "quantity",
      text: "How many units?",
      help: "Enter a positive integer.",
      parser: (input) => parseInt(input, 10),
    },
  ],
});

bot.schema(specialOrderSchema).command({
  title: "Special Order",
  description: "Create a new special order",
  prompts: [
    {
      key: "customerInfo",
      text: "Let's start with customer information.",
      parser: async () => {
        const result = await bot.exec("customer_info", TELEGRAM_CHAT_ID);
        return result;
      },
    },
    {
      key: "items",
      text: "Now, let's add items to the order. How many items?",
      help: "Enter the number of items you want to add to the order.",
      parser: async (input: string) => {
        const count = parseInt(input, 10);
        const items = [];
        for (let i = 0; i < count; i++) {
          const item = await bot.exec("order_item", TELEGRAM_CHAT_ID);
          items.push(item);
        }
        return items;
      },
    },
    {
      key: "status",
      text: "What is the order status? (Pending/Processing/Completed)",
      help: "Choose one of the following: Pending, Processing, or Completed.",
    },
    {
      key: "fulfillmentDate",
      text: "What is the fulfillment date? (YYYY-MM-DD)",
      help: "Enter the date in YYYY-MM-DD format. For example: 2023-05-15",
      parser: (input) => new Date(input),
    },
    {
      key: "notes",
      text: "Any additional notes? (Type 'none' if no notes)",
      help: "You can enter any additional information about the order here. If there are no notes, just type 'none'.",
      parser: (input) => (input.toLowerCase() === "none" ? null : input),
    },
  ],
  execute: async (responses) => {
    console.log("Special order created:", responses);
    // Here you can add logic to save the order to a database, etc.
  },
});

bot
  .exec("special_order", TELEGRAM_CHAT_ID)
  .then((response) => console.log("Response:", response));
console.log("Bot is running...");
