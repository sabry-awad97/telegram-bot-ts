import TelegramBot from "node-telegram-bot-api";
import { Command } from "./command";
import { CommandConfig } from "./types";

export class CommandHandler {
  private commands: Map<string, Command> = new Map();

  constructor(private bot: TelegramBot) {
    this.setupHelpCommand();
  }

  addCommand(config: CommandConfig): void {
    const command = new Command(config);
    this.commands.set(command.name, command);
    this.bot.onText(new RegExp(`^/${command.name}`), (msg) => {
      command.execute(this.bot, msg);
    });
  }

  listCommands(): { name: string; description: string }[] {
    return Array.from(this.commands.values()).map((cmd) => ({
      name: cmd.name,
      description: cmd.description,
    }));
  }

  private setupHelpCommand(): void {
    this.addCommand({
      name: "help",
      description: "List all available commands",
      prompts: [],
    });

    this.bot.on("message", async (msg) => {
      if (msg.text === "/help") {
        const chatId = msg.chat.id;
        const commandList = this.listCommands()
          .map((cmd) => `/${cmd.name} - ${cmd.description}`)
          .join("\n");
        await this.bot.sendMessage(
          chatId,
          `Available commands:\n${commandList}`
        );
      }
    });
  }
}
