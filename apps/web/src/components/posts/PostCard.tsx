import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { BlogPost } from '../../types';
import { getPostPreview } from '../../utils/markdown';

interface PostCardProps {
  post: BlogPost;
  isDarkTheme: boolean;
  markdownContentClassName: string;
  clickable?: boolean;
  editable?: boolean;
  deletable?: boolean;
  onOpenPost: (postId: string) => void;
  onStartEditing: (post: BlogPost) => void;
  onDeletePost?: (post: BlogPost) => void;
}

/**
 * Renders either a preview card or full content view for a blog post.
 * @param post Post data to render.
 * @param isDarkTheme Indicates whether dark mode classes are active.
 * @param markdownContentClassName Shared markdown style class string.
 * @param clickable Enables click-to-open interactions for list mode.
 * @param editable Enables edit action button for author-owned posts.
 * @param deletable Enables delete action button for author-owned posts.
 * @param onOpenPost Callback that opens a post by id.
 * @param onStartEditing Callback that starts edit flow for a post.
 * @param onDeletePost Optional callback that deletes a post.
 */
function PostCard({
  post,
  isDarkTheme,
  markdownContentClassName,
  clickable = false,
  editable = false,
  deletable = false,
  onOpenPost,
  onStartEditing,
  onDeletePost
}: PostCardProps) {
  const openPost = () => onOpenPost(post.id);
  const previewContent = getPostPreview(post.content);

  return (
    <article
      className={`rounded-lg p-4 shadow ${isDarkTheme ? 'bg-slate-900 shadow-slate-900/40' : 'bg-white'} ${clickable ? 'cursor-pointer' : ''}`}
      onClick={clickable ? openPost : undefined}
    >
      <h3 className={`text-lg font-semibold ${isDarkTheme ? 'text-slate-100' : 'text-slate-900'}`}>
        {clickable ? (
          <button
            type="button"
            className={`text-left hover:underline ${isDarkTheme ? 'text-slate-100' : 'text-slate-900'}`}
            onClick={(event) => {
              event.stopPropagation();
              openPost();
            }}
          >
            {post.title}
          </button>
        ) : (
          post.title
        )}
      </h3>
      {clickable ? (
        <p className={`mt-2 whitespace-pre-wrap ${isDarkTheme ? 'text-slate-300' : 'text-slate-700'}`}>{previewContent}</p>
      ) : (
        <ReactMarkdown className={markdownContentClassName} remarkPlugins={[remarkGfm]}>
          {post.content}
        </ReactMarkdown>
      )}
      <div className={`mt-3 flex flex-wrap items-center gap-3 text-sm ${isDarkTheme ? 'text-slate-400' : 'text-slate-500'}`}>
        <span>{new Date(post.createdAt).toLocaleString()}</span>
        <span>by {post.author ?? 'unknown'}</span>
        <span>{post.published === false ? 'Draft' : 'Published'}</span>
      </div>
      {clickable && (
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            className="rounded border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
            onClick={(event) => {
              event.stopPropagation();
              openPost();
            }}
          >
            Show more
          </button>
          {editable && (
            <button
              type="button"
              className="rounded border border-teal-500 px-3 py-2 text-sm font-medium text-teal-700 hover:bg-teal-50 dark:border-teal-400 dark:text-teal-300 dark:hover:bg-teal-950/40"
              onClick={(event) => {
                event.stopPropagation();
                onStartEditing(post);
              }}
            >
              Edit post
            </button>
          )}
          {deletable && onDeletePost && (
            <button
              type="button"
              className="rounded border border-red-500 px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-50 dark:border-red-400 dark:text-red-300 dark:hover:bg-red-950/40"
              onClick={(event) => {
                event.stopPropagation();
                onDeletePost(post);
              }}
            >
              Delete post
            </button>
          )}
        </div>
      )}
    </article>
  );
}

export default PostCard;
