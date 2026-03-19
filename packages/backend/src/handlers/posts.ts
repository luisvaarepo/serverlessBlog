import { randomUUID } from 'node:crypto';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DeleteCommand, DynamoDBDocumentClient, GetCommand, PutCommand, ScanCommand } from '@aws-sdk/lib-dynamodb';
import {
  createAccessToken,
  decodeAccessToken,
  DEFAULT_TOKEN_TTL_SECONDS,
  extractBearerToken,
  hashPassword,
  verifyPassword
} from './shared/auth';
import { response } from './shared/http';
import { ApiEvent, canonicalizePath, extractPostId, getPath, getQueryParams, parseBody, parseBool, parsePositiveInt } from './shared/request';
import { normalizeItem, PostItem, toPostListItem } from './posts_domain/formatters';
import { validateCredentials, validatePostPayload } from './posts_domain/validation';

export const TOKEN_TTL_SECONDS = DEFAULT_TOKEN_TTL_SECONDS;
export const DEFAULT_POSTS_PAGE = 1;
export const DEFAULT_POSTS_LIMIT = 10;
export const MAX_POSTS_LIMIT = 50;
export const POST_LIST_CONTENT_LIMIT = 200;
export const PREMIUM_AI_RESEARCH_RESULT_LIMIT = 5;
export const PREMIUM_AI_RESEARCH_MODE_DEFAULT = 'standard';
export const PREMIUM_AI_MAX_DURATION_MS = 24000;
export const YOU_COM_RESEARCH_ENDPOINT = 'https://api.you.com/v1/research';

export const _LOCAL_POSTS: Array<Record<string, unknown>> = [];
export const _LOCAL_USERS: Record<string, { passwordHash: string; role: 'author' | 'reader' }> = {};

export interface PremiumResearchSource {
  title: string;
  url: string;
  snippet: string;
}

export interface PremiumResearchResult {
  content: string;
  sources: PremiumResearchSource[];
}

export interface PremiumOutputSource {
  url: string;
  title: string;
  snippets: string[];
}

/**
 * Recursively collect non-empty string values from unknown payloads.
 */
function collectTextValues(value: unknown, depth = 0): string[] {
  if (depth > 5) {
    return [];
  }

  if (typeof value === 'string') {
    const normalized = value.trim();
    return normalized ? [normalized] : [];
  }

  if (Array.isArray(value)) {
    return value.flatMap((entry) => collectTextValues(entry, depth + 1));
  }

  if (!value || typeof value !== 'object') {
    return [];
  }

  return Object.values(value as Record<string, unknown>).flatMap((entry) => collectTextValues(entry, depth + 1));
}

/**
 * Extract a readable snippet from a normalized source candidate.
 */
function extractSnippet(entry: Record<string, unknown>): string {
  const directSnippet = firstNonEmptyString([
    entry.snippet,
    entry.description,
    entry.summary,
    entry.excerpt,
    entry.text,
    entry.content,
    entry.abstract,
    entry.body,
    entry.caption,
    entry.preview,
    entry.note,
    (entry.source as Record<string, unknown> | undefined)?.snippet,
    (entry.source as Record<string, unknown> | undefined)?.summary,
    (entry.source as Record<string, unknown> | undefined)?.description,
    (entry.source as Record<string, unknown> | undefined)?.content,
    (entry.document as Record<string, unknown> | undefined)?.snippet,
    (entry.document as Record<string, unknown> | undefined)?.summary,
    (entry.document as Record<string, unknown> | undefined)?.description,
    (entry.document as Record<string, unknown> | undefined)?.content,
    (entry.page as Record<string, unknown> | undefined)?.snippet,
    (entry.page as Record<string, unknown> | undefined)?.summary,
    (entry.page as Record<string, unknown> | undefined)?.description,
    (entry.page as Record<string, unknown> | undefined)?.content
  ]);

  if (directSnippet) {
    return directSnippet;
  }

  const nestedCandidates = collectTextValues([
    entry.highlights,
    entry.highlight,
    entry.snippets,
    entry.passages,
    entry.document,
    entry.source,
    entry.page
  ]);

  return nestedCandidates.find((candidate) => candidate.length > 20) ?? nestedCandidates[0] ?? '';
}

/**
 * Return the first non-empty string in a candidate list.
 */
function firstNonEmptyString(values: unknown[]): string {
  for (const value of values) {
    const normalized = String(value ?? '').trim();
    if (normalized) {
      return normalized;
    }
  }

  return '';
}

/**
 * Build a readable fallback title from a source URL.
 */
function titleFromUrl(url: string): string {
  try {
    const hostname = new URL(url).hostname.replace(/^www\./i, '').trim();
    return hostname || url;
  } catch {
    return url;
  }
}

/**
 * Recursively collect nested objects that look like source entries.
 */
function collectNestedSourceEntries(value: unknown, depth = 0): Array<Record<string, unknown>> {
  if (depth > 6) {
    return [];
  }

  if (Array.isArray(value)) {
    return value.flatMap((item) => collectNestedSourceEntries(item, depth + 1));
  }

  if (!value || typeof value !== 'object') {
    return [];
  }

  const entry = value as Record<string, unknown>;
  const hasUrlLikeField = firstNonEmptyString([
    entry.url,
    entry.link,
    entry.href,
    entry.sourceUrl,
    entry.source_url,
    entry.webUrl,
    entry.web_url
  ]) !== '';

  const collected = hasUrlLikeField ? [entry] : [];
  for (const nestedValue of Object.values(entry)) {
    collected.push(...collectNestedSourceEntries(nestedValue, depth + 1));
  }

  return collected;
}

export interface PremiumPostResearchResponse {
  output: {
    content: string;
    content_type: 'text';
    sources: PremiumOutputSource[];
  };
}

let documentClient: DynamoDBDocumentClient | null = null;

/**
 * Read the internal You.com search API key from environment variables.
 */
function getYouSearchApiKey(): string {
  return (process.env.YOU_COM_SEARCH_API_KEY ?? '').trim();
}

/**
 * Build output content from normalized sources when provider content is unavailable.
 */
function buildFallbackResearchContent(sources: PremiumResearchSource[]): string {
  if (sources.length === 0) {
    return '';
  }

  return sources
    .map((source, index) => `${index + 1}. ${source.title}: ${source.snippet}`)
    .join('\n');
}

/**
 * Convert normalized source entries to premium response source shape.
 */
function toPremiumOutputSources(sources: PremiumResearchSource[]): PremiumOutputSource[] {
  return sources.map((source) => ({
    url: source.url,
    title: source.title,
    snippets: [source.snippet || `Source: ${source.title}`]
  }));
}

/**
 * Resolve the You.com research mode used for premium search requests.
 */
function getYouResearchMode(): string {
  const configuredMode = (process.env.YOU_COM_RESEARCH_MODE ?? PREMIUM_AI_RESEARCH_MODE_DEFAULT).trim().toLowerCase();
  return configuredMode === '' ? PREMIUM_AI_RESEARCH_MODE_DEFAULT : configuredMode;
}

/**
 * Run an async operation with a time budget and reject when it takes too long.
 */
function withTimeout<T>(operation: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms`)), timeoutMs);

    operation
      .then((value) => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch((error) => {
        clearTimeout(timer);
        reject(error);
      });
  });
}

/**
 * Convert raw You.com search records into normalized source entries.
 */
function normalizeYouSearchSources(results: unknown): PremiumResearchSource[] {
  if (!Array.isArray(results)) {
    return [];
  }

  return results
    .map((entry) => entry as Record<string, unknown>)
    .map((entry) => {
      const url = firstNonEmptyString([
        entry.url,
        entry.link,
        entry.href,
        entry.sourceUrl,
        entry.source_url,
        entry.webUrl,
        entry.web_url,
        (entry.source as Record<string, unknown> | undefined)?.url,
        (entry.document as Record<string, unknown> | undefined)?.url
      ]);

      const title = firstNonEmptyString([
        entry.title,
        entry.name,
        entry.headline,
        entry.sourceName,
        entry.source_name,
        (entry.source as Record<string, unknown> | undefined)?.title,
        (entry.document as Record<string, unknown> | undefined)?.title
      ]) || titleFromUrl(url);

      const snippet = extractSnippet(entry);

      if (!url) {
        return null;
      }

      return {
        title,
        url,
        snippet: snippet || `Source: ${title}`
      };
    })
    .filter((entry): entry is PremiumResearchSource => entry !== null)
    .slice(0, PREMIUM_AI_RESEARCH_RESULT_LIMIT);
}

/**
 * Expose source normalization for tests.
 */
export function _normalizeYouSearchSources(results: unknown): PremiumResearchSource[] {
  return normalizeYouSearchSources(results);
}

/**
 * Execute a You.com research request for the provided topic.
 */
async function fetchYouResearchSources(topic: string, apiKey: string): Promise<PremiumResearchResult> {
  const requestBody = JSON.stringify({
    body: {
      input: '',
      research_effort: getYouResearchMode()
    },
    input: topic
  });

  const endpointsToTry = [YOU_COM_RESEARCH_ENDPOINT, `${YOU_COM_RESEARCH_ENDPOINT}/`];
  const headersToTry: Array<Record<string, string>> = [
    {
      'X-API-Key': apiKey,
      'Content-Type': 'application/json'
    },
    {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    }
  ];

  let sawMethodNotAllowed = false;

  let researchResponse: Response | null = null;
  for (const endpoint of endpointsToTry) {
    for (const headers of headersToTry) {
      try {
        researchResponse = await fetch(endpoint, {
          method: 'POST',
          headers,
          body: requestBody
        });
      } catch (error) {
        throw error;
      }

      if (researchResponse.ok) {
        break;
      }

      if (researchResponse.status === 401 || researchResponse.status === 403) {
        throw new Error(`you.com research unauthorized (${researchResponse.status})`);
      }

      if (researchResponse.status === 405) {
        sawMethodNotAllowed = true;
        continue;
      }

      throw new Error(`you.com research request failed with status ${researchResponse.status}`);
    }

    if (researchResponse?.ok) {
      break;
    }
  }

  if (!researchResponse?.ok) {
    if (sawMethodNotAllowed) {
      throw new Error('you.com research method not allowed (405)');
    }

    throw new Error('you.com research request failed with status unknown');
  }

  const payload = (await researchResponse.json()) as {
    output?: {
      content?: unknown;
      text?: unknown;
      summary?: unknown;
      answer?: unknown;
      sources?: unknown;
    };
    hits?: unknown;
    results?: unknown;
    sources?: unknown;
    data?: {
      hits?: unknown;
      results?: unknown;
      sources?: unknown;
      items?: unknown;
    };
  };

  const outputContent = firstNonEmptyString([
    payload.output?.content,
    payload.output?.text,
    payload.output?.summary,
    payload.output?.answer
  ]);
  const outputSources = normalizeYouSearchSources(payload.output?.sources);
  if (outputSources.length > 0) {
    return {
      content: outputContent || buildFallbackResearchContent(outputSources),
      sources: outputSources
    };
  }

  const candidates = payload.hits
    ?? payload.results
    ?? payload.sources
    ?? payload.data?.hits
    ?? payload.data?.results
    ?? payload.data?.sources
    ?? payload.data?.items;

  const directSources = normalizeYouSearchSources(candidates);
  if (directSources.length > 0) {
    return {
      content: outputContent || buildFallbackResearchContent(directSources),
      sources: directSources
    };
  }

  const nestedCandidates = collectNestedSourceEntries(payload);
  const nestedSources = normalizeYouSearchSources(nestedCandidates);
  return {
    content: outputContent || buildFallbackResearchContent(nestedSources),
    sources: nestedSources
  };
}

export const _premiumAiDependencies: {
  fetchResearchSources: (topic: string, apiKey: string) => Promise<PremiumResearchResult>;
} = {
  fetchResearchSources: fetchYouResearchSources
};

/**
 * Print local debug messages only when local-dev mode is enabled.
 */
function localLog(message: string): void {
  if (isLocalDev()) {
    // eslint-disable-next-line no-console
    console.log(`[local-debug] ${message}`);
  }
}

/**
 * Handle `POST /api/posts/premium` by returning You.com research sources for client-side premium generation.
 */
async function handleCreatePremiumPost(event: ApiEvent) {
  const token = extractToken(event);
  const username = token ? _decodeAccessToken(token) : null;

  if (!username) {
    return makeResponse(401, { message: 'authentication required' });
  }

  const [payload, parseError] = parseBody(event);
  if (parseError) {
    return makeResponse(400, { message: parseError });
  }

  const topic = String(payload.topic ?? '').trim();
  if (topic.length < 3) {
    return makeResponse(400, { message: 'topic must be at least 3 characters' });
  }

  const youSearchApiKey = getYouSearchApiKey();
  if (!youSearchApiKey) {
    return makeResponse(503, { message: 'premium ai beta is not configured' });
  }

  try {
    return await withTimeout((async () => {
      const research = await _premiumAiDependencies.fetchResearchSources(topic, youSearchApiKey);

      const responsePayload: PremiumPostResearchResponse = {
        output: {
          content: research.content,
          content_type: 'text',
          sources: toPremiumOutputSources(research.sources)
        }
      };

      return makeResponse(200, responsePayload);
    })(), PREMIUM_AI_MAX_DURATION_MS, 'premium ai request');
  } catch (error) {
    const reason = (error as Error).message;

    if (reason.startsWith('premium ai request timed out')) {
      localLog(`premium-ai error: ${reason}`);
      return makeResponse(504, { message: 'premium ai beta request timed out, please retry with a narrower topic' });
    }

    if (reason.startsWith('you.com research unauthorized')) {
      localLog(`premium-ai error: ${reason}`);
      return makeResponse(502, { message: 'you.com research key rejected (401/403). Check YOU_COM_SEARCH_API_KEY in your runtime environment.' });
    }

    if (reason.startsWith('you.com research method not allowed')) {
      localLog(`premium-ai error: ${reason}`);
      return makeResponse(502, { message: 'you.com research endpoint rejected request method (405). Verify endpoint/account API compatibility.' });
    }

    localLog(`premium-ai error: ${reason}`);
    return makeResponse(502, { message: 'premium ai beta request failed' });
  }
}

/**
 * Decide whether local execution should use in-memory collections.
 */
export function useInMemoryStorage(): boolean {
  if (!isLocalDev()) {
    return false;
  }

  const useInMemoryLocal = (process.env.USE_IN_MEMORY_LOCAL ?? 'true').toLowerCase() === 'true';
  if (!useInMemoryLocal) {
    return false;
  }

  const endpointUrl = (process.env.DYNAMODB_ENDPOINT_URL ?? '').trim();
  return endpointUrl === '';
}

/**
 * Return a human-readable storage mode label for diagnostics.
 */
function storageMode(): 'in-memory' | 'dynamodb' {
  return useInMemoryStorage() ? 'in-memory' : 'dynamodb';
}

/**
 * Return true when local-dev mode is enabled.
 */
function isLocalDev(): boolean {
  return (process.env.LOCAL_DEV ?? 'false').toLowerCase() === 'true';
}

/**
 * Create a DynamoDB document client, optionally pointing to a local endpoint.
 */
function getDocumentClient(): DynamoDBDocumentClient {
  if (documentClient) {
    return documentClient;
  }

  const endpoint = (process.env.DYNAMODB_ENDPOINT_URL ?? '').trim();
  const client = endpoint
    ? new DynamoDBClient({ endpoint, region: 'us-east-1' })
    : new DynamoDBClient({});

  documentClient = DynamoDBDocumentClient.from(client);
  return documentClient;
}

/**
 * Return the posts table name configured by environment variables.
 */
function getPostsTableName(): string {
  return process.env.POSTS_TABLE_NAME ?? 'BlogPosts';
}

/**
 * Return the users table name configured by environment variables.
 */
function getUsersTableName(): string {
  return process.env.USERS_TABLE_NAME ?? 'BlogUsers';
}

/**
 * Read the shared token-signing secret from environment variables.
 */
function getAuthSecret(): string {
  return process.env.AUTH_SECRET ?? 'local-dev-secret';
}

/**
 * Keep response creation centralized.
 */
function makeResponse(statusCode: number, body: unknown) {
  return response(statusCode, body);
}

/**
 * Validate post payload fields before create/update operations.
 */
export function _validatePayload(payload: Record<string, unknown>): [boolean, string] {
  return validatePostPayload(payload);
}

/**
 * Validate credential payload fields for register/login operations.
 */
function validateAuthPayload(payload: Record<string, unknown>): [boolean, string] {
  return validateCredentials(payload);
}

/**
 * Normalize incoming identity to a canonical lowercase value.
 */
function normalizeIdentity(payload: Record<string, unknown>): string {
  const rawIdentity = payload.email ?? payload.username;
  return String(rawIdentity ?? '').trim().toLowerCase();
}

/**
 * Parse and normalize a role value, defaulting to reader.
 */
function normalizeRole(payload: Record<string, unknown>): 'author' | 'reader' {
  return payload.role === 'author' ? 'author' : 'reader';
}

/**
 * Load one user by identity from in-memory storage or DynamoDB.
 */
async function findUserByIdentity(identity: string): Promise<{ passwordHash?: string; role?: 'author' | 'reader' } | null> {
  if (useInMemoryStorage()) {
    return _LOCAL_USERS[identity] ?? null;
  }

  const client = getDocumentClient();
  const result = await client.send(
    new GetCommand({
      TableName: getUsersTableName(),
      Key: { username: identity }
    })
  );

  return (result.Item as { passwordHash?: string; role?: 'author' | 'reader' } | undefined) ?? null;
}

/**
 * Ensure the authenticated user has author privileges.
 */
async function ensureAuthor(username: string): Promise<boolean> {
  const user = await findUserByIdentity(username);
  return user?.role === 'author';
}

/**
 * Hash a plain password using the shared auth utility.
 */
function hashUserPassword(password: string): string {
  return hashPassword(password);
}

/**
 * Verify a plain password against a stored password hash.
 */
function verifyUserPassword(storedHash: string, password: string): boolean {
  return verifyPassword(storedHash, password);
}

/**
 * Create a signed access token for an authenticated user.
 */
export function _createAccessToken(username: string): string {
  return createAccessToken(username, getAuthSecret(), TOKEN_TTL_SECONDS);
}

/**
 * Decode and validate a token, returning username when valid.
 */
export function _decodeAccessToken(token: string): string | null {
  return decodeAccessToken(token, getAuthSecret());
}

/**
 * Extract bearer token from incoming request headers.
 */
function extractToken(event: ApiEvent): string | null {
  return extractBearerToken(event.headers);
}

/**
 * Load one post by id from in-memory storage or DynamoDB.
 */
async function findPostById(postId: string): Promise<Record<string, unknown> | null> {
  if (useInMemoryStorage()) {
    return _LOCAL_POSTS.find((stored) => stored.id === postId) ?? null;
  }

  const client = getDocumentClient();
  const result = await client.send(
    new GetCommand({
      TableName: getPostsTableName(),
      Key: { id: postId }
    })
  );

  return (result.Item as Record<string, unknown> | undefined) ?? null;
}

/**
 * Load all posts and format them for list responses.
 */
async function listPosts(): Promise<PostItem[]> {
  if (useInMemoryStorage()) {
    return _LOCAL_POSTS.map((item) => toPostListItem(item, POST_LIST_CONTENT_LIMIT));
  }

  const client = getDocumentClient();
  const result = await client.send(
    new ScanCommand({
      TableName: getPostsTableName()
    })
  );

  const items = (result.Items ?? []) as Array<Record<string, unknown>>;
  return items.map((item) => toPostListItem(item, POST_LIST_CONTENT_LIMIT));
}

/**
 * Handle `GET /api/posts` with optional id lookup, mine filter, and pagination.
 */
async function handleGetPosts(event: ApiEvent) {
  const query = getQueryParams(event);
  const requestedPostId = (query.id ?? '').trim();
  const requestedMine = parseBool(query.mine);

  let currentUser: string | null = null;
  if (requestedMine) {
    const token = extractToken(event);
    currentUser = token ? _decodeAccessToken(token) : null;
    if (!currentUser) {
      return makeResponse(401, { message: 'authentication required' });
    }
  }

  if (requestedPostId) {
    const item = await findPostById(requestedPostId);
    if (!item) {
      return makeResponse(404, { message: 'post not found' });
    }

    return makeResponse(200, normalizeItem(item));
  }

  let page = parsePositiveInt(query.page, DEFAULT_POSTS_PAGE);
  let limit = parsePositiveInt(query.limit, DEFAULT_POSTS_LIMIT);
  limit = Math.min(limit, MAX_POSTS_LIMIT);

  let items = await listPosts();
  if (!currentUser) {
    items = items.filter((item) => item.published);
  }

  if (currentUser) {
    items = items.filter((item) => item.author === currentUser);
  }

  items.sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  const totalItems = items.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / limit));
  page = Math.min(page, totalPages);
  const start = (page - 1) * limit;
  const end = start + limit;

  return makeResponse(200, {
    items: items.slice(start, end),
    pagination: {
      page,
      limit,
      totalItems,
      totalPages
    }
  });
}

/**
 * Handle `GET /api/posts/{id}` and return one post when found.
 */
async function handleGetPostById(event: ApiEvent, postId: string) {
  const item = await findPostById(postId);

  if (!item) {
    return makeResponse(404, { message: 'post not found' });
  }

  const normalized = normalizeItem(item);
  if (!normalized.published) {
    const token = extractToken(event);
    const username = token ? _decodeAccessToken(token) : null;
    if (!username || username !== normalized.author) {
      return makeResponse(404, { message: 'post not found' });
    }
  }

  return makeResponse(200, normalized);
}

/**
 * Handle `POST /api/register` by validating and storing user credentials.
 */
async function handleRegister(event: ApiEvent) {
  const [payload, parseError] = parseBody(event);
  if (parseError) {
    return makeResponse(400, { message: parseError });
  }

  const [valid, message] = validateAuthPayload(payload);
  if (!valid) {
    return makeResponse(400, { message });
  }

  const username = normalizeIdentity(payload);
  const role = normalizeRole(payload);
  const passwordHash = hashUserPassword(String(payload.password));

  if (useInMemoryStorage()) {
    if (_LOCAL_USERS[username]) {
      return makeResponse(409, { message: 'username already exists' });
    }

    _LOCAL_USERS[username] = { passwordHash, role };
  } else {
    const client = getDocumentClient();
    try {
      await client.send(
        new PutCommand({
          TableName: getUsersTableName(),
          Item: { username, passwordHash, role },
          ConditionExpression: 'attribute_not_exists(username)'
        })
      );
    } catch (error) {
      const knownError = error as { name?: string };
      if (knownError.name === 'ConditionalCheckFailedException') {
        return makeResponse(409, { message: 'username already exists' });
      }

      throw error;
    }
  }

  return makeResponse(201, { message: 'registered', role });
}

/**
 * Handle `POST /api/login` and issue an access token on success.
 */
async function handleLogin(event: ApiEvent) {
  const [payload, parseError] = parseBody(event);
  if (parseError) {
    return makeResponse(400, { message: parseError });
  }

  const [valid, message] = validateAuthPayload(payload);
  if (!valid) {
    return makeResponse(400, { message });
  }

  const username = normalizeIdentity(payload);
  const user = await findUserByIdentity(username);

  if (!user?.passwordHash || !verifyUserPassword(user.passwordHash, String(payload.password))) {
    return makeResponse(401, { message: 'invalid credentials' });
  }

  const token = _createAccessToken(username);
  return makeResponse(200, { token, role: user.role ?? 'reader' });
}

/**
 * Handle `POST /api/posts` for authenticated post creation.
 */
async function handleCreatePost(event: ApiEvent) {
  const token = extractToken(event);
  const username = token ? _decodeAccessToken(token) : null;

  if (!username) {
    return makeResponse(401, { message: 'authentication required' });
  }

  if (!(await ensureAuthor(username))) {
    return makeResponse(403, { message: 'author role required to create posts' });
  }

  const [payload, parseError] = parseBody(event);
  if (parseError) {
    return makeResponse(400, { message: parseError });
  }

  const [valid, message] = _validatePayload(payload);
  if (!valid) {
    return makeResponse(400, { message });
  }

  const createdAt = new Date().toISOString();
  const item: Record<string, unknown> = {
    id: randomUUID(),
    title: String(payload.title).trim(),
    content: String(payload.content).trim(),
    createdAt,
    author: username,
    published: typeof payload.published === 'boolean' ? payload.published : true
  };

  if (useInMemoryStorage()) {
    _LOCAL_POSTS.push(item);
  } else {
    const client = getDocumentClient();
    await client.send(
      new PutCommand({
        TableName: getPostsTableName(),
        Item: {
          ...item,
          version: 1
        }
      })
    );
  }

  return makeResponse(201, normalizeItem(item));
}

/**
 * Handle `PUT /api/posts/{id}` with ownership checks and persistence.
 */
async function handleUpdatePost(event: ApiEvent, postId: string) {
  const token = extractToken(event);
  const username = token ? _decodeAccessToken(token) : null;

  if (!username) {
    return makeResponse(401, { message: 'authentication required' });
  }

  if (!(await ensureAuthor(username))) {
    return makeResponse(403, { message: 'author role required to edit posts' });
  }

  const [payload, parseError] = parseBody(event);
  if (parseError) {
    return makeResponse(400, { message: parseError });
  }

  const [valid, message] = _validatePayload(payload);
  if (!valid) {
    return makeResponse(400, { message });
  }

  const existingItem = await findPostById(postId);
  if (!existingItem) {
    const notFoundMessage = useInMemoryStorage()
      ? 'post not found in local in-memory storage; data resets after local backend restart'
      : 'post not found';

    return makeResponse(404, { message: notFoundMessage, postId });
  }

  const existingAuthor = normalizeItem(existingItem).author;
  if (existingAuthor !== username) {
    return makeResponse(403, { message: 'only the post author can modify this post' });
  }

  const updatedItem: Record<string, unknown> = {
    ...existingItem,
    title: String(payload.title).trim(),
    content: String(payload.content).trim(),
    author: existingAuthor,
    published: typeof payload.published === 'boolean' ? payload.published : normalizeItem(existingItem).published
  };

  if (useInMemoryStorage()) {
    const index = _LOCAL_POSTS.findIndex((stored) => stored.id === postId);
    if (index >= 0) {
      _LOCAL_POSTS[index] = updatedItem;
    }
  } else {
    const client = getDocumentClient();
    const rawVersion = existingItem.version;
    const version = typeof rawVersion === 'number' ? rawVersion : Number(rawVersion ?? 1);

    await client.send(
      new PutCommand({
        TableName: getPostsTableName(),
        Item: {
          ...updatedItem,
          version: version + 1
        }
      })
    );
  }

  return makeResponse(200, normalizeItem(updatedItem));
}

/**
 * Handle `DELETE /api/posts/{id}` with ownership checks.
 */
async function handleDeletePost(event: ApiEvent, postId: string) {
  const token = extractToken(event);
  const username = token ? _decodeAccessToken(token) : null;

  if (!username) {
    return makeResponse(401, { message: 'authentication required' });
  }

  if (!(await ensureAuthor(username))) {
    return makeResponse(403, { message: 'author role required to delete posts' });
  }

  const existingItem = await findPostById(postId);
  if (!existingItem) {
    return makeResponse(404, { message: 'post not found' });
  }

  const existingAuthor = normalizeItem(existingItem).author;
  if (existingAuthor !== username) {
    return makeResponse(403, { message: 'only the post author can delete this post' });
  }

  if (useInMemoryStorage()) {
    const index = _LOCAL_POSTS.findIndex((stored) => stored.id === postId);
    if (index >= 0) {
      _LOCAL_POSTS.splice(index, 1);
    }
  } else {
    const client = getDocumentClient();
    await client.send(
      new DeleteCommand({
        TableName: getPostsTableName(),
        Key: { id: postId }
      })
    );
  }

  return makeResponse(200, { message: 'deleted', id: postId });
}

/**
 * Lambda entrypoint that routes methods and paths to internal handlers.
 */
export async function handler(event: ApiEvent): Promise<{ statusCode: number; headers: Record<string, string>; body: string }> {
  const method = event.httpMethod ?? '';
  const path = canonicalizePath(getPath(event));
  const endpointUrl = (process.env.DYNAMODB_ENDPOINT_URL ?? '').trim() || '(empty)';
  const useInMemoryLocal = process.env.USE_IN_MEMORY_LOCAL ?? 'true';

  localLog(
    `request method=${method} path=${path} storage=${storageMode()} LOCAL_DEV=${isLocalDev()} ` +
      `USE_IN_MEMORY_LOCAL=${useInMemoryLocal} DYNAMODB_ENDPOINT_URL=${endpointUrl}`
  );

  if (method === 'OPTIONS') {
    return makeResponse(200, { ok: true });
  }

  if (method === 'GET' && path === '/api/posts') {
    return handleGetPosts(event);
  }

  const postId = extractPostId(path, event);
  if (method === 'GET' && postId) {
    return handleGetPostById(event, postId);
  }

  if (method === 'POST' && path === '/api/register') {
    return handleRegister(event);
  }

  if (method === 'POST' && path === '/api/login') {
    return handleLogin(event);
  }

  if (method === 'POST' && path === '/api/posts') {
    return handleCreatePost(event);
  }

  if (method === 'POST' && path === '/api/posts/premium') {
    return handleCreatePremiumPost(event);
  }

  if (method === 'PUT' && postId) {
    return handleUpdatePost(event, postId);
  }

  if (method === 'DELETE' && postId) {
    return handleDeletePost(event, postId);
  }

  return makeResponse(405, { message: 'method not allowed' });
}
