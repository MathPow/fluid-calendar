import { create } from "zustand";
import { persist } from "zustand/middleware";

import {
  type AssistantModelId,
  DEFAULT_ASSISTANT_MODEL,
  isAssistantModel,
} from "@/lib/assistant/models";

/** The chat panel's model choice, remembered on this device. */
export const useAssistantModel = create<{
  model: AssistantModelId;
  setModel: (model: AssistantModelId) => void;
}>()(
  persist(
    (set) => ({
      model: DEFAULT_ASSISTANT_MODEL,
      setModel: (model) => set({ model }),
    }),
    {
      name: "assistant-model",
      merge: (persisted, current) => {
        const m = (persisted as { model?: unknown } | undefined)?.model;
        return { ...current, model: isAssistantModel(m) ? m : current.model };
      },
    }
  )
);
