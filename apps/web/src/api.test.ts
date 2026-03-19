import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Creates a JSON response for fetch mocks.
 * @param body Payload to serialize in the response body.
 * @param init Optional response init overrides.
 * @returns Response object with JSON content type.
 */
function jsonResponse(body: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: {
      'content-type': 'application/json'
    },
    ...init
  });
}

/**
 * Loads the API module after test-specific environment setup.
 * @returns Dynamically imported API module exports.
 */
async function loadApiModule() {
  vi.resetModules();
  return import('./api');
}

describe('api role behavior', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
    vi.stubEnv('VITE_API_BASE_URL', '/api');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    fetchMock.mockReset();
  });

  // Purpose: Ensure registration requests preserve the author role selection.
  it('sends author role when registering an author account', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ message: 'registered' }, { status: 201 }));
    const { register } = await loadApiModule();

    await register({ email: 'author@example.com', password: 'password123', role: 'author' });

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/register',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ email: 'author@example.com', password: 'password123', role: 'author' })
      })
    );
  });

  // Purpose: Ensure registration requests preserve the reader role selection.
  it('sends reader role when registering a reader account', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ message: 'registered' }, { status: 201 }));
    const { register } = await loadApiModule();

    await register({ email: 'reader@example.com', password: 'password123', role: 'reader' });

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/register',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ email: 'reader@example.com', password: 'password123', role: 'reader' })
      })
    );
  });

  // Purpose: Ensure create post surfaces role-based forbidden state as a session error.
  it('returns session guidance when create post is forbidden', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ message: 'author role required to create posts' }, { status: 403 })
    );
    const { createPost } = await loadApiModule();

    await expect(
      createPost({ title: 'T', content: 'Content', published: true }, 'reader-token')
    ).rejects.toThrow("Couldn't create post: author role required to create posts");
  });

  // Purpose: Ensure delete post maps forbidden responses to the author-only guidance message.
  it('returns author-only guidance when delete post is forbidden', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ message: 'author role required to delete posts' }, { status: 403 })
    );
    const { deletePost } = await loadApiModule();

    await expect(deletePost('post-1', 'reader-token')).rejects.toThrow('Only author accounts can delete their own posts.');
  });

  // Purpose: Ensure update post maps forbidden responses to ownership guidance.
  it('returns ownership guidance when update post is forbidden', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ message: 'only the post author can modify this post' }, { status: 403 })
    );
    const { updatePost } = await loadApiModule();

    await expect(
      updatePost('post-1', { title: 'Updated', content: 'Updated content', published: true }, 'reader-token')
    ).rejects.toThrow('Only the post author can edit this post.');
  });

  // Purpose: Ensure premium AI research requests are sent to the backend premium endpoint with auth.
  it('sends premium AI research request with topic and bearer token', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ output: { content: 'Content is here', content_type: 'text', sources: [] } }, { status: 200 })
    );
    const { generatePremiumPostResearch } = await loadApiModule();

    const result = await generatePremiumPostResearch('Edge AI observability', 'author-token');

    expect(result.output.content).toBe('Content is here');
    expect(result.output.sources).toEqual([]);
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/posts/premium',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ topic: 'Edge AI observability' }),
        headers: expect.objectContaining({ Authorization: 'Bearer author-token' })
      })
    );
  });

  // Purpose: Ensure premium AI backend messages are propagated to the caller.
  it('surfaces backend premium AI errors', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ message: 'premium ai beta is not configured' }, { status: 503 })
    );
    const { generatePremiumPostResearch } = await loadApiModule();

    await expect(generatePremiumPostResearch('Distributed systems', 'author-token')).rejects.toThrow(
      'Premium AI request failed: premium ai beta is not configured'
    );
  });

  // Purpose: Ensure registration conflict responses are mapped to a friendly account-exists message.
  it('maps register conflict responses to a friendly message', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ message: 'username already exists' }, { status: 409 })
    );
    const { register } = await loadApiModule();

    await expect(register({ email: 'author@example.com', password: 'password123', role: 'author' })).rejects.toThrow(
      'An account with this email already exists. Try logging in instead.'
    );
  });

  // Purpose: Ensure login unauthorized responses return a clear credentials message.
  it('maps login unauthorized responses to invalid credentials guidance', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ message: 'invalid credentials' }, { status: 401 })
    );
    const { login } = await loadApiModule();

    await expect(login({ email: 'author@example.com', password: 'wrong-password' })).rejects.toThrow(
      'Invalid email or password. Please try again.'
    );
  });
});
