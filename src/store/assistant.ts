import { create } from "zustand";

/**
 * What the assistant mascot should know about the screen beyond the URL:
 * pages set `focus` to a one-line description of the item open right now
 * (the email being read, the task being edited…) and clear it on close.
 */
interface AssistantStore {
  focus: string | null;
  setFocus: (focus: string | null) => void;
}

export const useAssistantStore = create<AssistantStore>((set) => ({
  focus: null,
  setFocus: (focus) => set({ focus }),
}));
