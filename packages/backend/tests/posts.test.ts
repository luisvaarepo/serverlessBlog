import { beforeEach, describe, expect, test } from 'vitest';
import {
  _createAccessToken,
  _premiumAiDependencies,
  _decodeAccessToken,
  _LOCAL_POSTS,
  _LOCAL_USERS,
  _validatePayload,
  DEFAULT_POSTS_LIMIT,
  handler,
  MAX_POSTS_LIMIT,
  POST_LIST_CONTENT_LIMIT,
  useInMemoryStorage
} from '../src/handlers/posts';

/**
 * Build a base API event with optional overrides.
 */
function buildEvent(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    httpMethod: 'GET',
    path: '/api/posts',
    headers: {},
    ...overrides
  };
}

/**
 * Parse a lambda response body JSON string.
 */
function parseBody(response: { body: string }): Record<string, unknown> {
  return JSON.parse(response.body) as Record<string, unknown>;
}

beforeEach(() => {
  process.env.LOCAL_DEV = 'true';
  process.env.USE_IN_MEMORY_LOCAL = 'true';
  delete process.env.DYNAMODB_ENDPOINT_URL;
  process.env.AUTH_SECRET = 'test-secret';
  delete process.env.INTERNAL_AI_API_KEY;
  delete process.env.YOU_COM_SEARCH_API_KEY;
  delete process.env.PREMIUM_AI_MODEL;
  delete process.env.PREMIUM_AI_SYSTEM_PROMPT;

  _LOCAL_POSTS.length = 0;
  for (const key of Object.keys(_LOCAL_USERS)) {
    delete _LOCAL_USERS[key];
  }

  _premiumAiDependencies.fetchResearchSources = async () => [];
  _premiumAiDependencies.generateMarkdown = async () => '# Premium draft\n\nGenerated content.';
});

describe('validation and auth helpers', () => {
  // Purpose: Confirm payload validation accepts required title and content fields.
  test('accepts valid payload', () => {
    const [valid, message] = _validatePayload({ title: 'Hello', content: 'World' });

    expect(valid).toBe(true);
    expect(message).toBe('');
  });

  // Purpose: Ensure payload validation rejects titles that are shorter than the minimum length.
  test('rejects short title', () => {
    const [valid, message] = _validatePayload({ title: 'Hi', content: 'Long enough' });

    expect(valid).toBe(false);
    expect(message).toContain('title');
  });

  // Purpose: Verify locally issued access tokens can be decoded back to the original username.
  test('creates and decodes token', () => {
    const token = _createAccessToken('alice');
    expect(_decodeAccessToken(token)).toBe('alice');
  });

  // Purpose: Confirm local development mode selects in-memory storage when no DynamoDB endpoint is configured.
  test('uses in-memory storage when local and endpoint is empty', () => {
    expect(useInMemoryStorage()).toBe(true);
  });
});

describe('auth and post routes', () => {
  // Purpose: Enforce authentication requirement for creating a post.
  test('requires authentication to create post', async () => {
    const response = await handler(
      buildEvent({
        httpMethod: 'POST',
        path: '/api/posts',
        body: JSON.stringify({ title: 'Hello', content: 'World' })
      })
    );

    expect(response.statusCode).toBe(401);
  });

  // Purpose: Validate end-to-end auth flow for register/login and post creation with author attribution.
  test('registers, logs in, and creates post', async () => {
    const registerResponse = await handler(
      buildEvent({
        httpMethod: 'POST',
        path: '/api/register',
        body: JSON.stringify({ email: 'alice@example.com', password: 'password123', role: 'author' })
      })
    );
    expect(registerResponse.statusCode).toBe(201);

    const loginResponse = await handler(
      buildEvent({
        httpMethod: 'POST',
        path: '/api/login',
        body: JSON.stringify({ email: 'alice@example.com', password: 'password123' })
      })
    );
    expect(loginResponse.statusCode).toBe(200);

    const token = String(parseBody(loginResponse).token);
    const createResponse = await handler(
      buildEvent({
        httpMethod: 'POST',
        path: '/api/posts',
        body: JSON.stringify({ title: 'Hello', content: 'World' }),
        headers: { Authorization: `Bearer ${token}` }
      })
    );

    expect(createResponse.statusCode).toBe(201);
    expect(parseBody(createResponse).author).toBe('alice@example.com');
  });

  // Purpose: Prevent duplicate account registration for an existing username.
  test('rejects duplicate username', async () => {
    await handler(
      buildEvent({
        httpMethod: 'POST',
        path: '/api/register',
        body: JSON.stringify({ email: 'alice@example.com', password: 'password123' })
      })
    );

    const duplicateResponse = await handler(
      buildEvent({
        httpMethod: 'POST',
        path: '/api/register',
        body: JSON.stringify({ email: 'alice@example.com', password: 'password123' })
      })
    );

    expect(duplicateResponse.statusCode).toBe(409);
  });

  // Purpose: Ensure role defaults to reader when omitted and login reflects that role.
  test('defaults registration role to reader and returns reader role on login', async () => {
    const registerResponse = await handler(
      buildEvent({
        httpMethod: 'POST',
        path: '/api/register',
        body: JSON.stringify({ email: 'reader-default@example.com', password: 'password123' })
      })
    );

    expect(registerResponse.statusCode).toBe(201);
    expect(parseBody(registerResponse).role).toBe('reader');

    const loginResponse = await handler(
      buildEvent({
        httpMethod: 'POST',
        path: '/api/login',
        body: JSON.stringify({ email: 'reader-default@example.com', password: 'password123' })
      })
    );

    expect(loginResponse.statusCode).toBe(200);
    expect(parseBody(loginResponse).role).toBe('reader');
  });

  // Purpose: Return a clear client error when login receives malformed JSON.
  test('returns 400 for invalid login JSON', async () => {
    const response = await handler(
      buildEvent({
        httpMethod: 'POST',
        path: '/api/login',
        body: '{'
      })
    );

    expect(response.statusCode).toBe(400);
    expect(parseBody(response).message).toBe('invalid JSON payload');
  });

  // Purpose: Ensure reader role cannot create posts.
  test('blocks create post for reader role', async () => {
    await handler(
      buildEvent({
        httpMethod: 'POST',
        path: '/api/register',
        body: JSON.stringify({ email: 'reader@example.com', password: 'password123', role: 'reader' })
      })
    );

    const loginResponse = await handler(
      buildEvent({
        httpMethod: 'POST',
        path: '/api/login',
        body: JSON.stringify({ email: 'reader@example.com', password: 'password123' })
      })
    );

    const token = String(parseBody(loginResponse).token);
    const createResponse = await handler(
      buildEvent({
        httpMethod: 'POST',
        path: '/api/posts',
        body: JSON.stringify({ title: 'Nope', content: 'Reader cannot publish' }),
        headers: { Authorization: `Bearer ${token}` }
      })
    );

    expect(createResponse.statusCode).toBe(403);
  });

  // Purpose: Enforce authentication requirement for premium AI draft generation.
  test('requires authentication to generate premium AI draft', async () => {
    const response = await handler(
      buildEvent({
        httpMethod: 'POST',
        path: '/api/posts/premium',
        body: JSON.stringify({ topic: 'Serverless best practices' })
      })
    );

    expect(response.statusCode).toBe(401);
  });

  // Purpose: Validate topic input before invoking premium AI generation.
  test('rejects premium AI draft request when topic is too short', async () => {
    const token = _createAccessToken('author@example.com');
    const response = await handler(
      buildEvent({
        httpMethod: 'POST',
        path: '/api/posts/premium',
        body: JSON.stringify({ topic: 'ai' }),
        headers: { Authorization: `Bearer ${token}` }
      })
    );

    expect(response.statusCode).toBe(400);
    expect(parseBody(response).message).toBe('topic must be at least 3 characters');
  });

  // Purpose: Return generated premium markdown and research sources when internal services succeed.
  test('generates premium AI draft using internal providers', async () => {
    process.env.INTERNAL_AI_API_KEY = 'internal-ai-key';
    process.env.YOU_COM_SEARCH_API_KEY = 'you-search-key';

    _premiumAiDependencies.fetchResearchSources = async () => [
      {
        title: 'Research article',
        url: 'https://example.com/research',
        snippet: 'Evidence summary.'
      }
    ];
    _premiumAiDependencies.generateMarkdown = async () => '# Premium Post\n\nDraft body.';

    const token = _createAccessToken('author@example.com');
    const response = await handler(
      buildEvent({
        httpMethod: 'POST',
        path: '/api/posts/premium',
        body: JSON.stringify({ topic: 'Building resilient APIs' }),
        headers: { Authorization: `Bearer ${token}` }
      })
    );

    expect(response.statusCode).toBe(200);
    const body = parseBody(response);
    expect(body.markdown).toContain('Premium Post');
    expect(body.sources).toEqual([
      {
        title: 'Research article',
        url: 'https://example.com/research',
        snippet: 'Evidence summary.'
      }
    ]);
  });

  // Purpose: Surface a clear message when You.com rejects the configured key.
  test('returns actionable message when You.com key is rejected', async () => {
    process.env.INTERNAL_AI_API_KEY = 'internal-ai-key';
    process.env.YOU_COM_SEARCH_API_KEY = 'invalid-you-key';

    _premiumAiDependencies.fetchResearchSources = async () => {
      throw new Error('you.com research unauthorized (403)');
    };

    const token = _createAccessToken('author@example.com');
    const response = await handler(
      buildEvent({
        httpMethod: 'POST',
        path: '/api/posts/premium',
        body: JSON.stringify({ topic: 'Distributed systems' }),
        headers: { Authorization: `Bearer ${token}` }
      })
    );

    expect(response.statusCode).toBe(502);
    expect(parseBody(response).message).toContain('YOU_COM_SEARCH_API_KEY');
  });

  // Purpose: Surface a clear message when You.com endpoint rejects research method.
  test('returns actionable message when You.com research returns method not allowed', async () => {
    process.env.INTERNAL_AI_API_KEY = 'internal-ai-key';
    process.env.YOU_COM_SEARCH_API_KEY = 'you-key';

    _premiumAiDependencies.fetchResearchSources = async () => {
      throw new Error('you.com research method not allowed (405)');
    };

    const token = _createAccessToken('author@example.com');
    const response = await handler(
      buildEvent({
        httpMethod: 'POST',
        path: '/api/posts/premium',
        body: JSON.stringify({ topic: 'Distributed systems' }),
        headers: { Authorization: `Bearer ${token}` }
      })
    );

    expect(response.statusCode).toBe(502);
    expect(parseBody(response).message).toContain('405');
  });

});

describe('list and update routes', () => {
  // Purpose: Ensure list results are sorted newest-first and include correct pagination metadata.
  test('returns paginated posts sorted by createdAt desc', async () => {
    _LOCAL_POSTS.push(
      {
        id: '1',
        title: 'Post 1',
        content: 'Content 1',
        createdAt: '2024-01-01T00:00:00+00:00',
        author: 'carol'
      },
      {
        id: '2',
        title: 'Post 2',
        content: 'Content 2',
        createdAt: '2024-01-02T00:00:00+00:00',
        username: 'Bob',
        published: true
      },
      {
        id: '3',
        title: 'Post 3',
        content: 'Content 3',
        createdAt: '2024-01-03T00:00:00+00:00',
        author: 'alice'
      }
    );

    const response = await handler(
      buildEvent({
        httpMethod: 'GET',
        path: '/api/posts',
        queryStringParameters: { page: '1', limit: '2' }
      })
    );

    expect(response.statusCode).toBe(200);
    const body = parseBody(response);
    expect(body.pagination).toEqual({ page: 1, limit: 2, totalItems: 3, totalPages: 2 });

    const items = body.items as Array<Record<string, unknown>>;
    expect(items).toHaveLength(2);
    expect(items[0].id).toBe('3');
    expect(items[1].author).toBe('bob');
  });

  // Purpose: Ensure public lists only include published posts.
  test('hides unpublished posts from public list', async () => {
    _LOCAL_POSTS.push(
      {
        id: 'public-1',
        title: 'Public',
        content: 'Public content',
        createdAt: '2024-01-01T00:00:00+00:00',
        author: 'alice',
        published: true
      },
      {
        id: 'draft-1',
        title: 'Draft',
        content: 'Draft content',
        createdAt: '2024-01-02T00:00:00+00:00',
        author: 'alice',
        published: false
      }
    );

    const response = await handler(
      buildEvent({
        httpMethod: 'GET',
        path: '/api/posts',
        queryStringParameters: { page: '1', limit: '10' }
      })
    );

    const body = parseBody(response);
    const items = body.items as Array<Record<string, unknown>>;
    expect(items).toHaveLength(1);
    expect(items[0].id).toBe('public-1');
  });

  // Purpose: Ensure list responses enforce summary-length content truncation.
  test('truncates content in list responses', async () => {
    _LOCAL_POSTS.push({
      id: '1',
      title: 'Long post',
      content: 'x'.repeat(250),
      createdAt: '2024-01-01T00:00:00+00:00',
      author: 'alice'
    });

    const response = await handler(
      buildEvent({
        httpMethod: 'GET',
        path: '/api/posts',
        queryStringParameters: { page: '1', limit: '10' }
      })
    );

    const body = parseBody(response);
    const items = body.items as Array<Record<string, unknown>>;
    expect(String(items[0].content)).toHaveLength(POST_LIST_CONTENT_LIMIT);
  });

  // Purpose: Verify mine=true returns only posts authored by the authenticated user.
  test('filters mine=true to authenticated user posts', async () => {
    _LOCAL_POSTS.push(
      {
        id: 'mine-1',
        title: 'Mine',
        content: 'Mine content',
        createdAt: '2024-01-02T00:00:00+00:00',
        author: 'alice'
      },
      {
        id: 'other-1',
        title: 'Other',
        content: 'Other content',
        createdAt: '2024-01-03T00:00:00+00:00',
        author: 'bob',
        published: false
      }
    );

    const token = _createAccessToken('alice');
    const response = await handler(
      buildEvent({
        httpMethod: 'GET',
        path: '/api/posts',
        queryStringParameters: { mine: 'true', page: '1', limit: '10' },
        headers: { Authorization: `Bearer ${token}` }
      })
    );

    expect(response.statusCode).toBe(200);
    const body = parseBody(response);
    const items = body.items as Array<Record<string, unknown>>;
    expect(items).toHaveLength(1);
    expect(items[0].id).toBe('mine-1');
  });

  // Purpose: Ensure authors can delete their own posts.
  test('deletes owned post', async () => {
    _LOCAL_POSTS.push({
      id: 'delete-1',
      title: 'Delete me',
      content: 'Delete me content',
      createdAt: '2024-01-01T00:00:00+00:00',
      author: 'alice',
      published: true
    });
    _LOCAL_USERS['alice'] = {
      passwordHash: 'x$y',
      role: 'author'
    };

    const token = _createAccessToken('alice');
    const deleteResponse = await handler(
      buildEvent({
        httpMethod: 'DELETE',
        path: '/api/posts/delete-1',
        headers: { Authorization: `Bearer ${token}` }
      })
    );

    expect(deleteResponse.statusCode).toBe(200);
    expect(_LOCAL_POSTS).toHaveLength(0);
  });

  // Purpose: Return not found details when attempting to update a non-existent post.
  test('returns 404 and postId when updating missing post', async () => {
    _LOCAL_USERS['alice'] = {
      passwordHash: 'x$y',
      role: 'author'
    };

    const token = _createAccessToken('alice');
    const response = await handler(
      buildEvent({
        httpMethod: 'PUT',
        path: '/api/posts/missing-id',
        body: JSON.stringify({ title: 'Attempt', content: 'Attempt content' }),
        headers: { Authorization: `Bearer ${token}` }
      })
    );

    expect(response.statusCode).toBe(404);
    expect(parseBody(response).postId).toBe('missing-id');
  });

  // Purpose: Allow owners to update their posts while denying updates from other users.
  test('updates owned post and rejects non-owner', async () => {
    _LOCAL_USERS['alice'] = {
      passwordHash: 'x$y',
      role: 'author'
    };
    _LOCAL_USERS['bob'] = {
      passwordHash: 'x$y',
      role: 'author'
    };

    _LOCAL_POSTS.push({
      id: 'edit-1',
      title: 'Old',
      content: 'Old content',
      createdAt: '2024-01-01T00:00:00+00:00',
      author: 'alice'
    });

    const aliceToken = _createAccessToken('alice');
    const updateResponse = await handler(
      buildEvent({
        httpMethod: 'PUT',
        path: '/api/posts/edit-1',
        body: JSON.stringify({ title: 'Updated', content: 'Updated content' }),
        headers: { Authorization: `Bearer ${aliceToken}` }
      })
    );

    expect(updateResponse.statusCode).toBe(200);
    expect(parseBody(updateResponse).title).toBe('Updated');

    const bobToken = _createAccessToken('bob');
    const forbiddenResponse = await handler(
      buildEvent({
        httpMethod: 'PUT',
        path: '/api/posts/edit-1',
        body: JSON.stringify({ title: 'Hack', content: 'Hack content' }),
        headers: { Authorization: `Bearer ${bobToken}` }
      })
    );

    expect(forbiddenResponse.statusCode).toBe(403);
  });

  // Purpose: Ensure reader role cannot update posts.
  test('blocks update post for reader role', async () => {
    _LOCAL_USERS['author@example.com'] = {
      passwordHash: 'x$y',
      role: 'author'
    };
    _LOCAL_USERS['reader@example.com'] = {
      passwordHash: 'x$y',
      role: 'reader'
    };

    _LOCAL_POSTS.push({
      id: 'reader-edit-block',
      title: 'Original',
      content: 'Original content',
      createdAt: '2024-01-01T00:00:00+00:00',
      author: 'author@example.com'
    });

    const readerToken = _createAccessToken('reader@example.com');
    const response = await handler(
      buildEvent({
        httpMethod: 'PUT',
        path: '/api/posts/reader-edit-block',
        body: JSON.stringify({ title: 'Updated', content: 'Updated content' }),
        headers: { Authorization: `Bearer ${readerToken}` }
      })
    );

    expect(response.statusCode).toBe(403);
  });

  // Purpose: Ensure reader role cannot delete posts.
  test('blocks delete post for reader role', async () => {
    _LOCAL_USERS['author@example.com'] = {
      passwordHash: 'x$y',
      role: 'author'
    };
    _LOCAL_USERS['reader@example.com'] = {
      passwordHash: 'x$y',
      role: 'reader'
    };

    _LOCAL_POSTS.push({
      id: 'reader-delete-block',
      title: 'Original',
      content: 'Original content',
      createdAt: '2024-01-01T00:00:00+00:00',
      author: 'author@example.com'
    });

    const readerToken = _createAccessToken('reader@example.com');
    const response = await handler(
      buildEvent({
        httpMethod: 'DELETE',
        path: '/api/posts/reader-delete-block',
        headers: { Authorization: `Bearer ${readerToken}` }
      })
    );

    expect(response.statusCode).toBe(403);
    expect(_LOCAL_POSTS).toHaveLength(1);
  });

  // Purpose: Enforce upper bound on requested list page size.
  test('caps oversized list limit to max', async () => {
    _LOCAL_POSTS.push({
      id: '1',
      title: 'Post 1',
      content: 'Content 1',
      createdAt: '2024-01-01T00:00:00+00:00',
      author: 'alice'
    });

    const response = await handler(
      buildEvent({
        httpMethod: 'GET',
        path: '/api/posts',
        queryStringParameters: { page: '1', limit: '999' }
      })
    );

    const body = parseBody(response);
    expect((body.pagination as Record<string, unknown>).limit).toBe(MAX_POSTS_LIMIT);
  });

  // Purpose: Fallback invalid pagination query values to safe defaults.
  test('falls back to default pagination values', async () => {
    _LOCAL_POSTS.push({
      id: '1',
      title: 'Post 1',
      content: 'Content 1',
      createdAt: '2024-01-01T00:00:00+00:00',
      author: 'alice'
    });

    const response = await handler(
      buildEvent({
        httpMethod: 'GET',
        path: '/api/posts',
        queryStringParameters: { page: '0', limit: 'not-a-number' }
      })
    );

    const body = parseBody(response);
    expect((body.pagination as Record<string, unknown>).page).toBe(1);
    expect((body.pagination as Record<string, unknown>).limit).toBe(DEFAULT_POSTS_LIMIT);
  });
});
