import type { KeyboardEvent, RefObject } from "react";
import { SendHorizontal, Square } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

type ChatComposerProps = {
  canSend: boolean;
  input: string;
  isSending: boolean;
  textareaRef: RefObject<HTMLTextAreaElement | null>;
  onInputChange: (value: string) => void;
  onStop: () => void;
  onSubmit: () => void;
};

export function ChatComposer({
  canSend,
  input,
  isSending,
  textareaRef,
  onInputChange,
  onStop,
  onSubmit,
}: ChatComposerProps) {
  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== "Enter" || event.shiftKey) return;

    event.preventDefault();
    onSubmit();
  }

  return (
    <form
      className="shrink-0 bg-linear-to-t from-background via-background to-background/70 px-3 pb-4 pt-3 md:px-6 md:pb-6"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      <div className="mx-auto flex w-full max-w-3xl items-end gap-2 rounded-3xl border bg-card p-2 shadow-lg shadow-black/5">
        <Textarea
          aria-label="Message"
          ref={textareaRef}
          value={input}
          onChange={(event) => onInputChange(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="发送消息或粘贴 GitHub 仓库链接"
          rows={1}
          className="max-h-45 min-h-10 resize-none border-0 bg-transparent px-3 py-2.5 text-base shadow-none focus-visible:ring-0 md:text-sm"
        />
        <Button
          className="size-10 rounded-full"
          type={isSending ? "button" : "submit"}
          size="icon"
          disabled={!isSending && !canSend}
          aria-label={isSending ? "停止生成" : "发送"}
          onClick={isSending ? onStop : undefined}
        >
          {isSending ? (
            <Square className="size-3.5 fill-current" aria-hidden="true" />
          ) : (
            <SendHorizontal className="size-4" aria-hidden="true" />
          )}
        </Button>
      </div>
    </form>
  );
}
