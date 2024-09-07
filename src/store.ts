import { create } from "zustand";

export type BotState =
  | "waitingStart"
  | "waitingName"
  | "echoing"
  | "confirming"
  | "final";

// Define the bot store
interface BotStore {
  state: BotState;
  name: string;
  text: string;
  gotStart: () => void;
  gotName: (name: string) => void;
  gotText: (text: string) => void;
  gotStop: () => void;
  confirmed: () => void;
  cancelled: () => void;
}

export const useBotStore = create<BotStore>((set) => ({
  state: "waitingStart",
  name: "",
  text: "",

  gotStart: () => set({ state: "waitingName" }),
  gotName: (name: string) => set({ state: "echoing", name }),
  gotText: (text: string) => set({ text }),
  gotStop: () => set({ state: "confirming" }),
  confirmed: () => set({ state: "final" }),
  cancelled: () => set({ state: "echoing" }),
}));
