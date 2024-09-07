import TelegramBotClient, { Message } from "node-telegram-bot-api";
import logger from "./logger";
import { useBotStore } from "./store";

export default class Bot {
  private client: TelegramBotClient;

  constructor(token: string) {
    this.client = new TelegramBotClient(token, { polling: true });
    logger.info("Bot initialized");
  }

  start() {
    this.client.on("message", (message) => {
      logger.info(`Received message from ${message.from?.username}`);
      this.respondTo(message);
    });
    logger.info("Bot started");
  }

  async respondTo(message: Message) {
    const botStore = useBotStore.getState();
    logger.debug(`Received message: ${message.text}`);

    try {
      switch (botStore.state) {
        case "waitingStart":
          await this.handleStart(message);
          break;

        case "waitingName":
          await this.handleName(message);
          break;

        case "echoing":
          await this.handleEcho(message);
          break;

        case "confirming":
          await this.handleConfirm(message);
          break;

        case "final":
          this.client.sendMessage(
            message.chat.id,
            "The conversation has ended."
          );
          break;

        default:
          this.client.sendMessage(
            message.chat.id,
            "Unexpected state, try /start."
          );
      }
    } catch (error: any) {
      logger.error(`Error processing message: ${error.message}`);
    }
  }

  async handleStart(message: Message) {
    const botStore = useBotStore.getState();

    if (message.text === "/start") {
      botStore.gotStart();
      await this.client.sendMessage(
        message.chat.id,
        "Let's begin! What's your name?"
      );
      logger.info("Started conversation");
    } else {
      this.client.sendMessage(message.chat.id, "Please type /start to begin.");
    }
  }

  async handleName(message: Message) {
    const botStore = useBotStore.getState();

    botStore.gotName(message.text!);

    const { name } = botStore;

    await this.client.sendMessage(
      message.chat.id,
      `Got it ${name}, I'll begin echoing your replies until you respond with /stop`
    );
    logger.info(`Name received: ${name}`);
  }

  async handleEcho(message: Message) {
    const botStore = useBotStore.getState();

    if (message.text === "/stop") {
      botStore.gotStop();
      await this.client.sendMessage(
        message.chat.id,
        "Are you sure you want to stop? (yes/no)"
      );
      logger.info("Stop command received");
    } else {
      botStore.gotText(message.text!);

      const { name, text } = useBotStore.getState();

      await this.client.sendMessage(
        message.chat.id,
        `Echoing for ${name}: ${text}`
      );
      logger.info(`Echoing text: ${text}`);
    }
  }

  async handleConfirm(message: Message) {
    const botStore = useBotStore.getState();
    const chatId = message.chat.id;

    if (message.text?.toLowerCase() === "yes") {
      botStore.confirmed();
      await this.client.sendMessage(chatId, "We're done here, see ya!");
      logger.info("Confirmation received: yes");
    } else if (message.text?.toLowerCase() === "no") {
      botStore.cancelled();
      await this.client.sendMessage(chatId, "Alright, going back to echoing");
      logger.info("Confirmation received: no");
    } else {
      await this.client.sendMessage(
        chatId,
        "Sorry, I didn't catch that, do you want to stop? (yes/no)"
      );
      logger.warn("Invalid confirmation response");
    }
  }
}
