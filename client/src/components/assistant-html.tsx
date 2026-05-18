import { memo, useMemo } from "react";
import DOMPurify, { type Config } from "dompurify";

type AssistantHtmlProps = {
  html: string;
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

function AssistantHtmlComponent({ html }: AssistantHtmlProps) {
  const sanitizedHtml = useMemo(
    () => DOMPurify.sanitize(html, sanitizerConfig),
    [html],
  );

  return (
    <div
      className="assistant-html"
      dangerouslySetInnerHTML={{ __html: sanitizedHtml }}
    />
  );
}

export const AssistantHtml = memo(AssistantHtmlComponent);
