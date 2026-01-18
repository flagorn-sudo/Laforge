import { useState, useEffect } from 'react';
import { Key, CheckCircle, XCircle, Loader, RefreshCw } from 'lucide-react';
import { geminiService, GeminiModel } from '../../../services/geminiService';
import { Button, ExternalLink } from '../../../components/ui';

type GeminiStatus = 'idle' | 'testing' | 'connected' | 'error';

interface GeminiSectionProps {
  apiKey: string;
  model: string;
  onApiKeyChange: (key: string) => void;
  onModelChange: (model: string) => void;
}

export function GeminiSection({
  apiKey,
  model,
  onApiKeyChange,
  onModelChange,
}: GeminiSectionProps) {
  const [status, setStatus] = useState<GeminiStatus>('idle');
  const [availableModels, setAvailableModels] = useState<GeminiModel[]>([]);
  const [loadingModels, setLoadingModels] = useState(false);

  const loadModels = async (key: string) => {
    setLoadingModels(true);
    try {
      const models = await geminiService.listModels(key);
      setAvailableModels(models);
      if (!model && models.length > 0) {
        const bestModel = geminiService.getBestDefaultModel(models);
        onModelChange(bestModel);
      }
    } catch {
      setAvailableModels([]);
    } finally {
      setLoadingModels(false);
    }
  };

  useEffect(() => {
    if (apiKey) {
      loadModels(apiKey);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiKey]);

  const handleTest = async () => {
    if (!apiKey) return;

    setStatus('testing');
    try {
      const success = await geminiService.testConnection(apiKey, model || undefined);
      if (success) {
        setStatus('connected');
        await loadModels(apiKey);
      } else {
        setStatus('error');
      }
    } catch {
      setStatus('error');
    }
  };

  const handleApiKeyChange = (key: string) => {
    onApiKeyChange(key);
    setStatus('idle');
  };

  return (
    <div className="settings-section">
      <h3 className="settings-section-title">API Gemini</h3>
      <p className="settings-hint">
        Clé API pour le parsing intelligent des credentials FTP.
      </p>
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
        <div style={{ flex: 1 }}>
          <input
            className="form-input"
            type="password"
            value={apiKey}
            onChange={(e) => handleApiKeyChange(e.target.value)}
            placeholder="AIza..."
          />
        </div>
        <Button
          variant="secondary"
          onClick={handleTest}
          disabled={!apiKey || status === 'testing'}
        >
          {status === 'testing' ? (
            <Loader size={16} className="spinner" />
          ) : (
            'Tester'
          )}
        </Button>
      </div>

      {status !== 'idle' && status !== 'testing' && (
        <div className={`gemini-status ${status}`} style={{ marginTop: 12 }}>
          {status === 'connected' ? (
            <>
              <CheckCircle size={16} />
              <span>Connexion réussie à Gemini API</span>
            </>
          ) : (
            <>
              <XCircle size={16} />
              <span>Échec de connexion - Vérifiez votre clé API</span>
            </>
          )}
        </div>
      )}

      {availableModels.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <label className="settings-label">Modèle Gemini</label>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <select
              className="form-input form-select"
              value={model}
              onChange={(e) => onModelChange(e.target.value)}
              style={{ flex: 1 }}
            >
              {availableModels.map((m) => (
                <option key={m.name} value={m.name}>
                  {m.displayName}
                </option>
              ))}
            </select>
            <Button
              variant="secondary"
              onClick={() => loadModels(apiKey)}
              disabled={loadingModels || !apiKey}
              title="Actualiser la liste des modèles"
            >
              {loadingModels ? (
                <Loader size={16} className="spinner" />
              ) : (
                <RefreshCw size={16} />
              )}
            </Button>
          </div>
          {model && (
            <p className="settings-hint" style={{ marginTop: 4 }}>
              Modèle sélectionné : {model}
            </p>
          )}
        </div>
      )}

      <p className="settings-hint" style={{ marginTop: 8 }}>
        <Key size={12} style={{ marginRight: 4 }} />
        Obtenez votre clé sur{' '}
        <ExternalLink
          href="https://makersuite.google.com/app/apikey"
          style={{ color: 'var(--accent-blue)' }}
        >
          Google AI Studio
        </ExternalLink>
      </p>
    </div>
  );
}
