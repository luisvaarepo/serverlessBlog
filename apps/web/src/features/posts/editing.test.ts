import { describe, expect, it, vi } from 'vitest';
import type { BlogPost } from '../../types';
import { loadPostForEditing } from './editing';

/**
 * Creates a blog post fixture with optional overrides for tests.
 * @param overrides Values that should replace default fixture fields.
 * @returns A complete `BlogPost` test object.
 */
function createPostFixture(overrides: Partial<BlogPost> = {}): BlogPost {
  return {
    id: 'post-1',
    title: 'My title',
    content: 'short preview',
    createdAt: '2026-01-01T00:00:00.000Z',
    author: 'author@example.com',
    published: true,
    ...overrides
  };
}

describe('loadPostForEditing', () => {
  // Purpose: Ensure edit mode does not keep truncated preview text when opening an existing post.
  it('returns non-truncated markdown content for edit mode', async () => {
    const fullMarkdown = '# Intro\n\n- item 1\n- item 2\n\n```ts\nconsole.log("full");\n```\n\nFinal paragraph.';
    const listPost = createPostFixture({ content: fullMarkdown.slice(0, 18) });
    const fullPost = createPostFixture({ content: fullMarkdown });
    const loadPostById = vi.fn().mockResolvedValue(fullPost);

    const editablePost = await loadPostForEditing(listPost, 'token-123', loadPostById);

    expect(loadPostById).toHaveBeenCalledWith('post-1', 'token-123');
    expect(editablePost.content.length).toBeGreaterThan(listPost.content.length);
    expect(editablePost.content).not.toBe(listPost.content);
    expect(editablePost.content).toBe(fullPost.content);
  });
});
