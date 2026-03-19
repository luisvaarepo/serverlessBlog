import type { BlogPost } from '../../types';

interface LoadPostById {
  (postId: string, token: string): Promise<BlogPost>;
}

/**
 * Loads the full post payload before opening edit mode so markdown is never truncated.
 * @param post Post selected from a list view.
 * @param token Auth token for author-scoped read access.
 * @param loadPostById Function that retrieves a post by id from the API.
 * @returns Full post object ready to prefill the edit form.
 */
export async function loadPostForEditing(post: BlogPost, token: string, loadPostById: LoadPostById): Promise<BlogPost> {
  const fullPost = await loadPostById(post.id, token);
  return {
    ...post,
    ...fullPost,
    content: fullPost.content
  };
}
