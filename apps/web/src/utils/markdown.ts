const POST_PREVIEW_CONTENT_LIMIT = 200;

/**
 * Converts markdown content into plain text for short previews.
 * @param content Markdown text from a post.
 * @returns Text with markdown syntax removed.
 */
export function stripMarkdownFormatting(content: string): string {
  return content
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')
    .replace(/^\s{0,3}>\s?/gm, '')
    .replace(/^\s{0,3}([-*+]\s+)/gm, '')
    .replace(/^\s{0,3}\d+\.\s+/gm, '')
    .replace(/[~*_]/g, '')
    .replace(/\r?\n+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Creates a trimmed preview string for post cards.
 * @param content Full markdown content.
 * @returns A plain-text preview with maximum configured length.
 */
export function getPostPreview(content: string): string {
  const plainTextContent = stripMarkdownFormatting(content);

  if (plainTextContent.length <= POST_PREVIEW_CONTENT_LIMIT) {
    return plainTextContent;
  }

  return `${plainTextContent.slice(0, POST_PREVIEW_CONTENT_LIMIT).trimEnd()}…`;
}
