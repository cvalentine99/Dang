import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Code, Copy, Check } from "lucide-react";
import { useState } from "react";

interface RawJsonViewerProps {
  data: unknown;
  title?: string;
}

export function RawJsonViewer({ data, title = "Raw JSON" }: RawJsonViewerProps) {
  const [copied, setCopied] = useState(false);
  const json = JSON.stringify(data, null, 2);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(json);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="h-7 text-xs bg-transparent border-border hover:bg-accent gap-1.5"
        >
          <Code className="h-3 w-3" />
          JSON
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl max-h-[80vh] bg-card border-border">
        <DialogHeader>
          <DialogTitle className="font-display text-foreground flex items-center gap-2">
            {title}
            <Button
              variant="outline"
              size="sm"
              onClick={handleCopy}
              className="h-7 text-xs bg-transparent border-border ml-auto"
            >
              {copied ? (
                <Check className="h-3 w-3 text-threat-low" />
              ) : (
                <Copy className="h-3 w-3" />
              )}
              {copied ? "Copied" : "Copy"}
            </Button>
          </DialogTitle>
        </DialogHeader>
        <div className="overflow-auto max-h-[60vh] rounded-lg bg-secondary/50 p-4 border border-border">
          <pre className="text-xs font-mono text-foreground whitespace-pre-wrap break-all">
            {json}
          </pre>
        </div>
      </DialogContent>
    </Dialog>
  );
}
