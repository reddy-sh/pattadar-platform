import { useCallback, useEffect, useState } from 'react';
import { apiErrorMessage, apiFetch } from '../../api/client';
import { usePortfolio } from '../api';
import { Card, PageHead } from '../ui';

type Settings = {
  provider: 'gemini' | 'anthropic'; geminiModel: string; claudeModel: string;
  ocrEnabled: boolean; processor: string;
  geminiKeyConfigured: boolean; claudeKeyConfigured: boolean;
};
type Model = { id: string; provider_id: string; model_id: string; display_name: string;
  enabled: boolean; provider_status: string };
const ROOT = '/api/gateway/admin';

async function data<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await apiFetch(`${ROOT}${path}`, init);
  if (!response.ok) throw new Error(await apiErrorMessage(response, `Request failed (${response.status})`));
  return response.json() as Promise<T>;
}

export function IntelligenceAdmin() {
  const portfolio = usePortfolio();
  const allowed = portfolio.data?.isSuperAdmin === true;
  const [settings, setSettings] = useState<Settings | null>(null);
  const [models, setModels] = useState<Model[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const refresh = useCallback(async () => {
    const [config, catalog] = await Promise.all([
      data<Settings>('/intelligence'), data<{ models: Model[] }>('/models'),
    ]);
    setSettings(config);
    setModels(catalog.models);
  }, []);

  useEffect(() => {
    if (!allowed) return;
    refresh().catch((e: Error) => setError(e.message));
  }, [allowed, refresh]);

  async function sync(provider: 'gemini' | 'anthropic') {
    setBusy(true); setError(''); setNotice('');
    try {
      await data('/models/sync', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider }),
      });
      await refresh();
      setNotice(`${provider === 'gemini' ? 'Gemini' : 'Claude'} models refreshed from the provider.`);
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }

  async function enableSelected(provider: 'gemini' | 'anthropic') {
    if (!settings) return;
    const id = `${provider}:${provider === 'gemini' ? settings.geminiModel : settings.claudeModel}`;
    setBusy(true); setError(''); setNotice('');
    try {
      await data(`/models/${encodeURIComponent(id)}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: true, use_cases: ['document_reading'] }),
      });
      await refresh();
      setNotice('Selected model enabled for document reading. Save to use it.');
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }

  async function save() {
    if (!settings) return;
    setBusy(true); setError(''); setNotice('');
    try {
      const saved = await data<Settings>('/intelligence', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: settings.provider, gemini_model: settings.geminiModel,
          claude_model: settings.claudeModel, ocr_enabled: settings.ocrEnabled,
          processor: settings.processor.trim(),
        }),
      });
      setSettings(saved);
      setNotice('Pattadar Intelligence settings saved. New document readings use this selection.');
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }

  if (portfolio.isLoading) return <main><PageHead title="Pattadar Intelligence" summary="Loading access…" /></main>;
  if (!allowed) return <main><PageHead title="Pattadar Intelligence" summary="Access denied" />
    <p>Super-admin access is required.</p></main>;
  if (!settings) return <main><PageHead title="Pattadar Intelligence" summary="Loading settings…" />
    <p role="status">{error || 'Loading settings…'}</p></main>;

  const options = (provider: 'gemini' | 'anthropic') => models.filter(
    (row) => row.provider_id === provider && row.provider_status === 'active');
  const selected = (provider: 'gemini' | 'anthropic') => models.find(
    (row) => row.id === `${provider}:${provider === 'gemini' ? settings.geminiModel : settings.claudeModel}`);

  return <main className="w360-page" style={{ maxWidth: '52rem' }}>
    <PageHead title="Pattadar Intelligence"
      summary={`${options('gemini').length + options('anthropic').length} available models`} />
    <p>Choose how new passbooks, registered documents and property documents are read.</p>
    {error && <p role="alert">{error}</p>}
    {notice && <p role="status">{notice}</p>}

    <Card title="Google Gemini">
      <p>Default: Gemini 3.5 Flash-Lite. Pull the latest available models from Google, then enable and select one.</p>
      <p>Connection: {settings.geminiKeyConfigured ? 'Configured' : 'Not configured'}</p>
      <label><input type="radio" name="reading-provider" checked={settings.provider === 'gemini'}
        onChange={() => setSettings({ ...settings, provider: 'gemini' })} /> Use Gemini for document fields</label>
      <div className="field"><label htmlFor="gemini-model">Gemini model</label>
        <select id="gemini-model" value={settings.geminiModel}
          onChange={(e) => setSettings({ ...settings, geminiModel: e.target.value })}>
          {!options('gemini').some((row) => row.model_id === settings.geminiModel) &&
            <option value={settings.geminiModel}>{settings.geminiModel}</option>}
          {options('gemini').map((row) => <option key={row.id} value={row.model_id}>
            {row.display_name} {!row.enabled ? '(disabled)' : ''}</option>)}
        </select></div>
      <button type="button" disabled={busy} onClick={() => sync('gemini')}>Pull latest Gemini models</button>{' '}
      {selected('gemini')?.enabled === false && <button type="button" disabled={busy}
        onClick={() => enableSelected('gemini')}>Enable selected model</button>}
    </Card>

    <Card title="Google Document AI OCR">
      <p>OCR reads Telugu and other Indian-language text before Gemini extracts fields.</p>
      <label><input type="checkbox" checked={settings.ocrEnabled}
        onChange={(e) => setSettings({ ...settings, ocrEnabled: e.target.checked })} /> Use Document AI OCR</label>
      <div className="field"><label htmlFor="ocr-processor">OCR processor resource</label>
        <input id="ocr-processor" value={settings.processor}
          onChange={(e) => setSettings({ ...settings, processor: e.target.value })}
          placeholder="projects/PROJECT/locations/us/processors/PROCESSOR" /></div>
      <p>Google Cloud credentials are supplied to the API service through its secret configuration.</p>
    </Card>

    <Card title="Claude">
      <p>Claude remains available for document reading and as the fallback until Gemini is configured.</p>
      <p>Connection: {settings.claudeKeyConfigured ? 'Configured' : 'Not configured'}</p>
      <label><input type="radio" name="reading-provider" checked={settings.provider === 'anthropic'}
        onChange={() => setSettings({ ...settings, provider: 'anthropic' })} /> Use Claude for document fields</label>
      <div className="field"><label htmlFor="claude-model">Claude model</label>
        <select id="claude-model" value={settings.claudeModel}
          onChange={(e) => setSettings({ ...settings, claudeModel: e.target.value })}>
          {!options('anthropic').some((row) => row.model_id === settings.claudeModel) &&
            <option value={settings.claudeModel}>{settings.claudeModel}</option>}
          {options('anthropic').map((row) => <option key={row.id} value={row.model_id}>
            {row.display_name} {!row.enabled ? '(disabled)' : ''}</option>)}
        </select></div>
      <button type="button" disabled={busy} onClick={() => sync('anthropic')}>Pull latest Claude models</button>{' '}
      {selected('anthropic')?.enabled === false && <button type="button" disabled={busy}
        onClick={() => enableSelected('anthropic')}>Enable selected model</button>}
      <p>Claude credentials can be changed in the cloud secret used by the service.</p>
    </Card>
    <button type="button" disabled={busy} onClick={save}>Save Intelligence settings</button>
  </main>;
}
