import TelegramBot, { Message } from "node-telegram-bot-api";
import { z, ZodType } from "zod";
import { create } from "zustand";

// Zod schemas
const PromptSchema = z.object({
  key: z.string(),
  text: z.string(),
  schema: z.instanceof(ZodType),
});

const CommandSchema = z.object({
  name: z.string(),
  description: z.string(),
  prompts: z.array(PromptSchema),
});

// Types
type Prompt = z.infer<typeof PromptSchema>;
type Command = z.infer<typeof CommandSchema>;

// Zustand store
interface BotState {
  currentCommand: Command | null;
  currentPromptIndex: number | null;
  responses: Record<string, unknown>;
  isInPromptFlow: boolean;
  setCommand: (command: Command) => void;
  gotResponse: (key: string, value: unknown) => void;
  nextPrompt: () => void;
  resetFlow: () => void;
}

const useBotStore = create<BotState>((set) => ({
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
  private commands: Map<string, Command> = new Map();

  constructor(token: string) {
    this.client = new TelegramBot(token, { polling: true });
    this.setupEventListeners();
  }

  private setupEventListeners(): void {
    this.client.on("message", this.handleMessage.bind(this));
    this.client.on("polling_error", (error) =>
      console.error("Polling error:", error)
    );
    this.client.on("error", (error) => console.error("Bot error:", error));
  }

  public command(commandData: z.input<typeof CommandSchema>): void {
    const command = CommandSchema.parse(commandData);
    this.commands.set(command.name.toLowerCase(), command);
  }

  public async executeCommand(
    commandName: string,
    chatId: number
  ): Promise<Record<string, unknown>> {
    const command = this.commands.get(commandName.toLowerCase());
    if (!command) {
      throw new Error(`Command "${commandName}" not found.`);
    }

    const botStore = useBotStore.getState();
    botStore.setCommand(command);

    return new Promise((resolve, reject) => {
      const unsubscribe = useBotStore.subscribe((state) => {
        if (!state.isInPromptFlow && state.currentCommand === command) {
          unsubscribe();
          resolve(state.responses);
        }
      });

      this.sendNextPrompt(chatId).catch(reject);
    });
  }

  private async handleMessage(message: Message): Promise<void> {
    if (!message.text) return;

    const text = message.text.trim().toLowerCase();
    const botStore = useBotStore.getState();

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
    const botStore = useBotStore.getState();
    const { currentCommand, currentPromptIndex } = botStore;

    if (!currentCommand || currentPromptIndex === null || !message.text) return;

    const currentPrompt = currentCommand.prompts[currentPromptIndex];
    if (!currentPrompt) return;

    try {
      const validatedResponse = currentPrompt.schema.parse(message.text);
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
        console.error("Unexpected error:", error);
        await this.client.sendMessage(
          message.chat.id,
          "An unexpected error occurred. Please try again."
        );
      }
    }
  }

  private async sendNextPrompt(chatId: number): Promise<void> {
    const botStore = useBotStore.getState();
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
    const botStore = useBotStore.getState();
    console.log("Responses:", botStore.responses);
    await this.client.sendMessage(
      chatId,
      "Thank you! You've completed the form."
    );
    botStore.resetFlow();
  }

  private async sendUnrecognizedCommandMessage(chatId: number): Promise<void> {
    await this.client.sendMessage(
      chatId,
      "Unrecognized command. Please use /help to see available commands."
    );
  }
}
