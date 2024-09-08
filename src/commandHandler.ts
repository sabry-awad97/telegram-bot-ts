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
        const isAuthorizedUser = this.isUserAuthorized(userId);
  
        const categories: { [key: string]: Command[] } = {};
  
        // Group commands by category, filtering private commands for unauthorized users
        this.commands.forEach((command) => {
          if (!command.isPrivate || isAuthorizedUser) {
            if (!categories[command.category]) {
              categories[command.category] = [];
            }
            categories[command.category]?.push(command);
          }
        });
  
        // Generate help message with Markdown
        let helpMessage = "*Available Commands:*\n\n";
  
        for (const [category, commands] of Object.entries(categories)) {
          helpMessage += `*${category}*\n`;
          commands.forEach((command) => {
            helpMessage += `- /${command.name.replace(/[_\-\.]/g, '\\$&')}: ${command.description.replace(/[_\-\.]/g, '\\$&')}\n`;
          });
          helpMessage += '\n';
        }
  
        // Send help message
        await bot.sendMessage(chatId, helpMessage, { parse_mode: 'Markdown' });
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
