import type { BlogPost } from '../types';
import PostCard from '../components/posts/PostCard';

interface MyPostsPageProps {
  loading: boolean;
  posts: BlogPost[];
  postsPage: number;
  postsTotalPages: number;
  postsTotalItems: number;
  postsPerPage: number;
  isDarkTheme: boolean;
  markdownContentClassName: string;
  onOpenPost: (postId: string) => void;
  onStartEditing: (post: BlogPost) => void;
  onDeletePost: (post: BlogPost) => void;
  onPreviousPage: () => void;
  onNextPage: () => void;
}

/**
 * Shows the authenticated user's posts with pagination and edit actions.
 * @param loading Indicates whether post data is loading.
 * @param posts Current page of user-owned posts.
 * @param postsPage Current page number.
 * @param postsTotalPages Total page count.
 * @param postsTotalItems Total number of user posts.
 * @param postsPerPage Maximum items shown per page.
 * @param isDarkTheme Indicates whether dark mode classes are active.
 * @param markdownContentClassName Shared markdown style class string.
 * @param onOpenPost Callback to open full post details.
 * @param onStartEditing Callback to begin editing a selected post.
 * @param onDeletePost Callback to delete a selected post.
 * @param onPreviousPage Callback to move to previous page.
 * @param onNextPage Callback to move to next page.
 */
function MyPostsPage({
  loading,
  posts,
  postsPage,
  postsTotalPages,
  postsTotalItems,
  postsPerPage,
  isDarkTheme,
  markdownContentClassName,
  onOpenPost,
  onStartEditing,
  onDeletePost,
  onPreviousPage,
  onNextPage
}: MyPostsPageProps) {
  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">My posts</h2>
          <p className="text-sm text-slate-600 dark:text-slate-300">Manage your drafts and published posts.</p>
        </div>
        {!loading && postsTotalItems > 0 && (
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Page {postsPage} of {postsTotalPages}
          </p>
        )}
      </div>

      {loading ? (
        <p className="text-slate-600 dark:text-slate-300">Loading...</p>
      ) : posts.length === 0 ? (
        <p className="text-slate-600 dark:text-slate-300">You have not created posts yet.</p>
      ) : (
        <>
          {posts.map((post) => (
            <PostCard
              key={post.id}
              post={post}
              isDarkTheme={isDarkTheme}
              markdownContentClassName={markdownContentClassName}
              clickable
              editable
              deletable
              onOpenPost={onOpenPost}
              onStartEditing={onStartEditing}
              onDeletePost={onDeletePost}
            />
          ))}
          <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
            <button
              className="rounded border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:text-slate-200"
              onClick={onPreviousPage}
              type="button"
              disabled={postsPage === 1}
            >
              Previous
            </button>
            <span className="text-sm text-slate-600 dark:text-slate-300">
              Showing {(postsPage - 1) * postsPerPage + 1}-{Math.min(postsPage * postsPerPage, postsTotalItems)} of {postsTotalItems}
            </span>
            <button
              className="rounded border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:text-slate-200"
              onClick={onNextPage}
              type="button"
              disabled={postsPage === postsTotalPages}
            >
              Next
            </button>
          </div>
        </>
      )}
    </section>
  );
}

export default MyPostsPage;
