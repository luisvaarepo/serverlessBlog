import type { BlogPost } from '../types';
import type { Page } from '../app/types';
import PostCard from '../components/posts/PostCard';

interface HomePageProps {
  loading: boolean;
  recentPosts: BlogPost[];
  postsTotalItems: number;
  homePostLimit: number;
  isDarkTheme: boolean;
  markdownContentClassName: string;
  onNavigate: (page: Page) => void;
  onOpenPost: (postId: string) => void;
}

/**
 * Renders home hero content and a feed of recent posts.
 * @param loading Indicates whether recent posts are loading.
 * @param recentPosts Latest posts to show on the home page.
 * @param postsTotalItems Total available posts in the system.
 * @param homePostLimit Number of posts shown in the home preview.
 * @param isDarkTheme Indicates whether dark mode classes are active.
 * @param markdownContentClassName Shared markdown style class string.
 * @param onNavigate Callback to switch to another page.
 * @param onOpenPost Callback to open a specific post.
 */
function HomePage({
  loading,
  recentPosts,
  postsTotalItems,
  homePostLimit,
  isDarkTheme,
  markdownContentClassName,
  onNavigate,
  onOpenPost
}: HomePageProps) {
  return (
    <section className="space-y-6">
      <section className={`rounded-2xl border p-6 ${isDarkTheme ? 'border-slate-800 bg-slate-900' : 'border-slate-200 bg-white'}`}>
        <p className={`text-sm font-semibold uppercase tracking-wide ${isDarkTheme ? 'text-teal-300' : 'text-teal-700'}`}>Welcome to Serverless Blog</p>
        <h1 className="mt-2 text-3xl font-bold text-slate-900 dark:text-slate-100">Create standout posts with AI speed and privacy-first control</h1>
        <p className="mt-3 text-slate-600 dark:text-slate-300">
          Draft faster with AI-aided generation, refine your voice in seconds, and publish with confidence. Your API keys stay on your device, never on our backend.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            className="rounded bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-500"
            onClick={() => onNavigate('posts')}
            type="button"
          >
            Browse all posts
          </button>
          <button
            className="rounded border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
            onClick={() => onNavigate('create')}
            type="button"
          >
            Write a post
          </button>
        </div>

        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <article className={`rounded-xl border p-4 ${isDarkTheme ? 'border-slate-700 bg-slate-800/60' : 'border-slate-200 bg-slate-50'}`}>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-teal-600 dark:text-teal-300">AI-aided creation</h2>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
              Turn rough ideas into publish-ready content with smart drafting support designed for technical writing.
            </p>
          </article>
          <article className={`rounded-xl border p-4 ${isDarkTheme ? 'border-slate-700 bg-slate-800/60' : 'border-slate-200 bg-slate-50'}`}>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-teal-600 dark:text-teal-300">Bring your own key (BYOK)</h2>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
              Security by design: your AI provider keys are stored locally on your device and are never saved on our backend.
            </p>
          </article>
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">Newest posts</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">Showing the latest {homePostLimit} posts</p>
        </div>
        {loading ? (
          <p className="text-slate-600 dark:text-slate-300">Loading...</p>
        ) : recentPosts.length === 0 ? (
          <p className="text-slate-600 dark:text-slate-300">No posts yet. Be the first to publish.</p>
        ) : (
          recentPosts.map((post) => (
            <PostCard
              key={post.id}
              post={post}
              isDarkTheme={isDarkTheme}
              markdownContentClassName={markdownContentClassName}
              clickable
              onOpenPost={onOpenPost}
              onStartEditing={() => undefined}
            />
          ))
        )}
        {!loading && postsTotalItems > homePostLimit && (
          <button
            className="rounded border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
            onClick={() => onNavigate('posts')}
            type="button"
          >
            View all {postsTotalItems} posts
          </button>
        )}
      </section>
    </section>
  );
}

export default HomePage;
