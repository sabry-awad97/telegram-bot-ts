import chalk from "chalk";
import TelegramBot, { Message } from "node-telegram-bot-api";
import { z, ZodObject } from "zod";
import { create } from "zustand";

type Prompt = {
  key: string;
  text: string;
};

type Command<T extends ZodObject<any>> = {
  name: string;
  description: string;
  inputSchema: T;
  prompts: Prompt[];
};

interface BotState {
  currentCommand: Command<any> | null;
  currentPromptIndex: number | null;
  responses: Record<string, any>;
  isInPromptFlow: boolean;
  setCommand: (command: Command<any>) => void;
  gotResponse: (key: string, value: any) => void;
  nextPrompt: () => void;
  resetFlow: () => void;
}

const createBotStore = () =>
  create<BotState>((set) => ({
    currentCommand: null,
    currentPromptIndex: null,
    responses: {},
    isInPromptFlow: false,

    setCommand: (command) =>
      set({
        currentCommand: command,
        currentPromptIndex: 0,
        responses: {},
        isInPromptFlow: true,
      }),

    gotResponse: (key, value) =>
      set((state) => ({
        responses: { ...state.responses, [key]: value },
      })),

    nextPrompt: () =>
      set((state) => {
        if (state.currentPromptIndex === null || !state.currentCommand)
          return state;
        const nextIndex = state.currentPromptIndex + 1;
        return {
          currentPromptIndex:
            nextIndex < state.currentCommand.prompts.length ? nextIndex : null,
          isInPromptFlow: nextIndex < state.currentCommand.prompts.length,
        };
      }),

    resetFlow: () =>
      set({
        currentCommand: null,
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
      command: (commandData: Omit<Command<T>, "inputSchema">) => {
        const command: Command<T> = {
          ...commandData,
          inputSchema,
        };
        this.commands.set(command.name.toLowerCase(), command);
        return this;
      },
    };
  }

  public async executeCommand<T extends ZodObject<any>>(
    commandName: string,
    chatId: number
  ): Promise<z.infer<T>> {
    const command = this.commands.get(commandName.toLowerCase()) as
      | Command<T>
      | undefined;
    if (!command) {
      throw new Error(`Command "${commandName}" not found.`);
    }

    this.store.getState().setCommand(command);

    return new Promise((resolve, reject) => {
      const unsubscribe = this.store.subscribe((state) => {
        if (!state.isInPromptFlow && state.currentCommand === command) {
          unsubscribe();
          resolve(command.inputSchema.parse(state.responses));
        }
      });

      this.sendNextPrompt(chatId).catch(reject);
    });
  }

  private async handleMessage(message: Message): Promise<void> {
    if (!message.text) return;

    const text = message.text.trim().toLowerCase();
    const botStore = this.store.getState();

    if (botStore.isInPromptFlow) {
      await this.handlePromptResponse(message);
    } else if (text === "/help") {
      await this.sendHelpMessage(message.chat.id);
    } else if (this.commands.has(text)) {
      await this.executeCommand(text, message.chat.id);
    } else {
      await this.sendUnrecognizedCommandMessage(message.chat.id);
    }
  }

  private async sendHelpMessage(chatId: number): Promise<void> {
    let helpMessage = "*Available Commands:*\n\n";
    for (const [, command] of this.commands) {
      helpMessage += `*/${command.name}* - ${command.description}\n`;
    }

    await this.client.sendMessage(chatId, helpMessage, {
      parse_mode: "Markdown",
    });
  }

  private async handlePromptResponse(message: Message): Promise<void> {
    const botStore = this.store.getState();
    const { currentCommand, currentPromptIndex } = botStore;

    if (!currentCommand || currentPromptIndex === null || !message.text) return;

    const currentPrompt = currentCommand.prompts[currentPromptIndex];
    if (!currentPrompt) return;

    try {
      const schema = currentCommand.inputSchema.shape[
        currentPrompt.key
      ] as z.ZodType<any>;
      const validatedResponse = schema.parse(message.text);
      botStore.gotResponse(currentPrompt.key, validatedResponse);
      botStore.nextPrompt();

      await this.sendNextPrompt(message.chat.id);
    } catch (error) {
      if (error instanceof z.ZodError) {
        await this.client.sendMessage(
          message.chat.id,
          `Invalid input: ${error.errors[0]?.message}`
        );
      } else {
        console.error(chalk.red("Unexpected error:"), error);
        await this.client.sendMessage(
          message.chat.id,
          "An unexpected error occurred. Please try again."
        );
      }
    }
  }

  private async sendNextPrompt(chatId: number): Promise<void> {
    const botStore = this.store.getState();
    const { currentCommand, currentPromptIndex } = botStore;

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
