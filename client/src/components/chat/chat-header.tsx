import { SquarePen } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

type ChatHeaderProps = {
  activeSessionTitle?: string;
  isSending: boolean;
  onNewChat: () => void;
};

export function ChatHeader({
  activeSessionTitle,
  isSending,
  onNewChat,
}: ChatHeaderProps) {
  return (
    <header className="flex h-16 shrink-0 items-center justify-between border-b bg-background/90 px-4 backdrop-blur md:px-6">
      <div className="flex min-w-0 items-center gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium text-muted-foreground">
            AI Engineering Agent
          </p>
          <h1 className="truncate text-base font-semibold">
            {activeSessionTitle ?? "工程 Agent 工作台"}
          </h1>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Badge className="hidden rounded-full px-3 py-1 md:inline-flex" variant="secondary">
          DeepSeek
        </Badge>
        <Button
          className="rounded-full"
          size="sm"
          variant="outline"
          onClick={onNewChat}
          disabled={isSending}
        >
          <SquarePen className="size-4" aria-hidden="true" />
          新建
        </Button>
      </div>
    </header>
  );
}
