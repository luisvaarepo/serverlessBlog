import '@uiw/react-md-editor/markdown-editor.css';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { createPost, deletePost, fetchMyPosts, fetchPostById, fetchPosts, login, register, updatePost } from './api';
import type { AiPreferences, BlogPost, UserRole } from './types';
import type { Page, Theme } from './app/types';
import Navbar from './components/navigation/Navbar';
import { sanitizeAuthPayload, validateAuthInput } from './features/auth/validation';
import { listGeminiGenerateContentModels } from './features/ai/client';
import { clampNumber, AI_PREFERENCES_STORAGE_KEY, DEFAULT_GEMINI_MODELS, parseAiPreferences } from './features/ai/preferences';
import { loadPostForEditing } from './features/posts/editing';
import { MIN_POST_CONTENT_LENGTH, MIN_POST_TITLE_LENGTH, validatePostInput } from './features/posts/validation';
import AuthPage from './pages/AuthPage';
import CreatePostPage from './pages/CreatePostPage';
import HomePage from './pages/HomePage';
import MyPostsPage from './pages/MyPostsPage';
import PostDetailPage from './pages/PostDetailPage';
import PostsPage from './pages/PostsPage';
import PreferencesPage from './pages/PreferencesPage';
import { decodeTokenSubject } from './utils/auth';

const TOKEN_STORAGE_KEY = 'blogAuthToken';
const THEME_STORAGE_KEY = 'blogTheme';
const HOME_POST_LIMIT = 5;
const POSTS_PER_PAGE = 6;

/**
 * Reads persisted theme from local storage with a safe default.
 * @returns `'dark'` when selected previously; otherwise `'light'`.
 */
function getStoredTheme(): Theme {
  if (typeof window === 'undefined') {
    return 'light';
  }

  const rawTheme = localStorage.getItem(THEME_STORAGE_KEY);
  return rawTheme === 'dark' ? 'dark' : 'light';
}

/**
 * Resolves hash-based routing into app page state.
 * @returns Route info including target page, optional post id, and redirect hint.
 */
function getRouteFromHash(): { page: Page; postId: string | null; redirectToHome: boolean } {
  const hash = window.location.hash.replace('#', '').trim();
  if (!hash) {
    return { page: 'home', postId: null, redirectToHome: false };
  }

  const [segment, ...rest] = hash.split('/');
  const normalizedSegment = segment.toLowerCase();

  if (normalizedSegment === 'post' && rest.length > 0) {
    const decodedPostId = decodeURIComponent(rest.join('/')).trim();
    if (decodedPostId) {
      return { page: 'post', postId: decodedPostId, redirectToHome: false };
    }
  }

  if (normalizedSegment === 'create' && !localStorage.getItem(TOKEN_STORAGE_KEY)) {
    return { page: 'home', postId: null, redirectToHome: true };
  }

  if (
    normalizedSegment === 'posts'
    || normalizedSegment === 'my-posts'
    || normalizedSegment === 'create'
    || normalizedSegment === 'login'
    || normalizedSegment === 'register'
    || normalizedSegment === 'preferences'
  ) {
    return { page: normalizedSegment, postId: null, redirectToHome: false };
  }

  return { page: 'home', postId: null, redirectToHome: false };
}

/**
 * Root application component that coordinates routing, auth, data loading, and preferences.
 */
function App() {
  const [recentPosts, setRecentPosts] = useState<BlogPost[]>([]);
  const [paginatedPosts, setPaginatedPosts] = useState<BlogPost[]>([]);
  const [myPosts, setMyPosts] = useState<BlogPost[]>([]);
  const [selectedPost, setSelectedPost] = useState<BlogPost | null>(null);
  const [selectedPostId, setSelectedPostId] = useState<string | null>(null);
  const [editingPostId, setEditingPostId] = useState<string | null>(null);
  const [page, setPage] = useState<Page>('home');
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<UserRole>('reader');
  const [published, setPublished] = useState(true);
  const [token, setToken] = useState<string | null>(null);
  const [theme, setTheme] = useState<Theme>(() => getStoredTheme());
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [aiPreferences, setAiPreferences] = useState<AiPreferences>(() =>
    parseAiPreferences(typeof window === 'undefined' ? null : localStorage.getItem(AI_PREFERENCES_STORAGE_KEY))
  );
  const [geminiModels, setGeminiModels] = useState<string[]>(DEFAULT_GEMINI_MODELS);
  const [isRefreshingGeminiModels, setIsRefreshingGeminiModels] = useState(false);
  const [postsPage, setPostsPage] = useState(1);
  const [postsTotalPages, setPostsTotalPages] = useState(1);
  const [postsTotalItems, setPostsTotalItems] = useState(0);
  const [myPostsPage, setMyPostsPage] = useState(1);
  const [myPostsTotalPages, setMyPostsTotalPages] = useState(1);
  const [myPostsTotalItems, setMyPostsTotalItems] = useState(0);
  const [loading, setLoading] = useState(true);
  const [isPublishing, setIsPublishing] = useState(false);
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [error, setError] = useState('');

  const currentUsername = token ? decodeTokenSubject(token) : null;
  const isDarkTheme = theme === 'dark';
  const markdownContentClassName = `mt-2 leading-7 ${
    isDarkTheme
      ? 'text-slate-300 [&_a]:text-teal-400 [&_a]:hover:text-teal-300 [&_blockquote]:border-slate-700 [&_blockquote]:text-slate-300 [&_code]:bg-slate-800 [&_code]:text-slate-100'
      : 'text-slate-700 [&_a]:text-teal-600 [&_a]:hover:text-teal-500 [&_blockquote]:border-slate-300 [&_blockquote]:text-slate-600 [&_code]:bg-slate-100 [&_code]:text-slate-900'
  } [&_a]:underline [&_blockquote]:border-l-4 [&_blockquote]:pl-4 [&_blockquote]:italic [&_code]:rounded [&_code]:px-1 [&_code]:py-0.5 [&_h1]:text-3xl [&_h1]:font-bold [&_h2]:text-2xl [&_h2]:font-semibold [&_h3]:text-xl [&_h3]:font-semibold [&_ol]:list-decimal [&_ol]:pl-6 [&_p]:whitespace-pre-wrap [&_ul]:list-disc [&_ul]:pl-6`;

  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDarkTheme);
    document.body.classList.toggle('dark', isDarkTheme);
  }, [isDarkTheme]);

  useEffect(() => {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  }, [theme]);

  useEffect(() => {
    localStorage.setItem(AI_PREFERENCES_STORAGE_KEY, JSON.stringify(aiPreferences));
  }, [aiPreferences]);

  /**
   * Loads posts for the home page preview section.
   */
  const loadRecentPosts = useCallback(async function loadRecentPosts() {
    setLoading(true);
    setError('');

    try {
      const data = await fetchPosts({ page: 1, limit: HOME_POST_LIMIT });
      setRecentPosts(data.items);
      setPostsTotalItems(data.pagination.totalItems);
      setPostsTotalPages(data.pagination.totalPages);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * Loads one page of posts authored by the current user.
   * @param requestedPage Requested pagination page number.
   */
  const loadMyPostsPage = useCallback(async function loadMyPostsPage(requestedPage: number) {
    if (!token) {
      setMyPosts([]);
      setMyPostsTotalPages(1);
      setMyPostsTotalItems(0);
      setError('Login required to view your posts.');
      setLoading(false);
      return;
    }

    setLoading(true);
    setError('');

    try {
      const data = await fetchMyPosts({ page: requestedPage, limit: POSTS_PER_PAGE }, token);
      setMyPosts(data.items);
      setMyPostsTotalPages(data.pagination.totalPages);
      setMyPostsTotalItems(data.pagination.totalItems);
      setMyPostsPage((current) => (current === data.pagination.page ? current : data.pagination.page));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [token]);

  /**
   * Loads one page from the global posts listing.
   * @param requestedPage Requested pagination page number.
   */
  const loadPostsPage = useCallback(async function loadPostsPage(requestedPage: number) {
    setLoading(true);
    setError('');

    try {
      const data = await fetchPosts({ page: requestedPage, limit: POSTS_PER_PAGE });
      setPaginatedPosts(data.items);
      setPostsTotalPages(data.pagination.totalPages);
      setPostsTotalItems(data.pagination.totalItems);
      setPostsPage((current) => (current === data.pagination.page ? current : data.pagination.page));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * Loads one post for detail view.
   * @param postId Target post identifier.
   */
  const loadSinglePost = useCallback(async function loadSinglePost(postId: string) {
    setLoading(true);
    setError('');

    try {
      const post = await fetchPostById(postId, token);
      setSelectedPost(post);
    } catch (err) {
      setSelectedPost(null);
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [token]);

  /**
   * Navigates to another page and resets page-scoped state.
   * @param nextPage Destination page identifier.
   */
  function navigate(nextPage: Page) {
    setError('');
    setIsMenuOpen(false);

    if (nextPage === 'post') {
      return;
    }

    const resolvedPage = nextPage === 'create' && !token ? 'home' : nextPage;

    setPage(resolvedPage);
    setSelectedPostId(null);
    setSelectedPost(null);

    if (resolvedPage !== 'create') {
      setEditingPostId(null);
      setTitle('');
      setContent('');
      setPublished(true);
    }

    if (resolvedPage === 'posts') {
      setPostsPage(1);
    }

    if (resolvedPage === 'my-posts') {
      setMyPostsPage(1);
    }

    window.location.hash = resolvedPage === 'home' ? '' : resolvedPage;
  }

  /**
   * Navigates to post detail page using hash routing.
   * @param postId Target post identifier.
   */
  function navigateToPost(postId: string) {
    setError('');
    setSelectedPost(null);
    setSelectedPostId(postId);
    setPage('post');
    window.location.hash = `post/${encodeURIComponent(postId)}`;
  }

  /**
   * Starts edit mode for a post when current user is the author.
   * @param post Post selected for editing.
   */
  function startEditingPost(post: BlogPost) {
    setError('');

    if (!token) {
      setError('You must login to edit posts.');
      return;
    }

    if (!currentUsername || post.author !== currentUsername) {
      setError('Only the post author can edit this post.');
      return;
    }

    const authToken = token;
    void (async () => {
      try {
        const editablePost = await loadPostForEditing(post, authToken, fetchPostById);
        setEditingPostId(editablePost.id);
        setTitle(editablePost.title);
        setContent(editablePost.content);
        setPublished(editablePost.published ?? true);
        setPage('create');
        window.location.hash = 'create';
      } catch (err) {
        setError((err as Error).message);
      }
    })();
  }

  useEffect(() => {
    const storedToken = localStorage.getItem(TOKEN_STORAGE_KEY);
    if (storedToken) {
      setToken(storedToken);
    }

    const initialRoute = getRouteFromHash();
    setPage(initialRoute.page);
    setSelectedPostId(initialRoute.postId);

    if (initialRoute.redirectToHome) {
      window.location.hash = '';
    }

    const handleHashChange = () => {
      const nextRoute = getRouteFromHash();
      if (nextRoute.redirectToHome) {
        window.location.hash = '';
        return;
      }

      setPage(nextRoute.page);
      setSelectedPostId(nextRoute.postId);

      if (nextRoute.page === 'posts') {
        setPostsPage(1);
      }

      if (nextRoute.page === 'my-posts') {
        setMyPostsPage(1);
      }

      if (nextRoute.page !== 'post') {
        setSelectedPost(null);
      }

      if (nextRoute.page !== 'create') {
        setEditingPostId(null);
        setPublished(true);
      }

      setIsMenuOpen(false);
      setError('');
    };

    window.addEventListener('hashchange', handleHashChange);

    return () => {
      window.removeEventListener('hashchange', handleHashChange);
    };
  }, []);

  useEffect(() => {
    if (page === 'posts') {
      void loadPostsPage(postsPage);
      return;
    }

    if (page === 'my-posts') {
      void loadMyPostsPage(myPostsPage);
      return;
    }

    if (page === 'post' && selectedPostId) {
      void loadSinglePost(selectedPostId);
      return;
    }

    if (page === 'home') {
      void loadRecentPosts();
    }
  }, [page, postsPage, myPostsPage, selectedPostId, token, loadPostsPage, loadMyPostsPage, loadSinglePost, loadRecentPosts]);

  /**
   * Registers a user, signs in immediately, and returns to home.
   */
  async function handleRegister() {
    if (isAuthenticating) {
      return;
    }

    setError('');
    setIsAuthenticating(true);

    try {
      const validationError = validateAuthInput({ email, password, role });
      if (validationError) {
        throw new Error(validationError);
      }

      const sanitizedPayload = sanitizeAuthPayload({ email, password, role });
      await register(sanitizedPayload);
      const authToken = await login({ email: sanitizedPayload.email, password: sanitizedPayload.password });
      localStorage.setItem(TOKEN_STORAGE_KEY, authToken);
      setToken(authToken);
      setPassword('');
      setEditingPostId(null);
      navigate('home');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsAuthenticating(false);
    }
  }

  /**
   * Signs in user and stores session token in local storage.
   */
  async function handleLogin() {
    if (isAuthenticating) {
      return;
    }

    setError('');
    setIsAuthenticating(true);

    try {
      const validationError = validateAuthInput({ email, password });
      if (validationError) {
        throw new Error(validationError);
      }

      const sanitizedPayload = sanitizeAuthPayload({ email, password });
      const authToken = await login(sanitizedPayload);
      localStorage.setItem(TOKEN_STORAGE_KEY, authToken);
      setToken(authToken);
      setPassword('');
      setEditingPostId(null);
      navigate('home');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsAuthenticating(false);
    }
  }

  /**
   * Clears auth session and resets create/edit state.
   */
  function handleLogout() {
    localStorage.removeItem(TOKEN_STORAGE_KEY);
    setToken(null);
    setIsMenuOpen(false);
    setEditingPostId(null);
    setTitle('');
    setContent('');
    setPublished(true);
    navigate('home');
  }

  /**
   * Handles create/edit post form submission.
   * @param event Submit event from the create page form.
   */
  async function handleSubmit(event: FormEvent) {
    event.preventDefault();

    if (isPublishing) {
      return;
    }

    setError('');
    setIsPublishing(true);

    try {
      if (!token) {
        throw new Error('Login required to publish posts');
      }

      const validationError = validatePostInput(title, content);
      if (validationError) {
        throw new Error(validationError);
      }

      if (editingPostId) {
        await updatePost(editingPostId, { title: title.trim(), content: content.trim(), published }, token);
      } else {
        await createPost({ title: title.trim(), content: content.trim(), published }, token);
      }

      setEditingPostId(null);
      setTitle('');
      setContent('');
      setPublished(true);
      navigate(editingPostId ? 'my-posts' : 'home');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsPublishing(false);
    }
  }

  /**
   * Deletes an authored post and refreshes the current listing.
   * @param post Post selected for deletion.
   */
  async function handleDeletePost(post: BlogPost) {
    if (!token) {
      setError('You must login to delete posts.');
      return;
    }

    if (!window.confirm(`Delete "${post.title}"? This action cannot be undone.`)) {
      return;
    }

    setError('');
    try {
      await deletePost(post.id, token);
      await loadMyPostsPage(myPostsPage);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  /**
   * Updates a single AI preference key.
   * @param key Preference field name to update.
   * @param value New value for the selected field.
   */
  function updateAiPreference<Key extends keyof AiPreferences>(key: Key, value: AiPreferences[Key]) {
    setAiPreferences((current) => ({
      ...current,
      [key]: value
    }));
  }

  /**
   * Parses and clamps numeric AI preference inputs before storing them.
   * @param key Numeric preference field.
   * @param value Raw input value from a form control.
   * @param min Minimum allowed value.
   * @param max Maximum allowed value.
   */
  function handleAiNumberChange(
    key: 'temperature' | 'topP' | 'maxTokens' | 'presencePenalty' | 'frequencyPenalty',
    value: string,
    min: number,
    max: number
  ) {
    const parsed = Number(value);
    if (Number.isNaN(parsed)) {
      return;
    }

    updateAiPreference(key, clampNumber(parsed, min, max));
  }

  /**
   * Fetches latest Gemini model list and updates the selected model when needed.
   */
  async function handleRefreshGeminiModels() {
    if (isRefreshingGeminiModels) {
      return;
    }

    const apiKey = aiPreferences.geminiApiKey.trim();
    if (!apiKey) {
      setError('Add your Gemini API key in Preferences before refreshing models.');
      return;
    }

    setError('');
    setIsRefreshingGeminiModels(true);

    try {
      const models = await listGeminiGenerateContentModels(apiKey);

      if (models.length === 0) {
        throw new Error('No Gemini models supporting generateContent were found for your API key.');
      }

      setGeminiModels(models);
      setAiPreferences((current) => ({
        ...current,
        geminiModel: models.includes(current.geminiModel) ? current.geminiModel : models[0]
      }));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsRefreshingGeminiModels(false);
    }
  }

  return (
    <main className={`min-h-screen transition-colors ${isDarkTheme ? 'bg-slate-950 text-slate-100' : 'bg-slate-100 text-slate-900'}`}>
      <Navbar
        isDarkTheme={isDarkTheme}
        token={token}
        currentUsername={currentUsername}
        isMenuOpen={isMenuOpen}
        theme={theme}
        onNavigate={navigate}
        onToggleMenu={() => setIsMenuOpen((current) => !current)}
        onThemeChange={setTheme}
        onLogout={handleLogout}
      />

      <section className="mx-auto max-w-3xl space-y-6 p-6">
        {error && <p className="rounded bg-red-100 p-3 text-red-700 dark:bg-red-950 dark:text-red-200">{error}</p>}

        {page === 'home' && (
          <HomePage
            loading={loading}
            recentPosts={recentPosts}
            postsTotalItems={postsTotalItems}
            homePostLimit={HOME_POST_LIMIT}
            isDarkTheme={isDarkTheme}
            markdownContentClassName={markdownContentClassName}
            onNavigate={navigate}
            onOpenPost={navigateToPost}
          />
        )}

        {page === 'posts' && (
          <PostsPage
            loading={loading}
            posts={paginatedPosts}
            postsPage={postsPage}
            postsTotalPages={postsTotalPages}
            postsTotalItems={postsTotalItems}
            postsPerPage={POSTS_PER_PAGE}
            isDarkTheme={isDarkTheme}
            markdownContentClassName={markdownContentClassName}
            onOpenPost={navigateToPost}
            onPreviousPage={() => setPostsPage((current) => Math.max(1, current - 1))}
            onNextPage={() => setPostsPage((current) => Math.min(postsTotalPages, current + 1))}
          />
        )}

        {page === 'my-posts' && (
          <MyPostsPage
            loading={loading}
            posts={myPosts}
            postsPage={myPostsPage}
            postsTotalPages={myPostsTotalPages}
            postsTotalItems={myPostsTotalItems}
            postsPerPage={POSTS_PER_PAGE}
            isDarkTheme={isDarkTheme}
            markdownContentClassName={markdownContentClassName}
            onOpenPost={navigateToPost}
            onStartEditing={startEditingPost}
            onDeletePost={handleDeletePost}
            onPreviousPage={() => setMyPostsPage((current) => Math.max(1, current - 1))}
            onNextPage={() => setMyPostsPage((current) => Math.min(myPostsTotalPages, current + 1))}
          />
        )}

        {page === 'post' && (
          <PostDetailPage
            loading={loading}
            post={selectedPost}
            isDarkTheme={isDarkTheme}
            markdownContentClassName={markdownContentClassName}
            onNavigateToPosts={() => navigate('posts')}
            onOpenPost={navigateToPost}
          />
        )}

        {page === 'create' && (
          <CreatePostPage
            title={title}
            content={content}
            aiPreferences={aiPreferences}
            token={token}
            published={published}
            isPublishing={isPublishing}
            editingPostId={editingPostId}
            isDarkTheme={isDarkTheme}
            markdownContentClassName={markdownContentClassName}
            minPostTitleLength={MIN_POST_TITLE_LENGTH}
            minPostContentLength={MIN_POST_CONTENT_LENGTH}
            onSubmit={handleSubmit}
            onSetTitle={setTitle}
            onSetContent={setContent}
            onSetPublished={setPublished}
            onNavigate={navigate}
          />
        )}

        {page === 'preferences' && (
          <PreferencesPage
            aiPreferences={aiPreferences}
            geminiModels={geminiModels}
            isRefreshingGeminiModels={isRefreshingGeminiModels}
            onUpdatePreference={updateAiPreference}
            onUpdateNumberPreference={handleAiNumberChange}
            onRefreshGeminiModels={handleRefreshGeminiModels}
          />
        )}

        {(page === 'login' || page === 'register') && (
          <AuthPage
            mode={page}
            email={email}
            password={password}
            role={role}
            isAuthenticating={isAuthenticating}
            onSetEmail={setEmail}
            onSetPassword={setPassword}
            onSetRole={setRole}
            onLogin={() => {
              void handleLogin();
            }}
            onRegister={() => {
              void handleRegister();
            }}
          />
        )}
      </section>
    </main>
  );
}

export default App;
