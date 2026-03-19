import type { BlogPost } from '../types';
import PostCard from '../components/posts/PostCard';

interface PostDetailPageProps {
  loading: boolean;
  post: BlogPost | null;
  isDarkTheme: boolean;
  markdownContentClassName: string;
  onNavigateToPosts: () => void;
  onOpenPost: (postId: string) => void;
}

/**
 * Shows one full post and a navigation action back to list view.
 * @param loading Indicates whether the selected post is loading.
 * @param post Selected post data or `null` when unavailable.
 * @param isDarkTheme Indicates whether dark mode classes are active.
 * @param markdownContentClassName Shared markdown style class string.
 * @param onNavigateToPosts Callback that returns to posts list.
 * @param onOpenPost Callback to open another post id.
 */
function PostDetailPage({
  loading,
  post,
  isDarkTheme,
  markdownContentClassName,
  onNavigateToPosts,
  onOpenPost
}: PostDetailPageProps) {
  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <button
          className="rounded border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
          onClick={onNavigateToPosts}
          type="button"
        >
          Back to all posts
        </button>
      </div>

      {loading ? (
        <p className="text-slate-600 dark:text-slate-300">Loading...</p>
      ) : post ? (
        <PostCard
          post={post}
          isDarkTheme={isDarkTheme}
          markdownContentClassName={markdownContentClassName}
          onOpenPost={onOpenPost}
          onStartEditing={() => undefined}
        />
      ) : (
        <p className="text-slate-600 dark:text-slate-300">Post not found.</p>
      )}
    </section>
  );
}

export default PostDetailPage;
