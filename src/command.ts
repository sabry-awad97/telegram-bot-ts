import TelegramBot from "node-telegram-bot-api";
import { z } from "zod";
import { PromptHandler, PromptSchema } from "./prompt";
import { Answers } from "./types";

export const CommandConfigSchema = z.object({
  name: z.string(),
  description: z.string(),
  isPrivate: z.boolean().default(false),
  prompts: z.array(PromptSchema),
});

type CommandConfig = z.infer<typeof CommandConfigSchema>;

export class Command {
  private prompts: PromptHandler[];

  constructor(private config: CommandConfig) {
    this.prompts = config.prompts.map((prompt) => new PromptHandler(prompt));
  }

  get name(): string {
    return this.config.name;
  }

  get description(): string {
    return this.config.description;
  }

  get isPrivate(): boolean {
    return this.config.isPrivate;
  }

  async execute(bot: TelegramBot, msg: TelegramBot.Message): Promise<void> {
    const chatId = msg.chat.id;
    const answers: Answers = {};

    for (const prompt of this.prompts) {
      const answer = await prompt.ask(bot, chatId, answers);
      answers[prompt.prompt.name] = answer;
    }

    await this.sendSummary(bot, chatId, answers);
  }

  private async sendSummary(
    bot: TelegramBot,
    chatId: number,
    answers: Answers
  ): Promise<void> {
    const summary = Object.entries(answers)
      .map(
        ([key, value]) =>
          `${key}: ${Array.isArray(value) ? value.join(", ") : value}`
      )
      .join("\n");

    await bot.sendMessage(chatId, `Summary:\n${summary}`);
  }
}
