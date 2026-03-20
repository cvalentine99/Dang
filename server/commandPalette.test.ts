import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

/**
 * CommandPalette & KeyboardShortcutSheet — structural validation tests.
 *
 * Since these are client-side React components and vitest is configured
 * for server-side (node environment), we validate the source files
 * structurally to ensure:
 * 1. All required exports exist
 * 2. Navigation items are consistent with route registry
 * 3. Keyboard shortcut definitions are complete
 * 4. No broken imports
 */

const CLIENT_SRC = path.resolve(__dirname, "../client/src");

describe("CommandPalette component", () => {
  const filePath = path.join(CLIENT_SRC, "components/CommandPalette.tsx");

  it("file exists", () => {
    expect(fs.existsSync(filePath)).toBe(true);
  });

  it("exports CommandPalette function", () => {
    const content = fs.readFileSync(filePath, "utf-8");
    expect(content).toContain("export function CommandPalette");
  });

  it("includes all 7 navigation groups in command items", () => {
    const content = fs.readFileSync(filePath, "utf-8");
    const groups = ["Operations", "Detection", "Posture", "System", "Intelligence", "Admin", "Tools"];
    for (const group of groups) {
      expect(content).toContain(`group: "${group}"`);
    }
  });

  it("includes keyboard hint footer", () => {
    const content = fs.readFileSync(filePath, "utf-8");
    expect(content).toContain("Navigate");
    expect(content).toContain("Open");
    expect(content).toContain("Close");
  });

  it("uses CommandDialog from shadcn/ui", () => {
    const content = fs.readFileSync(filePath, "utf-8");
    expect(content).toContain("CommandDialog");
    expect(content).toContain("CommandInput");
    expect(content).toContain("CommandList");
    expect(content).toContain("CommandGroup");
    expect(content).toContain("CommandItem");
  });

  it("supports keyword-enhanced search", () => {
    const content = fs.readFileSync(filePath, "utf-8");
    // Each item should have keywords array for enhanced search
    expect(content).toContain("keywords:");
    // Specific keyword examples
    expect(content).toContain('"cve"');
    expect(content).toContain('"mitre"');
    expect(content).toContain('"dashboard"');
  });

  it("command items paths match route registry entries", () => {
    const cmdContent = fs.readFileSync(filePath, "utf-8");
    const registryPath = path.join(CLIENT_SRC, "lib/routeRegistry.ts");
    const registryContent = fs.readFileSync(registryPath, "utf-8");

    // Extract paths from command items (pattern: path: "/xxx")
    const cmdPathRegex = /path:\s*"(\/[^"]*?)"/g;
    const cmdPaths: string[] = [];
    let match;
    while ((match = cmdPathRegex.exec(cmdContent)) !== null) {
      cmdPaths.push(match[1]);
    }

    // Extract paths from route registry
    const regPathRegex = /path:\s*"(\/[^"]*?)"/g;
    const regPaths: string[] = [];
    while ((match = regPathRegex.exec(registryContent)) !== null) {
      regPaths.push(match[1]);
    }

    // Every command palette path should exist in the route registry
    for (const cmdPath of cmdPaths) {
      expect(regPaths).toContain(cmdPath);
    }
  });

  it("has no duplicate paths in command items", () => {
    const content = fs.readFileSync(filePath, "utf-8");
    const pathRegex = /path:\s*"(\/[^"]*?)"/g;
    const paths: string[] = [];
    let match;
    while ((match = pathRegex.exec(content)) !== null) {
      paths.push(match[1]);
    }
    const unique = new Set(paths);
    expect(unique.size).toBe(paths.length);
  });
});

describe("KeyboardShortcutSheet component", () => {
  const filePath = path.join(CLIENT_SRC, "components/KeyboardShortcutSheet.tsx");

  it("file exists", () => {
    expect(fs.existsSync(filePath)).toBe(true);
  });

  it("exports KeyboardShortcutSheet function", () => {
    const content = fs.readFileSync(filePath, "utf-8");
    expect(content).toContain("export function KeyboardShortcutSheet");
  });

  it("documents all implemented keyboard shortcuts", () => {
    const content = fs.readFileSync(filePath, "utf-8");
    // All shortcuts that exist in DashboardLayout
    expect(content).toContain("command palette"); // Ctrl+K
    expect(content).toContain("Toggle sidebar"); // Ctrl+\
    expect(content).toContain("Collapse"); // Ctrl+Shift+C
    expect(content).toContain("shortcut sheet"); // ?
  });

  it("includes Navigation and Command Palette shortcut groups", () => {
    const content = fs.readFileSync(filePath, "utf-8");
    expect(content).toContain('"Navigation"');
    expect(content).toContain('"Command Palette"');
    expect(content).toContain('"General"');
  });

  it("shows Mac modifier hint", () => {
    const content = fs.readFileSync(filePath, "utf-8");
    // Should mention Mac users can use ⌘ instead of Ctrl
    expect(content.includes("Mac") || content.includes("\u2318")).toBe(true);
  });

  it("uses Dialog from shadcn/ui", () => {
    const content = fs.readFileSync(filePath, "utf-8");
    expect(content).toContain("Dialog");
    expect(content).toContain("DialogContent");
    expect(content).toContain("DialogHeader");
    expect(content).toContain("DialogTitle");
  });
});

describe("DashboardLayout keyboard shortcut integration", () => {
  const filePath = path.join(CLIENT_SRC, "components/DashboardLayout.tsx");

  it("exports menuItems array", () => {
    const content = fs.readFileSync(filePath, "utf-8");
    expect(content).toContain("export const menuItems");
  });

  it("imports CommandPalette component", () => {
    const content = fs.readFileSync(filePath, "utf-8");
    expect(content).toContain('import { CommandPalette }');
  });

  it("imports KeyboardShortcutSheet component", () => {
    const content = fs.readFileSync(filePath, "utf-8");
    expect(content).toContain('import { KeyboardShortcutSheet }');
  });

  it("has Ctrl+K handler for command palette", () => {
    const content = fs.readFileSync(filePath, "utf-8");
    expect(content).toContain("e.key === 'k'");
    expect(content).toContain("setCommandPaletteOpen");
  });

  it("has ? handler for shortcut sheet", () => {
    const content = fs.readFileSync(filePath, "utf-8");
    expect(content).toContain("e.key === '?'");
    expect(content).toContain("setShortcutSheetOpen");
  });

  it("has Ctrl+\\ handler for sidebar toggle", () => {
    const content = fs.readFileSync(filePath, "utf-8");
    expect(content).toContain("toggleSidebar");
  });

  it("has Ctrl+Shift+C handler for collapse all", () => {
    const content = fs.readFileSync(filePath, "utf-8");
    expect(content).toContain("toggleAllGroups");
  });

  it("skips shortcuts when typing in inputs", () => {
    const content = fs.readFileSync(filePath, "utf-8");
    expect(content).toContain("isContentEditable");
    expect(content).toContain("INPUT");
    expect(content).toContain("TEXTAREA");
  });

  it("renders CommandPalette and KeyboardShortcutSheet in JSX", () => {
    const content = fs.readFileSync(filePath, "utf-8");
    expect(content).toContain("<CommandPalette");
    expect(content).toContain("<KeyboardShortcutSheet");
  });
});
