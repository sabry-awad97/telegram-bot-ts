import chalk from "chalk";
import TelegramBot, { Message } from "node-telegram-bot-api";
import { z, ZodObject } from "zod";
import { create } from "zustand";

type Prompt<T> = {
  key: keyof T;
  text: string;
  help?: string;
  parser?: (input: string) => any;
};

type Command<T extends ZodObject<any>> = {
  name: string;
  description: string;
  title: string;
  inputSchema: T;
  prompts: Prompt<z.infer<T>>[];
  subcommands?: Command<any>[];
  execute?: (responses: z.infer<T>) => Promise<void>;
};

interface BotState {
  commandStack: Command<any>[];
  currentPromptIndex: number | null;
  responses: Record<string, any>;
  isInPromptFlow: boolean;
  pushCommand: (command: Command<any>) => void;
  popCommand: () => void;
  gotResponse: (key: string, value: any) => void;
  nextPrompt: () => void;
  resetFlow: () => void;
}

const createBotStore = () =>
  create<BotState>((set) => ({
    commandStack: [],
    currentPromptIndex: null,
    responses: {},
    isInPromptFlow: false,

    pushCommand: (command) =>
      set((state) => ({
        commandStack: [...state.commandStack, command],
        currentPromptIndex: 0,
        responses: {},
        isInPromptFlow: true,
      })),

    popCommand: () =>
      set((state) => ({
        commandStack: state.commandStack.slice(0, -1),
        currentPromptIndex:
          state.commandStack.length > 1 ? state.currentPromptIndex : null,
        responses: state.commandStack.length > 1 ? state.responses : {},
        isInPromptFlow: state.commandStack.length > 1,
      })),

    gotResponse: (key, value) =>
      set((state) => ({
        responses: { ...state.responses, [key]: value },
      })),

    nextPrompt: () =>
      set((state) => {
        const currentCommand =
          state.commandStack[state.commandStack.length - 1];
        if (state.currentPromptIndex === null || !currentCommand) return state;
        const nextIndex = state.currentPromptIndex + 1;
        return {
          currentPromptIndex:
            nextIndex < currentCommand.prompts.length ? nextIndex : null,
          isInPromptFlow: nextIndex < currentCommand.prompts.length,
        };
      }),

    resetFlow: () =>
      set({
        commandStack: [],
        currentPromptIndex: null,
        responses: {},
        isInPromptFlow: false,
      }),
  }));

export default class Bot {
  private client: TelegramBot;
  private commands: Map<string, Command<any>> = new Map();
  private store: ReturnType<typeof createBotStore>;

  constructor(token: string) {
    this.client = new TelegramBot(token, { polling: true });
    this.store = createBotStore();
    this.setupEventListeners();
  }

  private setupEventListeners(): void {
    this.client.on("message", this.handleMessage.bind(this));
    this.client.on("polling_error", (error) =>
      console.error(chalk.red("Polling error:"), error)
    );
    this.client.on("error", (error) =>
      console.error(chalk.red("Bot error:"), error)
    );
  }

  public schema<T extends ZodObject<any>>(inputSchema: T) {
    return {
      command: (commandData: Omit<Command<T>, "inputSchema" | "name">) => {
        const command: Command<T> = {
          ...commandData,
          name: commandData.title.toLowerCase().replace(/\s+/g, "_"),
          inputSchema,
        };
        this.commands.set(command.name, command);
        return {
          exec: (chatId: number) => this.exec<T>(command.name, chatId),
        };
      },
    };
  }

  public async exec<T extends ZodObject<any>>(
    commandName: string,
    chatId: number
  ): Promise<z.infer<T>> {
    const command = this.commands.get(commandName) as Command<T> | undefined;
    if (!command) {
      throw new Error(`Command "${commandName}" not found.`);
    }

    this.store.getState().pushCommand(command);

    if (command.title) {
      await this.client.sendMessage(chatId, `*${command.title}*`, {
        parse_mode: "Markdown",
      });
    }

    return new Promise((resolve, reject) => {
      const unsubscribe = this.store.subscribe((state) => {
        if (
          !state.isInPromptFlow &&
          state.commandStack[state.commandStack.length - 1] === command
        ) {
          unsubscribe();
          const responses = command.inputSchema.parse(state.responses);
          if (command.execute) {
            command
              .execute(responses)
              .then(() => resolve(responses))
              .catch(reject);
          } else {
            resolve(responses);
          }
          this.store.getState().popCommand();
        }
      });

      this.sendNextPrompt(chatId).catch(reject);
    });
  }

  private async handleMessage(message: Message): Promise<void> {
    if (!message.text) return;

    const text = message.text.trim();
    const botStore = this.store.getState();

    if (botStore.isInPromptFlow) {
      if (text.toLowerCase() === "/help") {
        await this.sendHelpForCurrentPrompt(message.chat.id);
      } else if (text.toLowerCase() === "/stop") {
        await this.stopCurrentCommand(message.chat.id);
      } else {
        await this.handlePromptResponse(message);
      }
    } else if (text.toLowerCase() === "/help") {
      await this.sendHelpMessage(message.chat.id);
    } else if (this.commands.has(text.toLowerCase())) {
      try {
        await this.exec(text.toLowerCase(), message.chat.id);
      } catch (error) {
        console.error(chalk.red("Error executing command:"), error);
        await this.client.sendMessage(
          message.chat.id,
          "An error occurred while executing the command. Please try again."
        );
      }
    } else {
      await this.sendUnrecognizedCommandMessage(message.chat.id);
    }
  }

  private async stopCurrentCommand(chatId: number): Promise<void> {
    const botStore = this.store.getState();
    if (botStore.commandStack.length > 0) {
      botStore.popCommand();
      await this.client.sendMessage(
        chatId,
        "Command stopped. What would you like to do next?"
      );
      if (botStore.commandStack.length > 0) {
        await this.sendNextPrompt(chatId);
      }
    } else {
      await this.client.sendMessage(chatId, "No active command to stop.");
    }
  }

  private async sendHelpForCurrentPrompt(chatId: number): Promise<void> {
    const botStore = this.store.getState();
    const currentCommand =
      botStore.commandStack[botStore.commandStack.length - 1];
    const { currentPromptIndex } = botStore;

    if (!currentCommand || currentPromptIndex === null) return;

    const currentPrompt = currentCommand.prompts[currentPromptIndex];
    if (currentPrompt && currentPrompt.help) {
      await this.client.sendMessage(chatId, currentPrompt.help, {
        parse_mode: "Markdown",
      });
    } else {
      await this.client.sendMessage(
        chatId,
        "No help available for this prompt."
      );
    }
  }

  private async sendHelpMessage(chatId: number): Promise<void> {
    let helpMessage = "*Available Commands:*\n\n";
    for (const [, command] of this.commands) {
      helpMessage += `*/${command.name}* - ${command.description}\n`;
    }
    helpMessage += "\nDuring a command:\n";
    helpMessage += "• Type /help for prompt-specific help\n";
    helpMessage += "• Type /stop to stop the current command";

    await this.client.sendMessage(chatId, helpMessage, {
      parse_mode: "Markdown",
    });
  }

  private async handlePromptResponse(message: Message): Promise<void> {
    const botStore = this.store.getState();
    const currentCommand =
      botStore.commandStack[botStore.commandStack.length - 1];
    const { currentPromptIndex } = botStore;

    if (!currentCommand || currentPromptIndex === null || !message.text) return;

    const currentPrompt = currentCommand.prompts[currentPromptIndex];
    if (!currentPrompt) return;

    try {
      const parser = currentPrompt.parser || ((input: string) => input);
      const parsedValue = parser(message.text);
      const schema = currentCommand.inputSchema.shape[
        currentPrompt.key as string
      ] as z.ZodType<any>;
      const validatedResponse = schema.parse(parsedValue);
      botStore.gotResponse(currentPrompt.key as string, validatedResponse);
      botStore.nextPrompt();

      await this.sendNextPrompt(message.chat.id);
    } catch (error) {
      if (error instanceof z.ZodError) {
        await this.client.sendMessage(
          message.chat.id,
          `Invalid input: ${error.errors[0]?.message}\nType /help for assistance or /stop to cancel.`
        );
      } else {
        console.error(chalk.red("Unexpected error:"), error);
        await this.client.sendMessage(
          message.chat.id,
          "An unexpected error occurred. Please try again, type /help for assistance, or /stop to cancel."
        );
      }
    }
  }

  private async sendNextPrompt(chatId: number): Promise<void> {
    const botStore = this.store.getState();
    const currentCommand =
      botStore.commandStack[botStore.commandStack.length - 1];
    const { currentPromptIndex } = botStore;

    if (!currentCommand || currentPromptIndex === null) {
      await this.finishPromptFlow(chatId);
      return;
    }

    const nextPrompt = currentCommand.prompts[currentPromptIndex];
    if (nextPrompt) {
      await this.client.sendMessage(chatId, nextPrompt.text, {
        parse_mode: "Markdown",
      });
    } else {
      await this.finishPromptFlow(chatId);
    }
  }

  private async finishPromptFlow(chatId: number): Promise<void> {
    const botStore = this.store.getState();
    console.log(chalk.green("Responses:"), botStore.responses);
    botStore.resetFlow();
  }

  private async sendUnrecognizedCommandMessage(chatId: number): Promise<void> {
    await this.client.sendMessage(
      chatId,
      "Unrecognized command. Please use /help to see available commands."
    );
  }
}
