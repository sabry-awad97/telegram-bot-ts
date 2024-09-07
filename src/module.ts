import { Command } from "./command";
import { Module } from "./types";

export class BotModule {
  private commands: Map<string, Command> = new Map();

  constructor(private config: Module) {
    this.initializeCommands();
  }

  get name(): string {
    return this.config.name;
  }

  getCommands(): Command[] {
    return Array.from(this.commands.values());
  }

  getCommand(name: string): Command | undefined {
    return this.commands.get(name);
  }

  private initializeCommands(): void {
    this.config.commands.forEach((commandConfig) => {
      const command = new Command(commandConfig);
      this.commands.set(command.name, command);
    });
  }
}
