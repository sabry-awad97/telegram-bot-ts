import TelegramBot from "node-telegram-bot-api";
import { z } from "zod";
import { CommandHandler } from "./commandHandler";
import { loadEnv } from "./util";

loadEnv();

const TELEGRAM_BOT_TOKEN = z.string().parse(process.env.TELEGRAM_BOT_TOKEN);
const bot = new TelegramBot(TELEGRAM_BOT_TOKEN, { polling: true });

const commandHandler = new CommandHandler(bot);

const surveyModule: Module = {
  name: "Survey",
  commands: [
    {
      name: "survey",
      description: "Take a simple survey",
      isPrivate: false,
      prompts: [
        {
          type: "input",
          name: "name",
          message: "What's your name?",
          help: "Just type your name. For example: 'John Doe'",
        },
        {
          type: "number",
          name: "age",
          message: "How old are you?",
          help: "Enter a number between 0 and 120.",
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
          help: "Choose one of the provided colors.",
        },
        {
          type: "confirm",
          name: "likesIceCream",
          message: "Do you like ice cream?",
          help: "Answer 'Yes' or 'No'.",
        },
        {
          type: "checkbox",
          name: "hobbies",
          message: "Select your hobbies:",
          choices: ["Reading", "Gaming", "Sports", "Cooking", "Traveling"],
          help: "Select one or more hobbies. Type 'done' when finished.",
        },
      ],
    },
  ],
};

const adminModule: Module = {
  name: "Admin",
  commands: [
    {
      name: "stats",
      description: "View bot statistics",
      isPrivate: true,
      prompts: [],
    },
  ],
};

commandHandler.addModule(surveyModule);
commandHandler.addModule(adminModule);

console.log("Bot is running...");
