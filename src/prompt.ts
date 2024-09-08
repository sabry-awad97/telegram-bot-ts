import TelegramBot from "node-telegram-bot-api";
import { z } from "zod";
import logger from "./logger";

export function createPromptSchema() {
  return z.union([
    z.object({
      type: z.union([
        z.literal("text"),
        z.literal("number"),
        z.literal("confirm"),
      ]),
      name: z.string(),
      message: z.string(),
      help: z.string().optional(),
    }),
    z.object({
      type: z.union([z.literal("list"), z.literal("checkbox")]),
      choices: z.array(z.string()),
      name: z.string(),
      message: z.string(),
      help: z.string().optional(),
    }),
  ]);
}

export type Prompt = z.infer<ReturnType<typeof createPromptSchema>>;

export class PromptHandler {
  private static activePrompts: Map<number, PromptHandler> = new Map();
  private answers: Record<string, unknown> = {};

  constructor(public prompt: Prompt) {}

  // Method to ask the user a question and handle their response
  async ask(bot: TelegramBot, chatId: number): Promise<unknown> {
    // Check if there's already an active prompt for this user
    if (PromptHandler.activePrompts.has(chatId)) {
      logger.info(`User ${chatId} already has an active prompt.`);
      await bot.sendMessage(
        chatId,
        "Please complete the current prompt before starting a new one."
      );
      return;
    }

    // Mark this prompt as active for the user
    PromptHandler.activePrompts.set(chatId, this);

    try {
      logger.info(
        `Prompting user ${chatId} with message: ${this.prompt.message}`
      );

      // Create the custom keyboard based on prompt type (if applicable)
      const keyboard = this.createKeyboard();
      await bot.sendMessage(chatId, this.prompt.message, keyboard);

      return new Promise((resolve, reject) => {
        const messageHandler = async (msg: TelegramBot.Message) => {
          try {
            if (msg.chat.id !== chatId) return; // Ignore messages from other chats

            // Handle commands separately
            if (msg.text && msg.text.startsWith("/")) {
              logger.info(`Received command from user ${chatId}: ${msg.text}`);
              // Respond to or ignore commands as needed
              await bot.sendMessage(
                chatId,
                "Commands are not supported in this context."
              );
              return;
            }

            const userInput = msg.text?.toLowerCase();
            logger.info(`Received input from user ${chatId}: ${userInput}`);

            // Handle "help" command
            if (userInput === "help" && this.prompt.help) {
              logger.info(`User ${chatId} requested help`);
              await bot.sendMessage(chatId, this.prompt.help);
              return;
            }

            // Handle "done" for checkbox input type
            if (this.prompt.type === "checkbox" && userInput === "done") {
              logger.info(`User ${chatId} finished selection`);

              bot.removeListener("message", messageHandler); // Stop listening for messages
              await bot.sendMessage(chatId, "Selection complete.", {
                reply_markup: { remove_keyboard: true },
              });

              logger.info(
                `Final answers for user ${chatId}: ${JSON.stringify(
                  this.answers[this.prompt.name]
                )}`
              );
              PromptHandler.activePrompts.delete(chatId); // Mark prompt as completed
              resolve(this.answers[this.prompt.name]);
              return;
            }

            // Parse the user's answer
            const answer = this.parseAnswer(msg);
            logger.info(
              `Parsed answer from user ${chatId}: ${answer} (type: ${typeof answer})`
            );

            if (this.prompt.type === "checkbox") {
              // Handle checkbox-type input (allow multiple selections)
              this.answers[this.prompt.name] = (
                (this.answers[this.prompt.name] as string[]) || []
              ).concat(answer as string[]);

              logger.info(`User ${chatId} selected option: ${answer}`);

              await bot.sendMessage(
                chatId,
                `Added: ${answer}. Select more or type 'done' to finish.`
              );
            } else if (this.prompt.type === "list") {
              // Handle list-type input (select only one option)
              this.answers[this.prompt.name] = answer;

              bot.removeListener("message", messageHandler);
              logger.info(`User ${chatId} selected list option: ${answer}`);
              await bot.sendMessage(chatId, `Selected: ${answer}`, {
                reply_markup: { remove_keyboard: true },
              });
              PromptHandler.activePrompts.delete(chatId); // Mark prompt as completed
              resolve(answer);
            } else {
              // For other input types, stop listening and resolve the answer
              bot.removeListener("message", messageHandler);
              logger.info(`Answer for user ${chatId} resolved: ${answer}`);
              PromptHandler.activePrompts.delete(chatId); // Mark prompt as completed
              resolve(answer);
            }
          } catch (error: any) {
            // Log and handle any errors during message handling
            logger.error(
              `Error processing message from user ${chatId}: ${error.message}`
            );
            await bot.sendMessage(
              chatId,
              "An error occurred while processing your input. Please try again."
            );
            reject(error);
          }
        };

        // Attach the message handler to listen for user responses
        bot.on("message", messageHandler);
      });
    } catch (error: any) {
      // Log and handle any errors during the initial prompting
      logger.error(`Failed to prompt user ${chatId}: ${error.message}`);
      await bot.sendMessage(
        chatId,
        "Sorry, an error occurred while sending the prompt. Please try again later."
      );
      throw error; // Re-throw the error for further handling
    }
  }

  // Create the custom keyboard for the prompt
  private createKeyboard(): TelegramBot.SendMessageOptions {
    try {
      switch (this.prompt.type) {
        case "checkbox":
          // Show keyboard for checkbox-type prompts with choices
          logger.info(
            `Creating checkbox keyboard with choices: ${this.prompt.choices.join(
              ", "
            )}`
          );
          return {
            reply_markup: {
              keyboard: this.prompt.choices
                .map((choice) => [{ text: choice }])
                .concat([[{ text: "done" }]]),
              resize_keyboard: true,
            },
          };

        case "list":
          // Show keyboard for list-type prompts (no "done" option)
          logger.info(
            `Creating list keyboard with choices: ${this.prompt.choices.join(
              ", "
            )}`
          );
          return {
            reply_markup: {
              keyboard: this.prompt.choices.map((choice) => [{ text: choice }]),
              resize_keyboard: true,
            },
          };

        case "confirm":
          // Show keyboard for confirm-type prompts
          logger.info(`Creating Yes/No keyboard for confirm prompt`);
          return {
            reply_markup: {
              keyboard: [[{ text: "Yes" }], [{ text: "No" }]],
              one_time_keyboard: true, // Automatically removes the keyboard after one use
              resize_keyboard: true,
              force_reply: true, // Force user to reply with "Yes" or "No"
            },
          };

        default:
          // Handle any unexpected prompt types
          break;
      }
    } catch (error: any) {
      logger.error(`Error creating keyboard for prompt: ${error.message}`);
    }

    // Return an empty reply_markup (no keyboard) for other input types
    return {
      reply_markup: {
        remove_keyboard: true, // Ensure any existing keyboard is removed
      },
    };
  }

  // Parse the user's message based on the expected type of the answer
  private parseAnswer(msg: TelegramBot.Message): unknown {
    const text = msg.text || "";
    try {
      switch (this.prompt.type) {
        case "number":
          const parsedNumber = parseFloat(text);
          if (isNaN(parsedNumber)) {
            throw new Error(`Invalid number format: ${text}`);
          }
          return parsedNumber;
        case "confirm":
          if (text.toLowerCase() !== "yes" && text.toLowerCase() !== "no") {
            throw new Error(`Invalid confirmation input: ${text}`);
          }
          return text.toLowerCase() === "yes"; // Return boolean for Yes/No
        case "list":
        case "checkbox":
          return [text]; // Return an array for list or checkbox-type inputs
        default:
          return text; // For other types, return the text as is
      }
    } catch (error: any) {
      // Log parsing errors and re-throw them for higher-level handling
      logger.error(
        `Error parsing input for prompt "${this.prompt.message}": ${error.message}`
      );
      throw error;
    }
  }
}
