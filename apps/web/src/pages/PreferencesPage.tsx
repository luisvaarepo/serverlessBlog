import type { AiPreferences } from '../types';
import AiPreferencesFields from '../components/ai/AiPreferencesFields';

interface PreferencesPageProps {
  aiPreferences: AiPreferences;
  geminiModels: string[];
  isRefreshingGeminiModels: boolean;
  onUpdatePreference: <Key extends keyof AiPreferences>(key: Key, value: AiPreferences[Key]) => void;
  onUpdateNumberPreference: (
    key: 'temperature' | 'topP' | 'maxTokens' | 'presencePenalty' | 'frequencyPenalty',
    value: string,
    min: number,
    max: number
  ) => void;
  onRefreshGeminiModels: () => Promise<void>;
}

/**
 * Hosts user-editable AI preference settings.
 * @param aiPreferences Current AI preferences object.
 * @param geminiModels Available Gemini model options.
 * @param isRefreshingGeminiModels Loading flag for model refresh.
 * @param onUpdatePreference Callback for basic preference updates.
 * @param onUpdateNumberPreference Callback for numeric preference updates.
 * @param onRefreshGeminiModels Callback to refresh model list from API.
 */
function PreferencesPage({
  aiPreferences,
  geminiModels,
  isRefreshingGeminiModels,
  onUpdatePreference,
  onUpdateNumberPreference,
  onRefreshGeminiModels
}: PreferencesPageProps) {
  return (
    <section className="space-y-4 rounded-lg bg-white p-4 shadow dark:bg-slate-900 dark:shadow-slate-900/40">
      <div>
        <h2 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">Preferences</h2>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
          Manage AI provider keys, choose a default model provider, and tune creative-writing behavior.
        </p>
      </div>
      <AiPreferencesFields
        aiPreferences={aiPreferences}
        geminiModels={geminiModels}
        isRefreshingGeminiModels={isRefreshingGeminiModels}
        onUpdatePreference={onUpdatePreference}
        onUpdateNumberPreference={onUpdateNumberPreference}
        onRefreshGeminiModels={onRefreshGeminiModels}
      />
    </section>
  );
}

export default PreferencesPage;
