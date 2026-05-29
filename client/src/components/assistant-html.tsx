import { memo, useLayoutEffect, useMemo, useRef } from "react";
import DOMPurify, { type Config } from "dompurify";

type AssistantHtmlProps = {
  html: string;
  isStreaming?: boolean;
};

const sanitizerConfig: Config = {
  ALLOWED_TAGS: [
    "a",
    "blockquote",
    "br",
    "code",
    "em",
    "h2",
    "h3",
    "h4",
    "hr",
    "kbd",
    "li",
    "ol",
    "p",
    "pre",
    "span",
    "strong",
    "table",
    "tbody",
    "td",
    "th",
    "thead",
    "tr",
    "ul",
  ],
  ALLOWED_ATTR: ["aria-label", "colspan", "href", "rel", "rowspan", "title"],
};

function AssistantHtmlComponent({
  html,
  isStreaming = false,
}: AssistantHtmlProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const previousTextLengthRef = useRef(0);

  const sanitizedHtml = useMemo(
    () => DOMPurify.sanitize(html, sanitizerConfig),
    [html],
  );

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const textLength = container.textContent?.length ?? 0;

    if (!isStreaming) {
      if (container.querySelector(".assistant-stream-fragment")) {
        container.innerHTML = sanitizedHtml;
      }
      previousTextLengthRef.current = textLength;
      return;
    }

    const start = Math.min(previousTextLengthRef.current, textLength);
    if (textLength > start) {
      wrapTextRange(container, start, textLength);
    }

    previousTextLengthRef.current = textLength;
  }, [isStreaming, sanitizedHtml]);

  return (
    <div
      className="assistant-html"
      dangerouslySetInnerHTML={{ __html: sanitizedHtml }}
      data-streaming={isStreaming ? "true" : undefined}
      ref={containerRef}
    />
  );
}

export const AssistantHtml = memo(AssistantHtmlComponent);

function wrapTextRange(root: HTMLElement, start: number, end: number) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const textNodes: Text[] = [];

  while (walker.nextNode()) {
    textNodes.push(walker.currentNode as Text);
  }

  let offset = 0;

  for (const textNode of textNodes) {
    const value = textNode.nodeValue ?? "";
    const nodeStart = offset;
    const nodeEnd = offset + value.length;
    offset = nodeEnd;

    if (nodeEnd <= start || nodeStart >= end) continue;

    const rangeStart = Math.max(0, start - nodeStart);
    const rangeEnd = Math.min(value.length, end - nodeStart);
    if (rangeStart >= rangeEnd) continue;

    const fragment = document.createDocumentFragment();
    const before = value.slice(0, rangeStart);
    const streamed = value.slice(rangeStart, rangeEnd);
    const after = value.slice(rangeEnd);

    if (before) {
      fragment.append(document.createTextNode(before));
    }

    if (streamed) {
      const span = document.createElement("span");
      span.className = "assistant-stream-fragment";
      span.textContent = streamed;
      fragment.append(span);
    }

    if (after) {
      fragment.append(document.createTextNode(after));
    }

    textNode.replaceWith(fragment);
  }
}
