import MDEditor from '@uiw/react-md-editor';
import { useState, type ChangeEvent, type FormEvent, type KeyboardEvent, type MouseEvent, type SyntheticEvent } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { generatePremiumPostResearch } from '../api';
import type { Page } from '../app/types';
import { hasAiProviderApiKey, runAiPrompt } from '../features/ai/client';
import type { AiPreferences } from '../types';

type AiAction = 'create' | 'create-premium' | 'expand' | 'reword' | 'proofread';

interface SelectionRange {
  start: number;
  end: number;
  text: string;
}

/**
 * Builds a client-side generation prompt using backend premium research sources.
 * @param topic User-selected post topic.
 * @param content Provider content summary returned by backend research endpoint.
 * @param sources Structured premium research sources returned by backend.
 * @returns Prompt text suitable for the selected LLM provider.
 */
function buildPremiumResearchPrompt(
  topic: string,
  content: string,
  sources: Array<{ title: string; url: string; snippets: string[] }>
): string {
  const sourceBlock = sources.length === 0
    ? 'No external sources were returned.'
    : sources
      .map((source, index) => {
        const snippetText = source.snippets.filter((snippet) => snippet.trim() !== '').join(' | ');
        const snippet = snippetText ? `\nSummary: ${snippetText}` : '';
        return `Source ${index + 1}: ${source.title} (${source.url})${snippet}`;
      })
      .join('\n\n');

  return [
    `Create a complete blog post in markdown about: ${topic}`,
    'Use the provided research sources as factual support.',
    'Output requirements:',
    '- Use a compelling title as a markdown H1 line.',
    '- Keep structure clear with short sections.',
    '- Include a final "## Sources" section with markdown links from the source URLs.',
    '- Return only the final blog post markdown.',
    '',
    'Research output content:',
    content || 'No research summary content was returned.',
    '',
    'Research sources:',
    sourceBlock
  ].join('\n');
}

const AI_ACTION_LABELS: Record<AiAction, string> = {
  create: 'Create with AI',
  'create-premium': 'Create with Premium AI (Beta)',
  expand: 'Expand selection',
  reword: 'Reword selection',
  proofread: 'Validate grammar'
};

/**
 * Replaces a segment of text using start/end index boundaries.
 * @param source Original source text.
 * @param start Inclusive start index.
 * @param end Exclusive end index.
 * @param replacement New text to insert.
 * @returns Updated text string.
 */
function replaceRange(source: string, start: number, end: number, replacement: string): string {
  return `${source.slice(0, start)}${replacement}${source.slice(end)}`;
}

/**
 * Extracts title/content from generated markdown when first line is an H1.
 * @param generatedText AI-generated markdown text.
 * @returns Parsed title when available and remaining content body.
 */
function parseGeneratedPost(generatedText: string): { title: string | null; content: string } {
  const trimmed = generatedText.trim();
  if (!trimmed.startsWith('#')) {
    return { title: null, content: trimmed };
  }

  const lines = trimmed.split('\n');
  const heading = lines[0]?.replace(/^#+\s*/, '').trim() ?? '';
  const contentBody = lines.slice(1).join('\n').trim();

  if (!heading || !contentBody) {
    return { title: null, content: trimmed };
  }

  return {
    title: heading,
    content: contentBody
  };
}

interface CreatePostPageProps {
  title: string;
  content: string;
  aiPreferences: AiPreferences;
  token: string | null;
  published: boolean;
  isPublishing: boolean;
  editingPostId: string | null;
  isDarkTheme: boolean;
  markdownContentClassName: string;
  minPostTitleLength: number;
  minPostContentLength: number;
  onSubmit: (event: FormEvent) => void;
  onSetTitle: (value: string) => void;
  onSetContent: (value: string) => void;
  onSetPublished: (value: boolean) => void;
  onNavigate: (page: Page) => void;
}

/**
 * Renders create/edit post form and AI-assisted writing actions.
 * @param title Current post title value.
 * @param content Current markdown content value.
 * @param aiPreferences Current AI settings used by assistant actions.
 * @param token Current auth token; required for publishing.
 * @param published Indicates whether the post is publicly visible.
 * @param isPublishing Indicates submit request is in progress.
 * @param editingPostId Post id being edited or `null` for create mode.
 * @param isDarkTheme Indicates whether dark mode classes are active.
 * @param markdownContentClassName Shared markdown style class string.
 * @param minPostTitleLength Minimum valid title length.
 * @param minPostContentLength Minimum valid content length.
 * @param onSubmit Form submit callback.
 * @param onSetTitle Callback to update title state.
 * @param onSetContent Callback to update content state.
 * @param onSetPublished Callback to update publish state.
 * @param onNavigate Callback to navigate between pages.
 */
function CreatePostPage({
  title,
  content,
  aiPreferences,
  token,
  published,
  isPublishing,
  editingPostId,
  isDarkTheme,
  markdownContentClassName,
  minPostTitleLength,
  minPostContentLength,
  onSubmit,
  onSetTitle,
  onSetContent,
  onSetPublished,
  onNavigate
}: CreatePostPageProps) {
  const [topic, setTopic] = useState('');
  const [aiActionInProgress, setAiActionInProgress] = useState<AiAction | null>(null);
  const [aiError, setAiError] = useState('');
  const [aiMessage, setAiMessage] = useState('');
  const [selectionRange, setSelectionRange] = useState<SelectionRange>({
    start: 0,
    end: 0,
    text: ''
  });
  const hasProviderApiKey = hasAiProviderApiKey(aiPreferences);

  /**
   * Tracks current text selection inside markdown editor textarea.
   * @param target Textarea DOM element producing selection coordinates.
   */
  function updateSelection(target: HTMLTextAreaElement) {
    const start = target.selectionStart ?? 0;
    const end = target.selectionEnd ?? 0;
    setSelectionRange({
      start,
      end,
      text: target.value.slice(start, end)
    });
  }

  /**
   * Executes an AI action and applies successful generated output.
   * @param action Action key used to drive UI loading state.
   * @param prompt Prompt sent to selected AI provider.
   * @param onSuccess Callback to merge generated text into form state.
   */
  async function runAction(action: AiAction, prompt: string, onSuccess: (generatedText: string) => void) {
    setAiError('');
    setAiMessage('');
    setAiActionInProgress(action);

    try {
      const generatedText = await runAiPrompt(aiPreferences, prompt);
      onSuccess(generatedText.trim());
      setAiMessage('AI update applied.');
    } catch (error) {
      setAiError((error as Error).message);
    } finally {
      setAiActionInProgress(null);
    }
  }

  /**
   * Validates selected text before running selection-based AI actions.
   * @returns Current valid selection range.
   */
  function ensureSelection(): SelectionRange {
    if (!selectionRange.text.trim() || selectionRange.start === selectionRange.end) {
      throw new Error('Select text in the editor before using this AI action.');
    }

    return selectionRange;
  }

  /**
   * Generates a complete draft post from the topic input.
   */
  async function handleCreateFromTopic() {
    const trimmedTopic = topic.trim();
    if (!trimmedTopic) {
      setAiError('Enter a topic to generate a blog post.');
      return;
    }

    const prompt = [
      `Create a complete blog post in markdown about: ${trimmedTopic}`,
      'Output requirements:',
      '- Use a compelling title as a markdown H1 line.',
      '- Keep structure clear with short sections.',
      '- Keep the tone aligned with the configured writing style.',
      '- Return only the final blog post markdown.'
    ].join('\n');

    await runAction('create', prompt, (generatedText) => {
      const parsed = parseGeneratedPost(generatedText);
      if (parsed.title) {
        onSetTitle(parsed.title);
      } else if (!title.trim()) {
        onSetTitle(trimmedTopic);
      }
      onSetContent(parsed.content);
    });
  }

  /**
   * Generates a complete draft post using the premium server-side AI mode.
   */
  async function handleCreateFromTopicPremium() {
    const trimmedTopic = topic.trim();
    if (!trimmedTopic) {
      setAiError('Enter a topic to generate a blog post.');
      return;
    }

    if (!token) {
      setAiError('Log in to use Premium AI beta mode.');
      return;
    }

    if (!hasProviderApiKey) {
      setAiError('Set your selected AI provider API key in Preferences to generate a premium draft.');
      return;
    }

    setAiError('');
    setAiMessage('');
    setAiActionInProgress('create-premium');

    try {
      const research = await generatePremiumPostResearch(trimmedTopic, token);
      const prompt = buildPremiumResearchPrompt(trimmedTopic, research.output.content, research.output.sources);
      const generatedText = await runAiPrompt(aiPreferences, prompt);
      const parsed = parseGeneratedPost(generatedText);
      if (parsed.title) {
        onSetTitle(parsed.title);
      } else if (!title.trim()) {
        onSetTitle(trimmedTopic);
      }

      onSetContent(parsed.content);
      setAiMessage('Premium AI beta research applied and draft generated.');
    } catch (error) {
      setAiError((error as Error).message);
    } finally {
      setAiActionInProgress(null);
    }
  }

  /**
   * Expands currently selected editor text using AI.
   */
  async function handleExpandSelection() {
    let selection: SelectionRange;

    try {
      selection = ensureSelection();
    } catch (error) {
      setAiError((error as Error).message);
      return;
    }

    const prompt = [
      'Expand the following text into one clear paragraph.',
      'Preserve its original meaning and tone.',
      'Return only the expanded paragraph without quotes or labels.',
      '',
      selection.text
    ].join('\n');

    await runAction('expand', prompt, (generatedText) => {
      const updatedContent = replaceRange(content, selection.start, selection.end, generatedText);
      onSetContent(updatedContent);
    });
  }

  /**
   * Rewrites currently selected editor text for clarity.
   */
  async function handleRewordSelection() {
    let selection: SelectionRange;

    try {
      selection = ensureSelection();
    } catch (error) {
      setAiError((error as Error).message);
      return;
    }

    const prompt = [
      'Reword the following text for better clarity and flow.',
      'Keep the same meaning and similar length.',
      'Return only the rewritten text without quotes or labels.',
      '',
      selection.text
    ].join('\n');

    await runAction('reword', prompt, (generatedText) => {
      const updatedContent = replaceRange(content, selection.start, selection.end, generatedText);
      onSetContent(updatedContent);
    });
  }

  /**
   * Proofreads the full post content while preserving markdown.
   */
  async function handleProofreadPost() {
    if (!content.trim()) {
      setAiError('Write some content before validating orthography and grammar.');
      return;
    }

    const prompt = [
      'Validate orthography and grammar of the full blog post below.',
      'Keep markdown formatting and preserve the original meaning.',
      'Return only the corrected blog post content.',
      '',
      content
    ].join('\n');

    await runAction('proofread', prompt, (generatedText) => {
      onSetContent(generatedText);
    });
  }

  return (
    <form className="space-y-3 rounded-lg bg-white p-4 shadow dark:bg-slate-900 dark:shadow-slate-900/40" onSubmit={onSubmit}>
      <h2 className="text-xl font-semibold">{editingPostId ? 'Edit post' : 'Create post'}</h2>
      <input
        className="w-full rounded border border-slate-300 px-3 py-2 text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
        placeholder="Post title"
        value={title}
        onChange={(event: ChangeEvent<HTMLInputElement>) => onSetTitle(event.target.value)}
        minLength={minPostTitleLength}
        required
      />
      <p className="text-sm text-slate-500 dark:text-slate-400">Title must be at least {minPostTitleLength} characters.</p>
      <div className={`space-y-2 rounded border p-3 ${isDarkTheme ? 'border-slate-700 bg-slate-950' : 'border-slate-200 bg-slate-50'}`}>
        <p className={`text-sm font-medium ${isDarkTheme ? 'text-slate-200' : 'text-slate-800'}`}>AI Writing Assistant</p>
        <input
          className="w-full rounded border border-slate-300 px-3 py-2 text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
          placeholder="Topic for AI generated blog post"
          value={topic}
          onChange={(event: ChangeEvent<HTMLInputElement>) => setTopic(event.target.value)}
        />
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="rounded border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
            disabled={!!aiActionInProgress || !topic.trim() || !hasProviderApiKey}
            onClick={() => {
              void handleCreateFromTopic();
            }}
          >
            {aiActionInProgress === 'create' ? 'Generating...' : AI_ACTION_LABELS.create}
          </button>
          <button
            type="button"
            className="rounded border border-indigo-300 bg-indigo-50 px-3 py-2 text-sm font-medium text-indigo-700 hover:bg-indigo-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-indigo-700 dark:bg-indigo-950 dark:text-indigo-200 dark:hover:bg-indigo-900"
            disabled={!!aiActionInProgress || !topic.trim() || !token || !hasProviderApiKey}
            onClick={() => {
              void handleCreateFromTopicPremium();
            }}
          >
            {aiActionInProgress === 'create-premium' ? 'Researching...' : AI_ACTION_LABELS['create-premium']}
          </button>
          <button
            type="button"
            className="rounded border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
            disabled={!!aiActionInProgress || !selectionRange.text.trim() || !hasProviderApiKey}
            onClick={() => {
              void handleExpandSelection();
            }}
          >
            {aiActionInProgress === 'expand' ? 'Expanding...' : AI_ACTION_LABELS.expand}
          </button>
          <button
            type="button"
            className="rounded border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
            disabled={!!aiActionInProgress || !selectionRange.text.trim() || !hasProviderApiKey}
            onClick={() => {
              void handleRewordSelection();
            }}
          >
            {aiActionInProgress === 'reword' ? 'Rewording...' : AI_ACTION_LABELS.reword}
          </button>
          <button
            type="button"
            className="rounded border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
            disabled={!!aiActionInProgress || !content.trim() || !hasProviderApiKey}
            onClick={() => {
              void handleProofreadPost();
            }}
          >
            {aiActionInProgress === 'proofread' ? 'Validating...' : AI_ACTION_LABELS.proofread}
          </button>
        </div>
        {!hasProviderApiKey && (
          <p className="text-xs text-amber-600 dark:text-amber-400">Set your selected AI provider API key in Preferences to enable AI actions.</p>
        )}
        {!token && (
          <p className="text-xs text-amber-600 dark:text-amber-400">Log in to use the Premium AI beta mode.</p>
        )}
        {aiError && <p className="text-sm text-red-600 dark:text-red-400">{aiError}</p>}
        {aiMessage && <p className="text-sm text-emerald-600 dark:text-emerald-400">{aiMessage}</p>}
      </div>
      <div data-color-mode={isDarkTheme ? 'dark' : 'light'}>
        <MDEditor
          value={content}
          onChange={(value) => onSetContent(value ?? '')}
          height={280}
          preview="edit"
          textareaProps={{
            placeholder: 'Post content',
            onSelect: (event: SyntheticEvent<HTMLTextAreaElement>) => updateSelection(event.currentTarget),
            onKeyUp: (event: KeyboardEvent<HTMLTextAreaElement>) => updateSelection(event.currentTarget),
            onMouseUp: (event: MouseEvent<HTMLTextAreaElement>) => updateSelection(event.currentTarget)
          }}
        />
      </div>
      <p className="text-sm text-slate-500 dark:text-slate-400">Content must be at least {minPostContentLength} characters.</p>
      <p className="text-sm text-slate-500 dark:text-slate-400">Use the toolbar to format markdown. Full formatting is rendered on the single post page.</p>
      <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
        <input
          type="checkbox"
          checked={published}
          onChange={(event: ChangeEvent<HTMLInputElement>) => onSetPublished(event.target.checked)}
        />
        Publish immediately (uncheck to save as draft)
      </label>
      <div className={`rounded-lg border p-4 ${isDarkTheme ? 'border-slate-700 bg-slate-950' : 'border-slate-200 bg-slate-50'}`}>
        <h3 className={`text-sm font-semibold uppercase tracking-wide ${isDarkTheme ? 'text-slate-300' : 'text-slate-700'}`}>Preview</h3>
        {content.trim() ? (
          <ReactMarkdown className={markdownContentClassName} remarkPlugins={[remarkGfm]}>
            {content}
          </ReactMarkdown>
        ) : (
          <p className={`mt-2 text-sm ${isDarkTheme ? 'text-slate-400' : 'text-slate-500'}`}>Start writing to see a formatted preview.</p>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button
          className="inline-flex items-center justify-center gap-2 rounded bg-slate-900 px-4 py-2 font-medium text-white disabled:cursor-not-allowed disabled:opacity-60 dark:bg-slate-100 dark:text-slate-900"
          type="submit"
          disabled={!token || isPublishing}
        >
          {isPublishing && <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/60 border-t-white dark:border-slate-400 dark:border-t-slate-900" />}
          {isPublishing ? (editingPostId ? 'Saving...' : 'Publishing...') : editingPostId ? 'Save changes' : published ? 'Publish' : 'Save draft'}
        </button>
        {editingPostId && (
          <button
            type="button"
            className="rounded border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
            onClick={() => onNavigate('my-posts')}
          >
            Cancel edit
          </button>
        )}
      </div>
      {!token && <p className="text-sm text-slate-500 dark:text-slate-400">You must login to publish posts.</p>}
    </form>
  );
}

export default CreatePostPage;
