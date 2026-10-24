import { env } from '../config/env.js';

const TIMEOUT_MS = 120000;

const OPENAI_STYLE_ENDPOINTS = {
  openai: 'https://api.openai.com/v1/chat/completions',
  xai: 'https://api.x.ai/v1/chat/completions',
  groq: 'https://api.groq.com/openai/v1/chat/completions',
};

// permanent = retrying will not help (bad key, bad model name). Used by the worker in Task 6.
export class LLMError extends Error {
  constructor(message, { status = null, permanent = false } = {}) {
    super(message);
    this.name = 'LLMError';
    this.status = status;
    this.permanent = permanent;
  }
}

function errorFromStatus(status, detail) {
  const snippet = String(detail || '').slice(0, 200);
  if (status === 401 || status === 403) {
    return new LLMError(`The LLM provider refused the request (${status}). Check LLM_API_KEY, account credits and permissions. ${snippet}`, { status, permanent: true });
  }
  if (status === 400 || status === 404) {
    return new LLMError(`The LLM request was rejected (${status}). Check LLM_MODEL and LLM_API_KEY. ${snippet}`, { status, permanent: true });
  }
  if (status === 429) return new LLMError('LLM rate limit reached', { status, permanent: false });
  if (status >= 500) return new LLMError(`LLM provider error (${status})`, { status, permanent: false });
  return new LLMError(`Unexpected LLM response (${status}). ${snippet}`, { status, permanent: true });
}

async function post(url, headers, body) {
  let res;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err) {
    if (err.name === 'TimeoutError' || err.name === 'AbortError') {
      throw new LLMError('LLM request timed out', { permanent: false });
    }
    throw new LLMError(`Network error calling the LLM: ${err.message}`, { permanent: false });
  }
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw errorFromStatus(res.status, detail);
  }
  return res.json();
}

export async function callLLM({ system, user, maxTokens = 2000 }) {
  if (!env.llmApiKey) throw new LLMError('LLM_API_KEY is not set in backend/.env', { permanent: true });
  if (!env.llmModel) throw new LLMError('LLM_MODEL is not set in backend/.env', { permanent: true });

  let text = '';
  const provider = env.llmProvider;

  if (provider === 'anthropic') {
    const data = await post(
      'https://api.anthropic.com/v1/messages',
      { 'x-api-key': env.llmApiKey, 'anthropic-version': '2023-06-01' },
      { model: env.llmModel, max_tokens: maxTokens, system, messages: [{ role: 'user', content: user }] }
    );
    text = (data.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('');
  } else if (OPENAI_STYLE_ENDPOINTS[provider]) {
    const body = {
      model: env.llmModel,
      messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
    };
    // JSON mode only for OpenAI. For xAI the prompt demands JSON and the parser handles the rest.
    if (provider === 'openai') body.response_format = { type: 'json_object' };
    const data = await post(OPENAI_STYLE_ENDPOINTS[provider], { authorization: `Bearer ${env.llmApiKey}` }, body);
    text = data.choices?.[0]?.message?.content || '';
  } else {
    throw new LLMError(`Unknown LLM_PROVIDER "${provider}". Use anthropic, openai, or xai.`, { permanent: true });
  }

  if (!text.trim()) throw new LLMError('The LLM returned an empty response', { permanent: false });
  return text;
}