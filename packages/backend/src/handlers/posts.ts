import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
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
export const PREMIUM_AI_DEFAULT_MODEL = 'gemini-2.5-flash';
export const PREMIUM_AI_RESEARCH_RESULT_LIMIT = 5;
export const PREMIUM_AI_RESEARCH_MODE_DEFAULT = 'standard';
export const YOU_COM_RESEARCH_ENDPOINT = 'https://api.you.com/v1/research';
export const PREMIUM_AI_SYSTEM_PROMPT_PLACEHOLDER_PATH = 'src/handlers/posts_domain/premiumSystemPrompt.md';
export const PREMIUM_AI_SYSTEM_PROMPT_PLACEHOLDER_FALLBACK =
  'Create an engaging blog post with this information';

export const _LOCAL_POSTS: Array<Record<string, unknown>> = [];
export const _LOCAL_USERS: Record<string, { passwordHash: string; role: 'author' | 'reader' }> = {};

export interface PremiumResearchSource {
  title: string;
  url: string;
  snippet: string;
}

export interface PremiumPostDraftResponse {
  markdown: string;
  sources: PremiumResearchSource[];
}

let documentClient: DynamoDBDocumentClient | null = null;

/**
 * Load the premium system prompt placeholder from a markdown file.
 */
function loadPremiumSystemPromptPlaceholder(): string {
  const candidatePaths = [
    join(process.cwd(), PREMIUM_AI_SYSTEM_PROMPT_PLACEHOLDER_PATH),
    join(__dirname, 'posts_domain', 'premiumSystemPrompt.md')
  ];

  for (const candidatePath of candidatePaths) {
    if (!existsSync(candidatePath)) {
      continue;
    }

    const fileContent = readFileSync(candidatePath, 'utf8').trim();
    if (fileContent) {
      return fileContent;
    }
  }

  return PREMIUM_AI_SYSTEM_PROMPT_PLACEHOLDER_FALLBACK;
}

export const PREMIUM_AI_SYSTEM_PROMPT_PLACEHOLDER = loadPremiumSystemPromptPlaceholder();

/**
 * Read the internal premium AI API key from environment variables.
 */
function getPremiumAiApiKey(): string {
  return (process.env.INTERNAL_AI_API_KEY ?? '').trim();
}

/**
 * Read the internal You.com search API key from environment variables.
 */
function getYouSearchApiKey(): string {
  return (process.env.YOU_COM_SEARCH_API_KEY ?? '').trim();
}

/**
 * Resolve the model used for premium AI generation.
 */
function getPremiumAiModel(): string {
  return (process.env.PREMIUM_AI_MODEL ?? PREMIUM_AI_DEFAULT_MODEL).trim() || PREMIUM_AI_DEFAULT_MODEL;
}

/**
 * Resolve the You.com research mode used for premium search requests.
 */
function getYouResearchMode(): string {
  const configuredMode = (process.env.YOU_COM_RESEARCH_MODE ?? PREMIUM_AI_RESEARCH_MODE_DEFAULT).trim().toLowerCase();
  return configuredMode === '' ? PREMIUM_AI_RESEARCH_MODE_DEFAULT : configuredMode;
}

/**
 * Resolve the premium system prompt, using a temporary placeholder until final prompt is provided.
 */
function getPremiumAiSystemPrompt(): string {
  const configuredPrompt = process.env.PREMIUM_AI_SYSTEM_PROMPT?.trim();
  return configuredPrompt && configuredPrompt.length > 0
    ? configuredPrompt
    : PREMIUM_AI_SYSTEM_PROMPT_PLACEHOLDER;
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
      const title = String(entry.title ?? entry.name ?? '').trim();
      const url = String(entry.url ?? entry.link ?? '').trim();
      const snippet = String(entry.snippet ?? entry.description ?? '').trim();

      if (!title || !url) {
        return null;
      }

      return {
        title,
        url,
        snippet
      };
    })
    .filter((entry): entry is PremiumResearchSource => entry !== null)
    .slice(0, PREMIUM_AI_RESEARCH_RESULT_LIMIT);
}

/**
 * Execute a You.com research request for the provided topic.
 */
async function fetchYouResearchSources(topic: string, apiKey: string): Promise<PremiumResearchSource[]> {
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

  const candidates = payload.hits
    ?? payload.results
    ?? payload.sources
    ?? payload.data?.hits
    ?? payload.data?.results
    ?? payload.data?.sources
    ?? payload.data?.items;
  return normalizeYouSearchSources(candidates);
}

/**
 * Build a plain-text research digest from source results for the generation prompt.
 */
function buildResearchDigest(sources: PremiumResearchSource[]): string {
  if (sources.length === 0) {
    return 'No external research sources were returned.';
  }

  return sources
    .map((source, index) => {
      const sourceLabel = `Source ${index + 1}: ${source.title} (${source.url})`;
      return source.snippet ? `${sourceLabel}\nSummary: ${source.snippet}` : sourceLabel;
    })
    .join('\n\n');
}

/**
 * Generate a markdown blog post with LangChain using the topic and research digest.
 */
async function generatePremiumMarkdown(topic: string, sources: PremiumResearchSource[], apiKey: string): Promise<string> {
  const formattedPrompt = [
    getPremiumAiSystemPrompt(),
    'Write a complete markdown blog post based on the requested topic and research.',
    `Topic: ${topic}`,
    'Research findings:',
    buildResearchDigest(sources),
    '',
    'Requirements:',
    '- Produce a strong markdown H1 title.',
    '- Add informative sections with markdown headings.',
    '- Use the research findings as support for claims.',
    '- Include a final "## Sources" section listing cited URLs as markdown bullet links.',
    '- Return only the markdown post body.'
  ].join('\n');

  try {
    const { ChatGoogleGenerativeAI } = await import('@langchain/google-genai');

    const model = new ChatGoogleGenerativeAI({
      apiKey,
      model: getPremiumAiModel(),
      temperature: 0.7
    });

    const result = await model.invoke(formattedPrompt);
    const output = typeof result.content === 'string'
      ? result.content.trim()
      : result.content
        .map((chunk: unknown) => {
          if (typeof chunk === 'string') {
            return chunk;
          }

          if (chunk && typeof chunk === 'object' && 'text' in chunk) {
            return String((chunk as { text?: unknown }).text ?? '');
          }

          return '';
        })
        .join('')
        .trim();

    if (!output) {
      throw new Error('premium AI returned an empty response');
    }

    return output;
  } catch (error) {
    const reason = (error as Error).message;

    if (reason.includes('@langchain/google-genai') || reason.toLowerCase().includes('cannot find module')) {
      localLog(`premium-ai langchain module unavailable, falling back to direct Gemini API: ${reason}`);
      return generatePremiumMarkdownWithGeminiApi(formattedPrompt, apiKey);
    }

    throw error;
  }
}

/**
 * Generate markdown directly with Gemini API when LangChain runtime module is unavailable.
 */
async function generatePremiumMarkdownWithGeminiApi(prompt: string, apiKey: string): Promise<string> {
  const model = encodeURIComponent(getPremiumAiModel());
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      contents: [
        {
          role: 'user',
          parts: [{ text: prompt }]
        }
      ],
      generationConfig: {
        temperature: 0.7
      }
    })
  });

  if (!response.ok) {
    throw new Error(`gemini fallback request failed with status ${response.status}`);
  }

  const payload = (await response.json()) as {
    candidates?: Array<{
      content?: {
        parts?: Array<{ text?: string }>;
      };
    }>;
  };

  const output = payload.candidates?.[0]?.content?.parts?.map((part) => part.text ?? '').join('').trim() ?? '';
  if (!output) {
    throw new Error('premium AI returned an empty response');
  }

  return output;
}

export const _premiumAiDependencies: {
  fetchResearchSources: (topic: string, apiKey: string) => Promise<PremiumResearchSource[]>;
  generateMarkdown: (topic: string, sources: PremiumResearchSource[], apiKey: string) => Promise<string>;
} = {
  fetchResearchSources: fetchYouResearchSources,
  generateMarkdown: generatePremiumMarkdown
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
 * Handle `POST /api/posts/premium` using internal AI and search keys for beta premium generation.
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

  const internalAiApiKey = getPremiumAiApiKey();
  const youSearchApiKey = getYouSearchApiKey();
  if (!internalAiApiKey || !youSearchApiKey) {
    return makeResponse(503, { message: 'premium ai beta is not configured' });
  }

  try {
    const sources = await _premiumAiDependencies.fetchResearchSources(topic, youSearchApiKey);
    const markdown = await _premiumAiDependencies.generateMarkdown(topic, sources, internalAiApiKey);

    const responsePayload: PremiumPostDraftResponse = {
      markdown,
      sources
    };

    return makeResponse(200, responsePayload);
  } catch (error) {
    const reason = (error as Error).message;

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
