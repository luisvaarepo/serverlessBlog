/**
/**
 * Shape a raw post record into the public API response object.
 */
export function normalizeItem(item: Record<string, unknown>): PostItem {
  let author = typeof item.author === 'string' ? item.author.trim() : '';
  if (!author) {
    const legacyAuthor = typeof item.username === 'string' ? item.username.trim().toLowerCase() : '';
    author = legacyAuthor || 'unknown';
  }

  const published = typeof item.published === 'boolean' ? item.published : true;

  return {
    id: String(item.id ?? ''),
    title: String(item.title ?? ''),
    content: String(item.content ?? ''),
    createdAt: String(item.createdAt ?? ''),
    author,
    published
  };
}

/**
 * Build a list-view post and trim content for summaries.
 */
export function toPostListItem(item: Record<string, unknown>, contentLimit: number): PostItem {
  const normalized = normalizeItem(item);
  if (normalized.content.length > contentLimit) {
    return {
      ...normalized,
      content: normalized.content.slice(0, contentLimit)
    };
  }

  return normalized;
}

/**
 * Shared post shape returned by the API.
 */
export interface PostItem {
  id: string;
  title: string;
  content: string;
  createdAt: string;
  author: string;
  published: boolean;
}
