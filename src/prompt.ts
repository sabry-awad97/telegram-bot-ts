import TelegramBot from "node-telegram-bot-api";
import logger from "./logger";
import { AnswerValue, Answers, Prompt } from "./types";

export class PromptHandler {
  constructor(public prompt: Prompt) {}

  // Method to ask the user a question and handle their response
  async ask(
    bot: TelegramBot,
    chatId: number,
    currentAnswers: Answers
  ): Promise<AnswerValue> {
    // Log the prompt being sent
    logger.info(
      `Prompting user ${chatId} with message: ${this.prompt.message}`
    );

    const keyboard = this.createKeyboard();
    await bot.sendMessage(chatId, this.prompt.message, keyboard);

    return new Promise((resolve) => {
      const messageHandler = async (msg: TelegramBot.Message) => {
        if (msg.chat.id !== chatId) return;

        const userInput = msg.text?.toLowerCase();
        logger.info(`Received input from user ${chatId}: ${userInput}`);

        if (userInput === "help" && this.prompt.help) {
          logger.info(`User ${chatId} requested help`);
          await bot.sendMessage(chatId, this.prompt.help);
          return;
        }

        if (this.prompt.type === "list" && userInput === "done") {
          logger.info(`User ${chatId} finished list selection`);

          bot.removeListener("message", messageHandler);
          await bot.sendMessage(chatId, "Selection complete.", {
            reply_markup: { remove_keyboard: true },
          });

          logger.info(
            `Final answers for user ${chatId}: ${JSON.stringify(
              currentAnswers[this.prompt.name]
            )}`
          );
          resolve(currentAnswers[this.prompt.name]!);
          return;
        }

        const answer = this.parseAnswer(msg);
        logger.info(`Parsed answer from user ${chatId}: ${answer}`);

        if (this.prompt.type === "list") {
          currentAnswers[this.prompt.name] = (
            (currentAnswers[this.prompt.name] as string[]) || []
          ).concat(answer as string[]);

          logger.info(`User ${chatId} selected list option: ${answer}`);

          await bot.sendMessage(
            chatId,
            `Added: ${answer}. Select more or type 'done' to finish.`
          );
        } else {
          bot.removeListener("message", messageHandler);
          logger.info(`Answer for user ${chatId} resolved: ${answer}`);
          resolve(answer);
        }
      };

      bot.on("message", messageHandler);
    });
  }

  // Create the custom keyboard for the prompt
  private createKeyboard(): TelegramBot.SendMessageOptions {
    if ("choices" in this.prompt) {
      logger.info(
        `Creating keyboard with choices for prompt: ${this.prompt.choices.join(
          ", "
        )}`
      );
      return {
        reply_markup: {
          keyboard: this.prompt.choices
            .map((choice) => [{ text: choice }])
            .concat([[{ text: "done" }]]),
          resize_keyboard: true,
        },
      };
    } else if (this.prompt.type === "confirm") {
      logger.info(`Creating Yes/No keyboard for confirm prompt`);
      return {
        reply_markup: {
          keyboard: [[{ text: "Yes" }], [{ text: "No" }]],
          one_time_keyboard: true,
          resize_keyboard: true,
        },
      };
    }
    return {};
  }

  // Parse the user's message based on the expected type of the answer
  private parseAnswer(msg: TelegramBot.Message): AnswerValue {
    const text = msg.text || "";
    switch (this.prompt.type) {
      case "number":
        return parseFloat(text); // Parse number inputs
      case "confirm":
        return text.toLowerCase() === "yes"; // Convert "Yes"/"No" into a boolean
      case "list":
        return [text]; // Return an array for list answers
      default:
        return text; // For other types, return the text as is
    }
  }
}
