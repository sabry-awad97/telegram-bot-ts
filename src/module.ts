import TelegramBot from "node-telegram-bot-api";
import { z } from "zod";
import { Command, CommandConfigSchema } from "./command";
import { Answers } from "./types";

export type CommandHandler = (
  bot: TelegramBot,
  msg: TelegramBot.Message,
  answers: Answers
) => Promise<void>;

export const ModuleSchema = z.object({
  name: z.string(),
  commands: z.array(CommandConfigSchema),
});
export type Module = z.infer<typeof ModuleSchema>;

export class BotModule {
  private commands: Map<string, Command> = new Map();

  constructor(private config: Module) {
    this.initializeCommands();
  }

  get name(): string {
    return this.config.name;
  }

  getCommands(): Command[] {
    return Array.from(this.commands.values());
  }

  getCommand(name: string): Command | undefined {
    return this.commands.get(name);
  }

  private initializeCommands(): void {
    this.config.commands.forEach((commandConfig) => {
      const command = new Command(commandConfig);
      this.commands.set(command.name, command);
    });
  }
}
