import TelegramBot from "node-telegram-bot-api";
import { z } from "zod";
import { Command } from "./command";
import { BotModule, Module } from "./module";

export class CommandHandler {
  private modules: Map<string, BotModule> = new Map();
  private commands: Map<string, Command> = new Map();

  constructor(private bot: TelegramBot) {
    this.setupHelpCommand();
  }

  addModule(moduleConfig: Module): void {
    const module = new BotModule(moduleConfig);
    this.modules.set(module.name, module);
    module.getCommands().forEach((command) => {
      this.addCommand(command);
    });
  }

  addCommand(command: Command): void {
    this.commands.set(command.name, command);
    const commandSchema = z.literal(command.name);
    this.bot.onText(new RegExp(`^/${commandSchema.value}`), (msg) => {
      if (!command.isPrivate || this.isUserAuthorized(msg.from?.id)) {
        command.execute(this.bot, msg);
      } else {
        this.bot.sendMessage(
          msg.chat.id,
          "You are not authorized to use this command."
        );
      }
    });
  }

  async executeCommand(
    commandName: string,
    msg: TelegramBot.Message
  ): Promise<void> {
    const command = this.commands.get(commandName);
    if (command) {
      if (!command.isPrivate || this.isUserAuthorized(msg.from?.id)) {
        await command.execute(this.bot, msg);
      } else {
        await this.bot.sendMessage(
          msg.chat.id,
          "You are not authorized to use this command."
        );
      }
    } else {
      await this.bot.sendMessage(msg.chat.id, "Command not found.");
    }
  }

  listCommands(): { name: string; description: string; isPrivate: boolean }[] {
    return Array.from(this.commands.values()).map((cmd) => ({
      name: cmd.name,
      description: cmd.description,
      isPrivate: cmd.isPrivate,
    }));
  }

  private setupHelpCommand(): void {
    const helpCommand = new Command({
      name: "help",
      description: "List all available commands",
      isPrivate: false,
      prompts: [],
    });

    this.addCommand(helpCommand);

    this.bot.on("message", async (msg) => {
      if (msg.text === "/help") {
        const chatId = msg.chat.id;
        const commandList = this.listCommands()
          .filter(
            (cmd) => !cmd.isPrivate || this.isUserAuthorized(msg.from?.id)
          )
          .map(
            (cmd) =>
              `/${cmd.name} - ${cmd.description}${
                cmd.isPrivate ? " (Private)" : ""
              }`
          )
          .join("\n");
        await this.bot.sendMessage(
          chatId,
          `Available commands:\n${commandList}`
        );
      }
    });
  }

  private isUserAuthorized(userId: number | undefined): boolean {
    // Implement your authorization logic here
    // For example, you could have a list of authorized user IDs
    const authorizedUsers = [123456789, 987654321];
    return userId !== undefined && authorizedUsers.includes(userId);
  }
}
