import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface ShortcutEntry {
  keys: string[];
  description: string;
}

interface ShortcutGroup {
  title: string;
  shortcuts: ShortcutEntry[];
}

const shortcutGroups: ShortcutGroup[] = [
  {
    title: "Navigation",
    shortcuts: [
      { keys: ["Ctrl", "K"], description: "Open command palette" },
      { keys: ["Ctrl", "\\"], description: "Toggle sidebar" },
      { keys: ["Ctrl", "Shift", "C"], description: "Collapse / expand all groups" },
      { keys: ["?"], description: "Show this shortcut sheet" },
    ],
  },
  {
    title: "Command Palette",
    shortcuts: [
      { keys: ["↑", "↓"], description: "Navigate results" },
      { keys: ["Enter"], description: "Go to selected page" },
      { keys: ["Esc"], description: "Close palette" },
    ],
  },
  {
    title: "General",
    shortcuts: [
      { keys: ["Esc"], description: "Close any dialog or overlay" },
    ],
  },
];

function Kbd({ children }: { children: string }) {
  return (
    <kbd className="inline-flex items-center justify-center min-w-[24px] h-6 px-1.5 rounded border border-border/60 bg-muted/40 text-[11px] font-mono font-medium text-foreground/80 shadow-[0_1px_0_1px_rgba(0,0,0,0.3)]">
      {children}
    </kbd>
  );
}

interface KeyboardShortcutSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function KeyboardShortcutSheet({ open, onOpenChange }: KeyboardShortcutSheetProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-lg font-display">Keyboard Shortcuts</DialogTitle>
          <DialogDescription className="text-muted-foreground text-sm">
            Quick reference for all available keyboard shortcuts.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-5 pt-2">
          {shortcutGroups.map((group) => (
            <div key={group.title}>
              <h3 className="text-[10px] uppercase tracking-widest font-semibold text-primary mb-2.5">
                {group.title}
              </h3>
              <div className="space-y-2">
                {group.shortcuts.map((shortcut, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between py-1.5 px-2 rounded-md hover:bg-muted/30 transition-colors"
                  >
                    <span className="text-sm text-foreground/90">{shortcut.description}</span>
                    <div className="flex items-center gap-1">
                      {shortcut.keys.map((key, j) => (
                        <span key={j} className="flex items-center gap-1">
                          <Kbd>{key}</Kbd>
                          {j < shortcut.keys.length - 1 && (
                            <span className="text-muted-foreground/40 text-xs">+</span>
                          )}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
        <div className="pt-3 border-t border-border/30">
          <p className="text-[11px] text-muted-foreground/60 text-center">
            On Mac, use <Kbd>⌘</Kbd> instead of <Kbd>Ctrl</Kbd>
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
