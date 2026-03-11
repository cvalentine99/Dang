export function ServiceStateBadge({ state }: { state: string }) {
  const s = state.toLowerCase();
  const isRunning = s === "running";
  const isStopped = ["stopped", "dead", "inactive", "exited"].includes(s);
  const color = isRunning
    ? "bg-[oklch(0.765_0.177_163.223)]/15 text-[oklch(0.765_0.177_163.223)] border-[oklch(0.765_0.177_163.223)]/30"
    : isStopped
      ? "bg-[oklch(0.637_0.237_25.331)]/15 text-[oklch(0.637_0.237_25.331)] border-[oklch(0.637_0.237_25.331)]/30"
      : "bg-secondary/50 text-muted-foreground border-border";
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium border ${color}`}
    >
      <span
        className={`h-1.5 w-1.5 rounded-full mr-1.5 ${isRunning ? "bg-[oklch(0.765_0.177_163.223)]" : isStopped ? "bg-[oklch(0.637_0.237_25.331)]" : "bg-muted-foreground"}`}
      />
      {state}
    </span>
  );
}

export function ShellBadge({ shell }: { shell: string }) {
  const isLogin = shell && !shell.includes("nologin") && !shell.includes("false");
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium border ${
        isLogin
          ? "bg-[oklch(0.795_0.184_86.047)]/15 text-[oklch(0.795_0.184_86.047)] border-[oklch(0.795_0.184_86.047)]/30"
          : "bg-secondary/50 text-muted-foreground border-border"
      }`}
    >
      {isLogin ? "interactive" : "system"}
    </span>
  );
}
