import { GlassPanel } from "@/components/shared";
import { PageHeader } from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { trpc } from "@/lib/trpc";
import { Bot, Send, Trash2, Cpu, Loader2, AlertCircle } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Streamdown } from "streamdown";
import { nanoid } from "nanoid";
import { toast } from "sonner";

interface ChatMsg {
  role: "user" | "assistant";
  content: string;
}

export default function Assistant() {
  const [sessionId] = useState(() => nanoid());
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  const modelStatusQ = trpc.hybridrag.modelStatus.useQuery(undefined, { staleTime: 60_000 });
  const chatMut = trpc.hybridrag.chat.useMutation({
    onSuccess: (data) => {
      setMessages((prev) => [...prev, { role: "assistant", content: data.response }]);
    },
    onError: (err) => {
      toast.error(`AI Error: ${err.message}`);
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: `Error: ${err.message}` },
      ]);
    },
  });

  const clearMut = trpc.hybridrag.clearSession.useMutation({
    onSuccess: () => {
      setMessages([]);
      toast.success("Session cleared");
    },
  });

  const handleSend = useCallback(() => {
    const text = input.trim();
    if (!text || chatMut.isPending) return;
    setMessages((prev) => [...prev, { role: "user", content: text }]);
    setInput("");
    chatMut.mutate({
      sessionId,
      message: text,
      injectWazuhContext: true,
    });
  }, [input, sessionId, chatMut]);

  // Auto-scroll
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  const modelInfo = modelStatusQ.data;

  return (
    <div className="flex flex-col h-[calc(100vh-6rem)]">
      <PageHeader
        title="AI Security Assistant"
        subtitle="HybridRAG powered by NVIDIA Nemotron 3 Nano"
      >
        {/* Model status indicator */}
        <div className="flex items-center gap-2 text-xs">
          <Cpu className="h-3.5 w-3.5 text-primary" />
          <span className="text-muted-foreground">
            {modelInfo?.nemotron.available ? (
              <span className="text-[oklch(0.765_0.177_163.223)]">Nemotron Nano ●</span>
            ) : (
              <span className="text-[oklch(0.795_0.184_86.047)]">Fallback LLM ●</span>
            )}
          </span>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => clearMut.mutate({ sessionId })}
          disabled={clearMut.isPending || messages.length === 0}
          className="h-8 text-xs bg-transparent border-border gap-1.5"
        >
          <Trash2 className="h-3 w-3" />
          Clear
        </Button>
      </PageHeader>

      {/* ── Chat area ─────────────────────────────────────── */}
      <div className="flex-1 flex flex-col glass-panel overflow-hidden">
        {/* Messages */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full text-center">
              <div className="h-16 w-16 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center mb-4 amethyst-glow">
                <Bot className="h-8 w-8 text-primary" />
              </div>
              <h3 className="font-display font-semibold text-foreground text-lg mb-2">
                Dang! Security Assistant
              </h3>
              <p className="text-sm text-muted-foreground max-w-md">
                Ask me about alerts, agent health, vulnerabilities, MITRE ATT&CK techniques,
                compliance checks, or any security topic. I have access to your live Wazuh telemetry.
              </p>
              <div className="flex flex-wrap gap-2 mt-6 max-w-lg justify-center">
                {[
                  "Summarize current agent health status",
                  "What are the top critical vulnerabilities?",
                  "Explain MITRE T1059 technique",
                  "How to investigate a FIM alert?",
                  "What compliance frameworks are failing?",
                ].map((suggestion) => (
                  <button
                    key={suggestion}
                    onClick={() => {
                      setInput(suggestion);
                    }}
                    className="text-xs px-3 py-1.5 rounded-full bg-secondary/50 border border-border text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((msg, i) => (
            <div
              key={i}
              className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[80%] rounded-xl px-4 py-3 ${
                  msg.role === "user"
                    ? "bg-primary/20 border border-primary/30 text-foreground"
                    : "bg-secondary/50 border border-border text-foreground"
                }`}
              >
                {msg.role === "assistant" ? (
                  <div className="text-sm prose prose-invert prose-sm max-w-none">
                    <Streamdown>{msg.content}</Streamdown>
                  </div>
                ) : (
                  <p className="text-sm">{msg.content}</p>
                )}
              </div>
            </div>
          ))}

          {chatMut.isPending && (
            <div className="flex justify-start">
              <div className="bg-secondary/50 border border-border rounded-xl px-4 py-3 flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin text-primary" />
                <span className="text-sm text-muted-foreground">Analyzing...</span>
              </div>
            </div>
          )}
        </div>

        {/* Input */}
        <div className="border-t border-border p-4">
          <div className="flex gap-2">
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              placeholder="Ask about alerts, agents, vulnerabilities, compliance..."
              className="flex-1 bg-secondary/50 border-border"
              disabled={chatMut.isPending}
            />
            <Button
              onClick={handleSend}
              disabled={!input.trim() || chatMut.isPending}
              className="bg-primary hover:bg-primary/90 text-primary-foreground px-4"
            >
              <Send className="h-4 w-4" />
            </Button>
          </div>
          <div className="flex items-center gap-2 mt-2 text-[10px] text-muted-foreground">
            <AlertCircle className="h-3 w-3" />
            <span>Read-only assistant. Cannot modify Wazuh configuration or trigger actions.</span>
          </div>
        </div>
      </div>
    </div>
  );
}
