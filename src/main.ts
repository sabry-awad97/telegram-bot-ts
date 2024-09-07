import { z } from "zod";
import Bot from "./bot";
import { loadEnv } from "./util";

loadEnv();

const TELEGRAM_BOT_TOKEN = z.string().parse(process.env.TELEGRAM_BOT_TOKEN);
const TELEGRAM_CHAT_ID = z.coerce.number().parse(process.env.TELEGRAM_CHAT_ID);

const bot = new Bot(TELEGRAM_BOT_TOKEN);

const customerInfoSchema = z.object({
  name: z.string(),
  email: z.string(),
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
  isPublic: false,
  title: "Customer Info",
  description: "Provide customer information 📇",
  prompts: [
    {
      key: "name",
      text: "👤 *Customer Name*: Please provide the full name of the customer (minimum 2 characters).",
      help: "📝 Make sure to enter at least 2 characters for the customer's full name.",
    },
    {
      key: "email",
      text: "📧 *Customer Email*: Please provide a valid email address.",
      help: "✉️ Ensure the email address is correct to avoid communication issues.",
    },
  ],
});

bot.schema(orderItemSchema).command({
  isPublic: true,
  title: "Order Item",
  description: "Add an item to the order 📦",
  prompts: [
    {
      key: "productName",
      text: "🛍️ *Product Name*: What is the name of the product you would like to order?",
      help: "🔖 Please make sure the product name is not empty.",
    },
    {
      key: "quantity",
      text: "🔢 *Quantity*: How many units would you like to order?",
      help: "➕ Please provide a positive integer representing the number of units.",
    },
  ],
});

bot.schema(specialOrderSchema).command({
  isPublic: true,
  title: "Special Order",
  description: "Create a special order 📝",
  prompts: [
    {
      key: "customerInfo",
      text: "👤 *Customer Information*: Let's begin with the customer details.",
    },
    {
      key: "items",
      text: "📋 *Order Items*: How many items would you like to add to the order?",
      help: "🛒 Enter the number of items to add. You will be prompted for details on each item.",
    },
    {
      key: "status",
      text: "📌 *Order Status*: What is the current status of the order? _(Pending, Processing, Completed)_",
      help: "❗ Choose one of the following: *Pending*, *Processing*, or *Completed*.",
    },
    {
      key: "fulfillmentDate",
      text: "📅 *Fulfillment Date*: When will the order be fulfilled? _(YYYY-MM-DD)_",
      help: "🗓️ Please provide the fulfillment date in the format: `YYYY-MM-DD`. Example: *2023-05-15*.",
    },
    {
      key: "notes",
      text: "📝 *Additional Notes*: Any special instructions or notes? _(Type 'none' if there are no notes)_",
      help: "💬 You can provide any extra information or leave it blank by typing 'none'.",
    },
  ],
  execute: async (responses) => {
    console.log("Special order created:", responses);
    // Add your logic here to save the order to a database, etc.
  },
});

bot
  .exec("special_order", TELEGRAM_CHAT_ID)
  .then((response) => console.log("Response:", response));
console.log("🚀 Bot is running...");
