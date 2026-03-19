export const MIN_POST_TITLE_LENGTH = 3;
export const MIN_POST_CONTENT_LENGTH = 3;

/**
 * Validates post title and content before submit.
 * @param rawTitle Raw title value typed by the user.
 * @param rawContent Raw markdown content typed by the user.
 * @returns A validation error message or `null` when input is valid.
 */
export function validatePostInput(rawTitle: string, rawContent: string): string | null {
  const normalizedTitle = rawTitle.trim();
  const normalizedContent = rawContent.trim();

  if (normalizedTitle.length < MIN_POST_TITLE_LENGTH) {
    return `Post title must be at least ${MIN_POST_TITLE_LENGTH} characters.`;
  }

  if (normalizedContent.length < MIN_POST_CONTENT_LENGTH) {
    return `Post content must be at least ${MIN_POST_CONTENT_LENGTH} characters.`;
  }

  return null;
}
