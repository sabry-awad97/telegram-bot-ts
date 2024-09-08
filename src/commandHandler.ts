import TelegramBot from "node-telegram-bot-api";
import { z } from "zod";
import { PromptHandler, createPromptSchema } from "./prompt";

// Define the command schemas with categories
const BaseCommandSchema = z.object({
  name: z.string(),
  description: z.string(),
  category: z.string(), // New category field
  isPrivate: z.boolean().default(false),
  prompts: z.array(createPromptSchema()),
});

// Generic handler schema
const createHandlerSchema = () =>
  z
    .function()
    .args(
      z.object({
        bot: z.instanceof(TelegramBot),
        chatId: z.number(),
        answers: z.record(z.unknown()),
        meta: z.object({
          user: z.custom<TelegramBot.User | undefined>(),
        }),
      })
    )
    .returns(z.promise(z.void()));

// Generic command schemas
const createLocalCommandSchema = () =>
  BaseCommandSchema.extend({
    owner: z.string(),
    handler: createHandlerSchema(),
  });

const createGlobalCommandSchema = () =>
  BaseCommandSchema.extend({
    handler: createHandlerSchema(),
  });

// Generic Command type
type Command =
  | z.infer<ReturnType<typeof createLocalCommandSchema>>
  | z.infer<ReturnType<typeof createGlobalCommandSchema>>;

export class CommandHandler {
  private commands: Map<string, Command> = new Map();
  private lastCommandTimestamp: Map<
    number,
    { commandName: string; timestamp: number }
  > = new Map();
  private cooldownPeriod: number = 60000; // 1 minute cooldown period

  constructor(private bot: TelegramBot) {
    this.setupHelpCommand();
  }

  addCommand(command: Command): void {
    this.commands.set(command.name, command);

    // Attach handler to the bot for the command
    this.bot.onText(new RegExp(`^/${command.name}`), (msg) => {
      if (!command.isPrivate || this.isUserAuthorized(msg.from?.id)) {
        this.executeCommand(command, msg);
      } else {
        this.bot.sendMessage(
          msg.chat.id,
          "You are not authorized to use this command."
        );
      }
    });
  }

  private async executeCommand(
    command: Command,
    msg: TelegramBot.Message
  ): Promise<void> {
    const userId = msg.from?.id;
    if (userId === undefined) {
      await this.bot.sendMessage(msg.chat.id, "Error: User ID is undefined.");
      return;
    }

    // Check if the user is on cooldown
    if (this.isOnCooldown(userId, command.name)) {
      await this.bot.sendMessage(
        msg.chat.id,
        "Please wait before using this command again."
      );
      return;
    }

    // Update last command timestamp
    this.lastCommandTimestamp.set(userId, {
      commandName: command.name,
      timestamp: Date.now(),
    });

    const chatId = msg.chat.id;
    let answers: Record<string, unknown> = {};

    // Execute the prompts one by one
    for (const prompt of command.prompts) {
      const promptHandler = new PromptHandler(prompt);
      const answer = await promptHandler.ask(this.bot, chatId);
      answers[prompt.name] = answer;
    }

    // After prompts, execute the final command handler
    await command.handler({
      bot: this.bot,
      chatId,
      answers: answers,
      meta: { user: msg.from },
    });
  }

  private setupHelpCommand(): void {
    const helpCommand: Command = {
      name: "help",
      description: "List all available commands",
      category: "General", // Default category
      isPrivate: false,
      prompts: [],
      handler: async ({ bot, chatId, meta }) => {
        const userId = meta.user?.id;
        const categorizedCommands = Array.from(this.commands.values())
          .filter((cmd) => !cmd.isPrivate || this.isUserAuthorized(userId))
          .reduce<Record<string, string[]>>((acc, cmd) => {
            if (!acc[cmd.category]) {
              acc[cmd.category] = [];
            }
            acc[cmd.category]?.push(`/${cmd.name} - ${cmd.description}`);
            return acc;
          }, {});

        const commandList = Object.entries(categorizedCommands)
          .map(
            ([category, commands]) => `*${category}*\n${commands.join("\n")}`
          )
          .join("\n\n");

        if (commandList) {
          await bot.sendMessage(
            chatId,
            `Available commands:\n\n${commandList}`,
          );
        } else {
          await bot.sendMessage(
            chatId,
            "You are not authorized to view any commands."
          );
        }
      },
    };

    this.addCommand(helpCommand);
  }

  private isUserAuthorized(userId?: number): boolean {
    const authorizedUsers = [123456789, 987654321];
    return userId !== undefined && authorizedUsers.includes(userId);
  }

  private isOnCooldown(userId: number, commandName: string): boolean {
    const cooldown = this.lastCommandTimestamp.get(userId);
    if (!cooldown || cooldown.commandName !== commandName) {
      return false;
    }

    const now = Date.now();
    return now - cooldown.timestamp < this.cooldownPeriod;
  }
}
