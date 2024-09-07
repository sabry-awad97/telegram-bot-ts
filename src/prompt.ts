import TelegramBot from "node-telegram-bot-api";
import { AnswerValue, Answers, Prompt } from "./types";

export class PromptHandler {
  constructor(public prompt: Prompt) {}

  async ask(
    bot: TelegramBot,
    chatId: number,
    currentAnswers: Answers
  ): Promise<AnswerValue> {
    const keyboard = this.createKeyboard();
    await bot.sendMessage(chatId, this.prompt.message, keyboard);

    return new Promise((resolve) => {
      bot.once("message", async (msg) => {
        if (msg.chat.id !== chatId) return;
        let answer = this.parseAnswer(msg);

        if (this.prompt.validate) {
          const isValid = await this.prompt.validate(answer, currentAnswers);
          if (!isValid) {
            answer = await this.ask(bot, chatId, currentAnswers);
          }
        }

        if (this.prompt.transform) {
          answer = (await this.prompt.transform(
            answer,
            currentAnswers
          )) as AnswerValue;
        }

        resolve(answer);
      });
    });
  }

  private createKeyboard(): TelegramBot.SendMessageOptions {
    if ("choices" in this.prompt) {
      return {
        reply_markup: {
          keyboard: this.prompt.choices.map((choice) => [{ text: choice }]),
          one_time_keyboard: true,
          resize_keyboard: true,
        },
      };
    } else if (this.prompt.type === "confirm") {
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

  private parseAnswer(msg: TelegramBot.Message): AnswerValue {
    const text = msg.text || "";
    switch (this.prompt.type) {
      case "number":
        return parseFloat(text);
      case "confirm":
        return text.toLowerCase() === "yes";
      case "checkbox":
        return text.split(",").map((item) => item.trim());
      default:
        return text;
    }
  }
}
