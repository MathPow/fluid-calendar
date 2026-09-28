import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";

import { commandRegistry } from "@/lib/commands/registry";
import { Command } from "@/lib/commands/types";
import { formatShortcut } from "@/lib/utils";

interface ShortcutsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function ShortcutsModal({ isOpen, onClose }: ShortcutsModalProps) {
  // Group commands by section
  const commandsBySection = commandRegistry.getAll().reduce(
    (acc, command) => {
      if (command.shortcut) {
        if (!acc[command.section]) {
          acc[command.section] = [];
        }
        acc[command.section].push(command);
      }
      return acc;
    },
    {} as Record<Command["section"], Command[]>
  );

  return (
    <Dialog.Root open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-foreground/40 backdrop-blur-[2px]" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 max-h-[85vh] w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-[28px] bg-card p-7 shadow-float">
          <div className="mb-6 flex items-center justify-between">
            <Dialog.Title className="text-[22px] font-bold tracking-title text-foreground">
              Keyboard shortcuts
            </Dialog.Title>
            <Dialog.Close className="flex h-9 w-9 items-center justify-center rounded-full bg-secondary text-muted-foreground hover:bg-border hover:text-foreground">
              <X className="h-4 w-4" />
            </Dialog.Close>
          </div>

          <div className="space-y-6">
            {Object.entries(commandsBySection).map(([section, commands]) => (
              <div key={section}>
                <h3 className="etiquette mb-3">{section}</h3>
                <div className="divide-y divide-border">
                  {commands.map((command) => (
                    <div
                      key={command.id}
                      className="flex items-center justify-between py-2.5 text-sm"
                    >
                      <span className="text-foreground">{command.title}</span>
                      {formatShortcut(command.shortcut) && (
                        <kbd className="flex-shrink-0">
                          {formatShortcut(command.shortcut)}
                        </kbd>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
