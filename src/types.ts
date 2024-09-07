import TelegramBot from "node-telegram-bot-api";
import { z } from "zod";

export const PromptTypeSchema = z.enum([
  "input",
  "number",
  "confirm",
  "list",
  "checkbox",
]);
export type PromptType = z.infer<typeof PromptTypeSchema>;

export const BasePromptSchema = z.object({
  type: PromptTypeSchema,
  name: z.string(),
  message: z.string(),
  validate: z.function().optional(),
  transform: z.function().optional(),
});

export const ChoicePromptSchema = BasePromptSchema.extend({
  type: z.enum(["list", "checkbox"]),
  choices: z.array(z.string()),
});

export const PromptSchema = z.union([BasePromptSchema, ChoicePromptSchema]);
export type Prompt = z.infer<typeof PromptSchema>;

export const CommandConfigSchema = z.object({
  name: z.string(),
  description: z.string(),
  prompts: z.array(PromptSchema),
});
export type CommandConfig = z.infer<typeof CommandConfigSchema>;

export type AnswerValue = string | number | boolean | string[];
export type Answers = Record<string, AnswerValue>;

export type CommandHandler = (
  bot: TelegramBot,
  msg: TelegramBot.Message,
  answers: Answers
) => Promise<void>;
