import type { BlogPost, UserRole } from './types';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

/**
 * Executes HTTP requests against the configured API base URL.
 * @param path Relative API path such as `/posts`.
 * @param init Optional fetch initialization options.
 * @returns Raw `Response` from `fetch`.
 */
async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  const url = `${getApiBaseUrl()}${getApiPath(normalizedPath)}`;
  return fetch(url, init);
}

/**
 * Reads a backend error payload and returns a user-friendly message.
 * @param response HTTP response returned by the backend.
 * @returns Error message when present, otherwise `null`.
 */
async function readErrorMessage(response: Response): Promise<string | null> {
  const contentType = response.headers.get('content-type') ?? '';
  if (!contentType.toLowerCase().includes('application/json')) {
    return null;
  }

  try {
    const body = (await response.clone().json()) as { message?: string };
    if (typeof body.message === 'string' && body.message.trim() !== '') {
      return body.message;
    }
  } catch {
    return null;
  }

  return null;
}

/**
 * Normalizes backend validation messages for create/update post flows.
 * @param message Raw backend message.
 * @returns Frontend-friendly validation text.
 */
function mapCreatePostValidationMessage(message: string): string {
  const normalized = message.toLowerCase();

  if ((normalized.includes('title') || normalized.includes('tittle')) && normalized.includes('at least 3')) {
    return 'Post title must be at least 3 characters.';
  }

  if (normalized.includes('content') && normalized.includes('at least 3')) {
    return 'Post content must be at least 3 characters.';
  }

  return message;
}

/**
 * Detects API Gateway style missing-route messages.
 * @param message Error message parsed from backend response.
 * @returns `true` when message indicates a missing authenticated route.
 */
function isMissingAuthTokenGatewayMessage(message: string | null): boolean {
  return typeof message === 'string' && message.toLowerCase().includes('missing authentication token');
}

/**
 * Resolves and validates the API base URL from environment variables.
 * @returns Normalized URL without a trailing slash.
 */
function getApiBaseUrl(): string {
  if (!API_BASE_URL) {
    throw new Error(
      'Missing VITE_API_BASE_URL. Create `.env` in the repository root based on `.env.example` and set VITE_API_BASE_URL.'
    );
  }

  return API_BASE_URL.replace(/\/$/, '');
}

/**
 * Builds the API path while handling optional `/api` prefix duplication.
 * @param path Relative or absolute API path.
 * @returns Corrected request path for backend routing.
 */
function getApiPath(path: string): string {
  const base = getApiBaseUrl();
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;

  if (normalizedPath.startsWith('/api/')) {
    return base.endsWith('/api') ? normalizedPath.slice('/api'.length) : normalizedPath;
  }

  return base.endsWith('/api') ? normalizedPath : `/api${normalizedPath}`;
}

interface PaginationInfo {
  page: number;
  limit: number;
  totalItems: number;
  totalPages: number;
}

export interface PaginatedPostsResponse {
  items: BlogPost[];
  pagination: PaginationInfo;
}

interface FetchPostsParams {
  page: number;
  limit: number;
}

/**
 * Fetches a paginated list of posts.
 * @param params Pagination inputs.
 * @param params.page Page number starting at 1.
 * @param params.limit Maximum items per page.
 * @returns Paginated post list and pagination metadata.
 */
export async function fetchPosts(params: FetchPostsParams): Promise<PaginatedPostsResponse> {
  const query = new URLSearchParams({
    page: String(params.page),
    limit: String(params.limit)
  });
  const attempts = [`/posts?${query.toString()}`];
  let lastResponse: Response | null = null;

  for (const path of attempts) {
    const response = await apiFetch(path);
    lastResponse = response;
    if (response.ok) {
      return response.json();
    }
  }

  if (!lastResponse) {
    throw new Error('Failed to fetch posts');
  }

  const backendMessage = await readErrorMessage(lastResponse);
  const statusText = `status ${lastResponse.status}`;
  if (backendMessage) {
    throw new Error(`Failed to fetch posts (${statusText}): ${backendMessage}`);
  }

  if (lastResponse.status === 500 && API_BASE_URL.startsWith('/')) {
    throw new Error('Failed to fetch posts (status 500): local backend is not running or crashed. Start `pnpm run dev:local`.');
  }

  throw new Error(`Failed to fetch posts (${statusText})`);
}

/**
 * Fetches the authenticated user's posts.
 * @param params Pagination inputs.
 * @param token Bearer token for the current user session.
 * @returns Paginated list restricted to the current user.
 */
export async function fetchMyPosts(params: FetchPostsParams, token: string): Promise<PaginatedPostsResponse> {
  const query = new URLSearchParams({
    page: String(params.page),
    limit: String(params.limit),
    mine: 'true'
  });
  const response = await apiFetch(`/posts?${query.toString()}`, {
    headers: {
      Authorization: `Bearer ${token}`
    }
  });

  if (!response.ok) {
    const backendMessage = await readErrorMessage(response);
    const statusText = `status ${response.status}`;

    if (response.status === 401 || response.status === 403) {
      throw new Error('Your session is no longer valid. Please log in again.');
    }

    if (backendMessage) {
      throw new Error(`Failed to fetch your posts (${statusText}): ${backendMessage}`);
    }

    throw new Error(`Failed to fetch your posts (${statusText})`);
  }

  return response.json();
}

/**
 * Loads a single post by identifier.
 * @param postId Unique post id.
 * @returns Full post payload.
 */
export async function fetchPostById(postId: string, token?: string | null): Promise<BlogPost> {
  const attempts = [`/posts/${encodeURIComponent(postId)}`, `/posts?id=${encodeURIComponent(postId)}`];
  let lastResponse: Response | null = null;

  for (const path of attempts) {
    const response = await apiFetch(path, token ? { headers: { Authorization: `Bearer ${token}` } } : undefined);
    lastResponse = response;
    if (response.ok) {
      return response.json();
    }

    const backendMessage = await readErrorMessage(response);
    const isMissingRoute = response.status === 403 && backendMessage?.toLowerCase().includes('missing authentication token');
    if (isMissingRoute) {
      continue;
    }

    const statusText = `status ${response.status}`;
    if (backendMessage) {
      throw new Error(`Failed to fetch post (${statusText}): ${backendMessage}`);
    }

    throw new Error(`Failed to fetch post (${statusText})`);
  }

  if (!lastResponse) {
    throw new Error('Failed to fetch post');
  }

  const backendMessage = await readErrorMessage(lastResponse);
  const statusText = `status ${lastResponse.status}`;
  if (backendMessage) {
    throw new Error(`Failed to fetch post (${statusText}): ${backendMessage}`);
  }

  throw new Error(`Failed to fetch post (${statusText})`);
}

interface AuthPayload {
  email: string;
  password: string;
  role?: UserRole;
}

export interface PremiumPostResearchResult {
  output: {
    content: string;
    content_type: string;
    sources: Array<{
      title: string;
      url: string;
      snippets: string[];
    }>;
  };
}

/**
 * Registers a new user account.
 * @param payload Credentials required by the backend.
 */
export async function register(payload: AuthPayload): Promise<void> {
  const response = await apiFetch('/register', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    throw new Error('Failed to register');
  }
}

/**
 * Authenticates a user and returns the access token.
 * @param payload Credentials required by the backend.
 * @returns JWT access token string.
 */
export async function login(payload: AuthPayload): Promise<string> {
  const response = await apiFetch('/login', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    throw new Error('Failed to login');
  }

  const data = (await response.json()) as { token: string };
  return data.token;
}

/**
 * Creates a new blog post.
 * @param payload Post title and markdown content.
 * @param token Bearer token for authenticated user.
 * @returns Newly created post.
 */
export async function createPost(payload: Pick<BlogPost, 'title' | 'content' | 'published'>, token: string): Promise<BlogPost> {
  const response = await apiFetch('/posts', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const backendMessage = await readErrorMessage(response);

    if (backendMessage) {
      throw new Error(`Couldn't create post: ${mapCreatePostValidationMessage(backendMessage)}`);
    }

    if (response.status === 401 || response.status === 403) {
      throw new Error('Your session is no longer valid. Please log in again and try publishing your post.');
    }

    throw new Error(`Couldn't create post (status ${response.status})`);
  }

  return response.json();
}

/**
 * Fetches premium AI research sources from the backend.
 * @param topic High-level post idea provided by the user.
 * @param token Bearer token for authenticated user.
 * @returns Normalized research sources for client-side blog generation.
 */
export async function generatePremiumPostResearch(topic: string, token: string): Promise<PremiumPostResearchResult> {
  const response = await apiFetch('/posts/premium', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify({ topic })
  });

  if (!response.ok) {
    const backendMessage = await readErrorMessage(response);

    if (response.status === 401 || response.status === 403) {
      throw new Error('Your session is no longer valid. Please log in again.');
    }

    if (backendMessage) {
      throw new Error(`Premium AI request failed: ${backendMessage}`);
    }

    throw new Error(`Premium AI request failed (status ${response.status})`);
  }

  return response.json();
}

/**
 * Deletes a post owned by the authenticated author.
 * @param postId Identifier of the post to delete.
 * @param token Bearer token for authenticated user.
 */
export async function deletePost(postId: string, token: string): Promise<void> {
  const response = await apiFetch(`/posts/${encodeURIComponent(postId)}`, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${token}`
    }
  });

  if (!response.ok) {
    const backendMessage = await readErrorMessage(response);

    if (response.status === 401) {
      throw new Error('Your session is no longer valid. Please log in again.');
    }

    if (response.status === 403) {
      throw new Error('Only author accounts can delete their own posts.');
    }

    if (response.status === 404) {
      throw new Error('Post not found. It may have already been deleted.');
    }

    if (backendMessage) {
      throw new Error(`Couldn't delete post: ${backendMessage}`);
    }

    throw new Error(`Couldn't delete post (status ${response.status})`);
  }
}

/**
 * Updates an existing blog post.
 * @param postId Identifier of the post to update.
 * @param payload New title and content values.
 * @param token Bearer token for authenticated user.
 * @returns Updated post payload.
 */
export async function updatePost(postId: string, payload: Pick<BlogPost, 'title' | 'content' | 'published'>, token: string): Promise<BlogPost> {
  if (!token || token.trim() === '') {
    throw new Error('You must be logged in to edit a post.');
  }

  const response = await apiFetch(`/posts/${encodeURIComponent(postId)}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const backendMessage = await readErrorMessage(response);

    if (isMissingAuthTokenGatewayMessage(backendMessage)) {
      throw new Error('Update endpoint is not available yet. Deploy the latest backend (PUT /api/posts/{id}) and try again.');
    }

    if (response.status === 401) {
      throw new Error('Your session is no longer valid. Please log in again.');
    }

    if (response.status === 403) {
      throw new Error('Only the post author can edit this post.');
    }

    if (backendMessage) {
      throw new Error(`Couldn't update post: ${mapCreatePostValidationMessage(backendMessage)}`);
    }

    if (response.status === 404) {
      throw new Error(`Couldn't update post: post ${postId} was not found. It may have been deleted.`);
    }

    throw new Error(`Couldn't update post (status ${response.status})`);
  }

  return response.json();
}
