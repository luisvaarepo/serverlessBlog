export interface BlogPost {
  id: string;
  title: string;
  content: string;
  createdAt: string;
  author?: string;
  published?: boolean;
}

export type UserRole = 'author' | 'reader';

export type AiProvider = 'gemini' | 'chatgpt' | 'anthropic';

export interface AiPreferences {
  provider: AiProvider;
  geminiApiKey: string;
  chatgptApiKey: string;
  anthropicApiKey: string;
  geminiModel: string;
  chatgptModel: string;
  anthropicModel: string;
  temperature: number;
  topP: number;
  maxTokens: number;
  presencePenalty: number;
  frequencyPenalty: number;
  writingStyle: string;
  systemPrompt: string;
}
