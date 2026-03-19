import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AiPreferences } from '../../types';
import { hasAiProviderApiKey, listGeminiGenerateContentModels, runAiPrompt } from './client';

/**
 * Builds an AI preferences object and allows overriding targeted fields per test.
 * @param overrides Partial preference values used to tailor one scenario.
 * @returns A complete `AiPreferences` object suitable for AI client tests.
 */
function buildPreferences(overrides: Partial<AiPreferences> = {}): AiPreferences {
  return {
    provider: 'gemini',
    geminiApiKey: 'gemini-key',
    chatgptApiKey: 'chatgpt-key',
    anthropicApiKey: 'anthropic-key',
    geminiModel: 'gemini-2.0-flash',
    chatgptModel: 'gpt-4o-mini',
    anthropicModel: 'claude-3-5-sonnet-latest',
    temperature: 0.8,
    topP: 0.95,
    maxTokens: 1200,
    presencePenalty: 0,
    frequencyPenalty: 0,
    writingStyle: 'Balanced',
    systemPrompt: 'System instruction.',
    ...overrides
  };
}

/**
 * Creates a JSON HTTP response used by fetch mocks.
 * @param body Payload to serialize to JSON.
 * @param init Optional response initialization overrides.
 * @returns A response with JSON content type.
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

describe('ai client', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    fetchMock.mockReset();
  });

  // Purpose: Ensure model discovery filters to Gemini text-generation models and sorts their names.
  it('returns only sorted Gemini models that support generateContent', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        models: [
          { name: 'models/gemini-2.0-flash', supportedGenerationMethods: ['generateContent'] },
          { name: 'models/embedding-001', supportedGenerationMethods: ['embedContent'] },
          { name: 'models/gemini-1.5-pro', supportedGenerationMethods: ['generateContent', 'embedContent'] }
        ]
      })
    );

    const models = await listGeminiGenerateContentModels('test-key');

    expect(models).toEqual(['gemini-1.5-pro', 'gemini-2.0-flash']);
  });

  // Purpose: Verify API-key presence checks are provider-specific.
  it('detects whether the active provider has an API key configured', () => {
    expect(hasAiProviderApiKey(buildPreferences({ provider: 'gemini', geminiApiKey: 'k' }))).toBe(true);
    expect(hasAiProviderApiKey(buildPreferences({ provider: 'chatgpt', chatgptApiKey: '' }))).toBe(false);
    expect(hasAiProviderApiKey(buildPreferences({ provider: 'anthropic', anthropicApiKey: 'k' }))).toBe(true);
  });

  // Purpose: Prevent prompt execution when the currently selected provider has no configured key.
  it('rejects AI prompts when the active provider key is missing', async () => {
    await expect(
      runAiPrompt(buildPreferences({ provider: 'chatgpt', chatgptApiKey: '   ' }), 'Write a post')
    ).rejects.toThrow('Add your chatgpt API key in Preferences to use AI actions.');
  });

  // Purpose: Prevent prompt execution when no model is selected for the active provider.
  it('rejects AI prompts when the active provider model is missing', async () => {
    await expect(
      runAiPrompt(buildPreferences({ provider: 'anthropic', anthropicModel: '   ' }), 'Write a post')
    ).rejects.toThrow('Select a anthropic model in Preferences to use AI actions.');
  });

  // Purpose: Confirm ChatGPT provider uses the OpenAI chat completions endpoint.
  it('routes prompt generation to ChatGPT when provider is chatgpt', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        choices: [{ message: { content: ' ChatGPT answer ' } }]
      })
    );

    const result = await runAiPrompt(buildPreferences({ provider: 'chatgpt' }), 'Write a post');

    expect(result).toBe('ChatGPT answer');
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.openai.com/v1/chat/completions',
      expect.objectContaining({ method: 'POST' })
    );
  });

  // Purpose: Confirm Anthropic provider uses the Anthropic messages endpoint.
  it('routes prompt generation to Anthropic when provider is anthropic', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        content: [{ type: 'text', text: ' Anthropic answer ' }]
      })
    );

    const result = await runAiPrompt(buildPreferences({ provider: 'anthropic' }), 'Write a post');

    expect(result).toBe('Anthropic answer');
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.anthropic.com/v1/messages',
      expect.objectContaining({ method: 'POST' })
    );
  });

  // Purpose: Confirm Gemini provider uses the Gemini generateContent endpoint.
  it('routes prompt generation to Gemini when provider is gemini', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        candidates: [{ content: { parts: [{ text: 'Gemini ' }, { text: 'answer' }] } }]
      })
    );

    const result = await runAiPrompt(buildPreferences({ provider: 'gemini' }), 'Write a post');

    expect(result).toBe('Gemini answer');
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('generativelanguage.googleapis.com/v1beta/models/'),
      expect.objectContaining({ method: 'POST' })
    );
  });

  // Purpose: Bubble up provider-supplied error details when generation fails.
  it('surfaces provider API error messages when generation fails', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(
        {
          error: { message: 'Invalid API key.' }
        },
        {
          status: 401
        }
      )
    );

    await expect(runAiPrompt(buildPreferences({ provider: 'gemini' }), 'Write a post')).rejects.toThrow('Invalid API key.');
  });
});
