import type { AiPreferences } from '../../types';

/**
 * Resolves the active provider credentials from user preferences.
 * @param preferences Full AI settings chosen by the user.
 * @returns The API key and model for the selected provider.
 */
function getProviderConfig(preferences: AiPreferences): { apiKey: string; model: string } {
  if (preferences.provider === 'chatgpt') {
    return {
      apiKey: preferences.chatgptApiKey,
      model: preferences.chatgptModel
    };
  }

  if (preferences.provider === 'anthropic') {
    return {
      apiKey: preferences.anthropicApiKey,
      model: preferences.anthropicModel
    };
  }

  return {
    apiKey: preferences.geminiApiKey,
    model: preferences.geminiModel
  };
}

/**
 * Loads available Gemini models that support content generation.
 * @param apiKey Gemini API key used to authenticate with Google APIs.
 * @returns Sorted model names compatible with `generateContent`.
 */
export async function listGeminiGenerateContentModels(apiKey: string): Promise<string[]> {
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}`);

  if (!response.ok) {
    const errorMessage = await parseErrorMessage(response);
    throw new Error(errorMessage ?? `Gemini model list request failed with status ${response.status}.`);
  }

  const payload = await response.json() as {
    models?: Array<{
      name?: string;
      supportedGenerationMethods?: string[];
    }>;
  };

  return (payload.models ?? [])
    .filter((model) => model.supportedGenerationMethods?.includes('generateContent'))
    .map((model) => model.name?.replace(/^models\//, '').trim() ?? '')
    .filter((modelName) => modelName.length > 0)
    .sort((a, b) => a.localeCompare(b));
}

/**
 * Builds the final system prompt sent to provider APIs.
 * @param preferences Current AI behavior and style settings.
 * @returns A merged system instruction string.
 */
function buildSystemPrompt(preferences: AiPreferences): string {
  return `${preferences.systemPrompt}\nWriting style: ${preferences.writingStyle}. Keep responses concise and directly usable in a blog editor.`;
}

/**
 * Extracts an API error message from JSON responses.
 * @param response HTTP response returned by an AI provider.
 * @returns A readable message when present; otherwise `null`.
 */
async function parseErrorMessage(response: Response): Promise<string | null> {
  const contentType = response.headers.get('content-type') ?? '';
  if (!contentType.toLowerCase().includes('application/json')) {
    return null;
  }

  try {
    const payload = await response.json() as {
      error?: { message?: string };
      message?: string;
    };

    if (payload.error?.message) {
      return payload.error.message;
    }

    if (payload.message) {
      return payload.message;
    }
  } catch {
    return null;
  }

  return null;
}

/**
 * Sends a text generation request to the ChatGPT API.
 * @param preferences User preferences including model and tuning values.
 * @param prompt User prompt content.
 * @returns Generated text from the first completion choice.
 */
async function generateWithChatGpt(preferences: AiPreferences, prompt: string): Promise<string> {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${preferences.chatgptApiKey}`
    },
    body: JSON.stringify({
      model: preferences.chatgptModel,
      temperature: preferences.temperature,
      top_p: preferences.topP,
      max_tokens: preferences.maxTokens,
      presence_penalty: preferences.presencePenalty,
      frequency_penalty: preferences.frequencyPenalty,
      messages: [
        {
          role: 'system',
          content: buildSystemPrompt(preferences)
        },
        {
          role: 'user',
          content: prompt
        }
      ]
    })
  });

  if (!response.ok) {
    const errorMessage = await parseErrorMessage(response);
    throw new Error(errorMessage ?? `ChatGPT request failed with status ${response.status}.`);
  }

  const payload = await response.json() as {
    choices?: Array<{
      message?: {
        content?: string;
      };
    }>;
  };

  const text = payload.choices?.[0]?.message?.content?.trim();
  if (!text) {
    throw new Error('ChatGPT returned an empty response.');
  }

  return text;
}

/**
 * Sends a text generation request to Anthropic Messages API.
 * @param preferences User preferences including model and tuning values.
 * @param prompt User prompt content.
 * @returns Generated text extracted from text content blocks.
 */
async function generateWithAnthropic(preferences: AiPreferences, prompt: string): Promise<string> {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': preferences.anthropicApiKey,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: preferences.anthropicModel,
      max_tokens: preferences.maxTokens,
      temperature: preferences.temperature,
      top_p: preferences.topP,
      system: buildSystemPrompt(preferences),
      messages: [
        {
          role: 'user',
          content: prompt
        }
      ]
    })
  });

  if (!response.ok) {
    const errorMessage = await parseErrorMessage(response);
    throw new Error(errorMessage ?? `Anthropic request failed with status ${response.status}.`);
  }

  const payload = await response.json() as {
    content?: Array<{
      type?: string;
      text?: string;
    }>;
  };

  const text = payload.content?.find((item) => item.type === 'text')?.text?.trim();
  if (!text) {
    throw new Error('Anthropic returned an empty response.');
  }

  return text;
}

/**
 * Sends a text generation request to Gemini `generateContent`.
 * @param preferences User preferences including model and tuning values.
 * @param prompt User prompt content.
 * @returns Generated text composed from the first candidate parts.
 */
async function generateWithGemini(preferences: AiPreferences, prompt: string): Promise<string> {
  const encodedModel = encodeURIComponent(preferences.geminiModel);
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodedModel}:generateContent?key=${encodeURIComponent(preferences.geminiApiKey)}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      systemInstruction: {
        parts: [{ text: buildSystemPrompt(preferences) }]
      },
      contents: [
        {
          role: 'user',
          parts: [{ text: prompt }]
        }
      ],
      generationConfig: {
        temperature: preferences.temperature,
        topP: preferences.topP,
        maxOutputTokens: preferences.maxTokens,
        presencePenalty: preferences.presencePenalty,
        frequencyPenalty: preferences.frequencyPenalty
      }
    })
  });

  if (!response.ok) {
    const errorMessage = await parseErrorMessage(response);
    throw new Error(errorMessage ?? `Gemini request failed with status ${response.status}.`);
  }

  const payload = await response.json() as {
    candidates?: Array<{
      content?: {
        parts?: Array<{
          text?: string;
        }>;
      };
    }>;
  };

  const text = payload.candidates?.[0]?.content?.parts?.map((part) => part.text ?? '').join('').trim();
  if (!text) {
    throw new Error('Gemini returned an empty response.');
  }

  return text;
}

/**
 * Checks whether the currently selected provider has an API key configured.
 * @param preferences Current AI settings.
 * @returns `true` when the active provider key is non-empty.
 */
export function hasAiProviderApiKey(preferences: AiPreferences): boolean {
  const { apiKey } = getProviderConfig(preferences);
  return apiKey.trim() !== '';
}

/**
 * Routes a prompt to the active AI provider implementation.
 * @param preferences Current AI settings including selected provider.
 * @param prompt Prompt text to execute.
 * @returns Generated response text from the provider.
 */
export async function runAiPrompt(preferences: AiPreferences, prompt: string): Promise<string> {
  const { apiKey, model } = getProviderConfig(preferences);

  if (!apiKey.trim()) {
    throw new Error(`Add your ${preferences.provider} API key in Preferences to use AI actions.`);
  }

  if (!model.trim()) {
    throw new Error(`Select a ${preferences.provider} model in Preferences to use AI actions.`);
  }

  if (preferences.provider === 'chatgpt') {
    return generateWithChatGpt(preferences, prompt);
  }

  if (preferences.provider === 'anthropic') {
    return generateWithAnthropic(preferences, prompt);
  }

  return generateWithGemini(preferences, prompt);
}
