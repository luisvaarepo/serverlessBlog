import type { AiPreferences } from '../../types';

import { DEFAULT_SYSTEM_PROMPT } from './defaultSystemPrompt';

export const AI_PREFERENCES_STORAGE_KEY = 'blogAiPreferences';
export const DEFAULT_GEMINI_MODELS = ['gemini-2.0-flash', 'gemini-1.5-flash', 'gemini-1.5-pro'];
const LEGACY_DEFAULT_SYSTEM_PROMPT = 'You are a creative writing assistant. Preserve the user\'s voice, improve clarity, and keep output engaging.';

export const defaultAiPreferences: AiPreferences = {
  provider: 'gemini',
  geminiApiKey: '',
  chatgptApiKey: '',
  anthropicApiKey: '',
  geminiModel: DEFAULT_GEMINI_MODELS[0],
  chatgptModel: 'gpt-4o-mini',
  anthropicModel: 'claude-3-5-sonnet-latest',
  temperature: 0.8,
  topP: 0.95,
  maxTokens: 1200,
  presencePenalty: 0,
  frequencyPenalty: 0,
  writingStyle: 'Balanced',
  systemPrompt: DEFAULT_SYSTEM_PROMPT
};

/**
 * Clamps a numeric value to a valid range.
 * @param value Incoming value from UI or storage.
 * @param min Lower allowed bound.
 * @param max Upper allowed bound.
 * @returns A number guaranteed to be between `min` and `max`.
 */
export function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Parses persisted AI preferences from local storage and applies safe defaults.
 * @param rawValue Raw JSON string from local storage.
 * @returns A fully populated `AiPreferences` object.
 */
export function parseAiPreferences(rawValue: string | null): AiPreferences {
  if (!rawValue) {
    return defaultAiPreferences;
  }

  try {
    const parsed = JSON.parse(rawValue) as Partial<AiPreferences>;
    const parsedSystemPrompt = parsed.systemPrompt?.trim();
    const systemPrompt = !parsedSystemPrompt || parsedSystemPrompt === LEGACY_DEFAULT_SYSTEM_PROMPT
      ? DEFAULT_SYSTEM_PROMPT
      : parsedSystemPrompt;

    return {
      provider: parsed.provider === 'chatgpt' || parsed.provider === 'anthropic' ? parsed.provider : 'gemini',
      geminiApiKey: parsed.geminiApiKey ?? '',
      chatgptApiKey: parsed.chatgptApiKey ?? '',
      anthropicApiKey: parsed.anthropicApiKey ?? '',
      geminiModel: parsed.geminiModel?.trim() || defaultAiPreferences.geminiModel,
      chatgptModel: parsed.chatgptModel?.trim() || defaultAiPreferences.chatgptModel,
      anthropicModel: parsed.anthropicModel?.trim() || defaultAiPreferences.anthropicModel,
      temperature: clampNumber(parsed.temperature ?? defaultAiPreferences.temperature, 0, 2),
      topP: clampNumber(parsed.topP ?? defaultAiPreferences.topP, 0, 1),
      maxTokens: clampNumber(parsed.maxTokens ?? defaultAiPreferences.maxTokens, 64, 8192),
      presencePenalty: clampNumber(parsed.presencePenalty ?? defaultAiPreferences.presencePenalty, -2, 2),
      frequencyPenalty: clampNumber(parsed.frequencyPenalty ?? defaultAiPreferences.frequencyPenalty, -2, 2),
      writingStyle: parsed.writingStyle?.trim() || defaultAiPreferences.writingStyle,
      systemPrompt
    };
  } catch {
    return defaultAiPreferences;
  }
}
