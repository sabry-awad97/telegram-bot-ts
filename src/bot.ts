import TelegramBot, { Message } from "node-telegram-bot-api";
import { create } from "zustand";

// Types and Interfaces
type ValidatorFunction = (input: string) => {
  valid: boolean;
  message?: string;
};

interface Prompt {
  key: string;
  text: string;
  validate?: ValidatorFunction;
}

interface BotState {
  prompts: Prompt[];
  currentPromptIndex: number | null;
  responses: Record<string, string>;
  isInPromptFlow: boolean;
  gotResponse: (key: string, value: string) => void;
  nextPrompt: () => void;
  setPrompts: (prompts: Prompt[]) => void;
  setIsInPromptFlow: (inPromptFlow: boolean) => void;
}

// Zustand store
const useBotStore = create<BotState>((set) => ({
  prompts: [],
  currentPromptIndex: null,
  responses: {},
  isInPromptFlow: false,

  gotResponse: (key, value) =>
    set((state) => ({
      responses: { ...state.responses, [key]: value },
    })),

  nextPrompt: () =>
    set((state) => {
      if (state.currentPromptIndex === null) return state;
      const nextIndex = state.currentPromptIndex + 1;
      return {
        currentPromptIndex: nextIndex < state.prompts.length ? nextIndex : null,
        isInPromptFlow: nextIndex < state.prompts.length,
      };
    }),

  setPrompts: (prompts) =>
    set({
      prompts,
      currentPromptIndex: 0,
      responses: {},
      isInPromptFlow: true,
    }),

  setIsInPromptFlow: (isInPromptFlow) => set({ isInPromptFlow }),
}));

// Bot class
export default class Bot {
  private client: TelegramBot;
  private commands: Map<string, Prompt[]> = new Map();
  private isResponding: boolean = false;

  constructor(token: string) {
    this.client = new TelegramBot(token, { polling: true });
    this.command("/help", []);
    this.setupEventListeners();
  }

  private setupEventListeners(): void {
    this.client.on("message", this.handleMessage.bind(this));
    this.client.on("polling_error", (error) =>
      console.error("Polling error:", error)
    );
    this.client.on("error", (error) => console.error("Bot error:", error));
  }

  public command(commandName: string, prompts: Prompt[]): void {
    this.commands.set(commandName.toLowerCase(), prompts);
  }

  private async handleMessage(message: Message): Promise<void> {
    if (!message.text) return;

    const text = message.text.trim().toLowerCase();
    const botStore = useBotStore.getState();

    if (botStore.isInPromptFlow) {
      await this.handlePromptFlow(message);
    } else if (text === "/help") {
      await this.sendHelpMessage(message);
    } else if (this.commands.has(text)) {
      await this.startPromptFlow(message, text);
    } else {
      await this.sendUnrecognizedCommandMessage(message);
    }
  }

  private async sendHelpMessage(message: Message): Promise<void> {
    let helpMessage = "*Available Commands:*\n\n";
    for (const [command, prompts] of this.commands) {
      helpMessage += `*${command}*:\n`;
      if (prompts.length > 0) {
        prompts.forEach((prompt, index) => {
          helpMessage += `  ${index + 1}. ${prompt.text}\n`;
        });
      } else {
        helpMessage += `  _No prompts associated with this command._\n`;
      }
      helpMessage += "\n";
    }

    await this.client.sendMessage(message.chat.id, helpMessage, {
      parse_mode: "Markdown",
    });
  }

  private async startPromptFlow(
    message: Message,
    command: string
  ): Promise<void> {
    const prompts = this.commands.get(command);
    if (!prompts) return;

    const botStore = useBotStore.getState();
    botStore.setPrompts(prompts);

    if (prompts.length > 0) {
      await this.client.sendMessage(message.chat.id, prompts[0]!.text, {
        parse_mode: "Markdown",
      });
    }
  }

  private async handlePromptFlow(message: Message): Promise<void> {
    if (this.isResponding) return;
    this.isResponding = true;

    try {
      const botStore = useBotStore.getState();
      const { currentPromptIndex, prompts } = botStore;

      if (currentPromptIndex === null) {
        await this.finishPromptFlow(message);
        return;
      }

      const currentPrompt = prompts[currentPromptIndex];
      if (!currentPrompt || !message.text) return;

      const isValid = await this.validateResponse(
        currentPrompt,
        message.text,
        message.chat.id
      );
      if (!isValid) return;

      botStore.gotResponse(currentPrompt.key, message.text);
      botStore.nextPrompt();

      await this.sendNextPromptOrFinish(message);
    } finally {
      this.isResponding = false;
    }
  }

  private async validateResponse(
    prompt: Prompt,
    input: string,
    chatId: number
  ): Promise<boolean> {
    if (!prompt.validate) return true;

    const validation = prompt.validate(input);
    if (!validation.valid) {
      await this.client.sendMessage(
        chatId,
        validation.message || "Invalid input. Please try again."
      );
      return false;
    }
    return true;
  }

  private async sendNextPromptOrFinish(message: Message): Promise<void> {
    const botStore = useBotStore.getState();
    const { currentPromptIndex, prompts } = botStore;

    if (currentPromptIndex !== null && currentPromptIndex < prompts.length) {
      const nextPrompt = prompts[currentPromptIndex]!;
      await this.client.sendMessage(message.chat.id, nextPrompt.text, {
        parse_mode: "Markdown",
      });
    } else {
      await this.finishPromptFlow(message);
    }
  }

  private async finishPromptFlow(message: Message): Promise<void> {
    const botStore = useBotStore.getState();
    console.log("Responses:", botStore.responses);
    await this.client.sendMessage(
      message.chat.id,
      "Thank you! You've completed the form."
    );
    botStore.setIsInPromptFlow(false);
  }

  private async sendUnrecognizedCommandMessage(
    message: Message
  ): Promise<void> {
    await this.client.sendMessage(
      message.chat.id,
      "Unrecognized command. Please use /help to see available commands."
    );
  }
}
