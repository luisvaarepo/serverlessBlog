import { describe, expect, it } from 'vitest';
import { DEFAULT_SYSTEM_PROMPT } from './defaultSystemPrompt';
import { clampNumber, defaultAiPreferences, parseAiPreferences } from './preferences';

const LEGACY_DEFAULT_SYSTEM_PROMPT = 'You are a creative writing assistant. Preserve the user\'s voice, improve clarity, and keep output engaging.';

describe('ai preferences', () => {
  // Purpose: Verify numeric clamping enforces min and max bounds.
  it('clamps numeric values to the provided range', () => {
    expect(clampNumber(-1, 0, 10)).toBe(0);
    expect(clampNumber(5, 0, 10)).toBe(5);
    expect(clampNumber(25, 0, 10)).toBe(10);
  });

  // Purpose: Ensure missing persisted preferences fall back to defaults.
  it('returns defaults when no persisted value exists', () => {
    expect(parseAiPreferences(null)).toEqual(defaultAiPreferences);
  });

  // Purpose: Ensure malformed persisted preferences safely fall back to defaults.
  it('returns defaults when persisted value is invalid JSON', () => {
    expect(parseAiPreferences('{')).toEqual(defaultAiPreferences);
  });

  // Purpose: Confirm persisted preferences are normalized, clamped, and migrated as needed.
  it('normalizes provider, models, prompts, and numeric ranges from persisted values', () => {
    const parsed = parseAiPreferences(
      JSON.stringify({
        provider: 'unsupported-provider',
        geminiApiKey: 'g-key',
        chatgptApiKey: 'c-key',
        anthropicApiKey: 'a-key',
        geminiModel: '   ',
        chatgptModel: '   ',
        anthropicModel: '   ',
        temperature: 99,
        topP: -1,
        maxTokens: 999999,
        presencePenalty: -8,
        frequencyPenalty: 8,
        writingStyle: '   ',
        systemPrompt: LEGACY_DEFAULT_SYSTEM_PROMPT
      })
    );

    expect(parsed.provider).toBe('gemini');
    expect(parsed.geminiModel).toBe(defaultAiPreferences.geminiModel);
    expect(parsed.chatgptModel).toBe(defaultAiPreferences.chatgptModel);
    expect(parsed.anthropicModel).toBe(defaultAiPreferences.anthropicModel);
    expect(parsed.temperature).toBe(2);
    expect(parsed.topP).toBe(0);
    expect(parsed.maxTokens).toBe(8192);
    expect(parsed.presencePenalty).toBe(-2);
    expect(parsed.frequencyPenalty).toBe(2);
    expect(parsed.writingStyle).toBe(defaultAiPreferences.writingStyle);
    expect(parsed.systemPrompt).toBe(DEFAULT_SYSTEM_PROMPT);
  });

  // Purpose: Preserve valid provider choices and trim custom system prompt input.
  it('preserves supported provider and trimmed custom prompt', () => {
    const parsed = parseAiPreferences(
      JSON.stringify({
        provider: 'chatgpt',
        systemPrompt: '  Custom instruction.  '
      })
    );

    expect(parsed.provider).toBe('chatgpt');
    expect(parsed.systemPrompt).toBe('Custom instruction.');
  });
});
