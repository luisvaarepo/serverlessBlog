import type { ChangeEvent } from 'react';
import type { AiPreferences } from '../../types';

const CHATGPT_MODELS = ['gpt-4o-mini', 'gpt-4o', 'gpt-4.1-mini'];
const ANTHROPIC_MODELS = ['claude-3-5-sonnet-latest', 'claude-3-5-haiku-latest', 'claude-3-opus-latest'];

interface AiPreferencesFieldsProps {
  aiPreferences: AiPreferences;
  geminiModels?: string[];
  isRefreshingGeminiModels?: boolean;
  onUpdatePreference: <Key extends keyof AiPreferences>(key: Key, value: AiPreferences[Key]) => void;
  onUpdateNumberPreference: (
    key: 'temperature' | 'topP' | 'maxTokens' | 'presencePenalty' | 'frequencyPenalty',
    value: string,
    min: number,
    max: number
  ) => void;
  onRefreshGeminiModels?: () => Promise<void>;
}

interface InfoLabelProps {
  text: string;
  info: string;
}

function InfoLabel({ text, info }: InfoLabelProps) {
  return (
    <span className="inline-flex items-center gap-2 text-sm font-medium">
      {text}
      <span
        className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-slate-400 text-[10px] font-bold text-slate-600 dark:border-slate-500 dark:text-slate-300"
        title={info}
        aria-label={info}
      >
        i
      </span>
    </span>
  );
}

/**
 * Renders editable AI provider settings and generation controls.
 * @param aiPreferences Current preferences bound to the form.
 * @param geminiModels Optional model list loaded from Gemini API.
 * @param isRefreshingGeminiModels Loading flag for model refresh requests.
 * @param onUpdatePreference Callback for string/select preference updates.
 * @param onUpdateNumberPreference Callback for constrained numeric updates.
 * @param onRefreshGeminiModels Optional callback to refresh available Gemini models.
 */
function AiPreferencesFields({
  aiPreferences,
  geminiModels,
  isRefreshingGeminiModels,
  onUpdatePreference,
  onUpdateNumberPreference,
  onRefreshGeminiModels
}: AiPreferencesFieldsProps) {
  const selectedProvider = aiPreferences.provider;
  const safeGeminiModels = Array.isArray(geminiModels) ? geminiModels : [];
  const geminiModelOptions = safeGeminiModels.includes(aiPreferences.geminiModel)
    ? safeGeminiModels
    : [aiPreferences.geminiModel, ...safeGeminiModels];

  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-2">
        <label className="space-y-1">
          <span className="text-sm font-medium">Preferred AI provider</span>
          <select
            className="w-full rounded border border-slate-300 bg-white px-3 py-2 text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
            value={aiPreferences.provider}
            onChange={(event: ChangeEvent<HTMLSelectElement>) => onUpdatePreference('provider', event.target.value as AiPreferences['provider'])}
          >
            <option value="gemini">Gemini</option>
            <option value="chatgpt">ChatGPT</option>
            <option value="anthropic">Anthropic</option>
          </select>
        </label>
        <label className="space-y-1">
          <span className="text-sm font-medium">Writing style</span>
          <select
            className="w-full rounded border border-slate-300 bg-white px-3 py-2 text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
            value={aiPreferences.writingStyle}
            onChange={(event: ChangeEvent<HTMLSelectElement>) => onUpdatePreference('writingStyle', event.target.value)}
          >
            <option value="Balanced">Balanced</option>
            <option value="Creative">Creative</option>
            <option value="Storytelling">Storytelling</option>
            <option value="Professional">Professional</option>
            <option value="Technical">Technical</option>
          </select>
        </label>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        {selectedProvider === 'gemini' && (
          <>
            <label className="space-y-1">
              <span className="text-sm font-medium">Gemini API key</span>
              <input
                type="password"
                className="w-full rounded border border-slate-300 px-3 py-2 text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                value={aiPreferences.geminiApiKey}
                onChange={(event: ChangeEvent<HTMLInputElement>) => onUpdatePreference('geminiApiKey', event.target.value)}
                placeholder="AIza..."
              />
            </label>
            <label className="space-y-1">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium">Gemini model</span>
                <button
                  type="button"
                  className="rounded border border-slate-300 px-2 py-1 text-xs font-medium text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
                  onClick={() => {
                    void onRefreshGeminiModels?.();
                  }}
                  disabled={Boolean(isRefreshingGeminiModels)}
                >
                  {isRefreshingGeminiModels ? 'Refreshing...' : 'Update models'}
                </button>
              </div>
              <select
                className="w-full rounded border border-slate-300 bg-white px-3 py-2 text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                value={aiPreferences.geminiModel}
                onChange={(event: ChangeEvent<HTMLSelectElement>) => onUpdatePreference('geminiModel', event.target.value)}
              >
                {geminiModelOptions.map((model) => (
                  <option key={model} value={model}>{model}</option>
                ))}
              </select>
            </label>
          </>
        )}

        {selectedProvider === 'chatgpt' && (
          <>
            <label className="space-y-1">
              <span className="text-sm font-medium">ChatGPT API key</span>
              <input
                type="password"
                className="w-full rounded border border-slate-300 px-3 py-2 text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                value={aiPreferences.chatgptApiKey}
                onChange={(event: ChangeEvent<HTMLInputElement>) => onUpdatePreference('chatgptApiKey', event.target.value)}
                placeholder="sk-..."
              />
            </label>
            <label className="space-y-1">
              <span className="text-sm font-medium">ChatGPT model</span>
              <select
                className="w-full rounded border border-slate-300 bg-white px-3 py-2 text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                value={aiPreferences.chatgptModel}
                onChange={(event: ChangeEvent<HTMLSelectElement>) => onUpdatePreference('chatgptModel', event.target.value)}
              >
                {CHATGPT_MODELS.map((model) => (
                  <option key={model} value={model}>{model}</option>
                ))}
              </select>
            </label>
          </>
        )}

        {selectedProvider === 'anthropic' && (
          <>
            <label className="space-y-1">
              <span className="text-sm font-medium">Anthropic API key</span>
              <input
                type="password"
                className="w-full rounded border border-slate-300 px-3 py-2 text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                value={aiPreferences.anthropicApiKey}
                onChange={(event: ChangeEvent<HTMLInputElement>) => onUpdatePreference('anthropicApiKey', event.target.value)}
                placeholder="sk-ant-..."
              />
            </label>
            <label className="space-y-1">
              <span className="text-sm font-medium">Anthropic model</span>
              <select
                className="w-full rounded border border-slate-300 bg-white px-3 py-2 text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                value={aiPreferences.anthropicModel}
                onChange={(event: ChangeEvent<HTMLSelectElement>) => onUpdatePreference('anthropicModel', event.target.value)}
              >
                {ANTHROPIC_MODELS.map((model) => (
                  <option key={model} value={model}>{model}</option>
                ))}
              </select>
            </label>
          </>
        )}
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <label className="space-y-1">
          <InfoLabel
            text="Temperature (0.0-2.0)"
            info="Controls randomness/creativity. Lower values (near 0) make output more deterministic and focused. Higher values (toward 2) make output more varied and creative, but potentially less consistent."
          />
          <input
            type="number"
            min={0}
            max={2}
            step={0.1}
            className="w-full rounded border border-slate-300 px-3 py-2 text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
            value={aiPreferences.temperature}
            onChange={(event: ChangeEvent<HTMLInputElement>) => onUpdateNumberPreference('temperature', event.target.value, 0, 2)}
          />
        </label>
        <label className="space-y-1">
          <InfoLabel
            text="Top P (0.0-1.0)"
            info="Controls nucleus sampling. Lower values (near 0) restrict choices to the most likely tokens for safer/more focused text. Higher values (toward 1) allow more diverse token choices for richer but less predictable text."
          />
          <input
            type="number"
            min={0}
            max={1}
            step={0.05}
            className="w-full rounded border border-slate-300 px-3 py-2 text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
            value={aiPreferences.topP}
            onChange={(event: ChangeEvent<HTMLInputElement>) => onUpdateNumberPreference('topP', event.target.value, 0, 1)}
          />
        </label>
        <label className="space-y-1">
          <InfoLabel
            text="Max tokens"
            info="Sets the maximum output length. Lower values produce shorter responses and may cut ideas early. Higher values allow longer, more complete outputs but can increase latency/cost. Current limits here: minimum 64, maximum 8192."
          />
          <input
            type="number"
            min={64}
            max={8192}
            step={1}
            className="w-full rounded border border-slate-300 px-3 py-2 text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
            value={aiPreferences.maxTokens}
            onChange={(event: ChangeEvent<HTMLInputElement>) => onUpdateNumberPreference('maxTokens', event.target.value, 64, 8192)}
          />
        </label>
        <label className="space-y-1">
          <InfoLabel
            text="Presence penalty (-2.0 to 2.0)"
            info="Encourages topic novelty. Higher positive values push the model to introduce new concepts rather than repeating already-used topics. Lower/negative values make it more likely to stay on existing topics and reuse prior context."
          />
          <input
            type="number"
            min={-2}
            max={2}
            step={0.1}
            className="w-full rounded border border-slate-300 px-3 py-2 text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
            value={aiPreferences.presencePenalty}
            onChange={(event: ChangeEvent<HTMLInputElement>) => onUpdateNumberPreference('presencePenalty', event.target.value, -2, 2)}
          />
        </label>
        <label className="space-y-1 md:col-span-2">
          <InfoLabel
            text="Frequency penalty (-2.0 to 2.0)"
            info="Reduces repeated words/phrases. Higher positive values penalize repetition more strongly, creating more varied wording. Lower/negative values allow more repetition, which can help emphasis but may feel redundant."
          />
          <input
            type="number"
            min={-2}
            max={2}
            step={0.1}
            className="w-full rounded border border-slate-300 px-3 py-2 text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
            value={aiPreferences.frequencyPenalty}
            onChange={(event: ChangeEvent<HTMLInputElement>) => onUpdateNumberPreference('frequencyPenalty', event.target.value, -2, 2)}
          />
        </label>
      </div>

      <label className="space-y-1">
        <span className="text-sm font-medium">System prompt</span>
        <textarea
          rows={6}
          className="w-full rounded border border-slate-300 px-3 py-2 text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
          value={aiPreferences.systemPrompt}
          onChange={(event: ChangeEvent<HTMLTextAreaElement>) => onUpdatePreference('systemPrompt', event.target.value)}
          placeholder="Define global behavior for writing assistance."
        />
      </label>
    </div>
  );
}

export default AiPreferencesFields;
