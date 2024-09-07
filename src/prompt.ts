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
      const messageHandler = async (msg: TelegramBot.Message) => {
        if (msg.chat.id !== chatId) return;

        if (msg.text?.toLowerCase() === "help" && this.prompt.help) {
          await bot.sendMessage(chatId, this.prompt.help);
          return;
        }

        let answer = this.parseAnswer(msg);

        if (this.prompt.validate) {
          const isValid = await this.prompt.validate(answer, currentAnswers);
          if (!isValid) {
            await bot.sendMessage(
              chatId,
              "Invalid input. Please try again or type 'help' for assistance."
            );
            return;
          }
        }

        if (this.prompt.transform) {
          answer = (await this.prompt.transform(
            answer,
            currentAnswers
          )) as AnswerValue;
        }

        if (this.prompt.type === "checkbox") {
          currentAnswers[this.prompt.name] = (
            (currentAnswers[this.prompt.name] as string[]) || []
          ).concat(answer as string[]);
          await bot.sendMessage(
            chatId,
            `Added: ${(answer as string[]).join(
              ", "
            )}. Select more or type 'done' to finish.`
          );
          if (msg.text?.toLowerCase() !== "done") return;
        }

        bot.removeListener("message", messageHandler);
        resolve(
          this.prompt.type === "checkbox"
            ? currentAnswers[this.prompt.name]!
            : answer
        );
      };

      bot.on("message", messageHandler);
    });
  }

  private createKeyboard(): TelegramBot.SendMessageOptions {
    if ("choices" in this.prompt) {
      return {
        reply_markup: {
          keyboard: this.prompt.choices
            .map((choice) => [{ text: choice }])
            .concat([[{ text: "done" }]]),
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
        return [text];
      default:
        return text;
    }
  }
}
