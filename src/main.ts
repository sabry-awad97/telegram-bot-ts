import "dotenv/config";
import { z } from "zod";
import Bot from "./bot";

const TELEGRAM_BOT_TOKEN = z.string().parse(process.env.TELEGRAM_BOT_TOKEN);

var bot = new Bot(TELEGRAM_BOT_TOKEN);
bot.start();
