import { FolderInput, Zap } from 'lucide-react';
import { Switch } from '../../../components/ui';
import { AutoOrganizeSettings } from '../../../types';

interface AutoOrganizeSectionProps {
  settings: AutoOrganizeSettings;
  hasGeminiKey: boolean;
  onChange: (settings: Partial<AutoOrganizeSettings>) => void;
}

export function AutoOrganizeSection({
  settings,
  hasGeminiKey,
  onChange,
}: AutoOrganizeSectionProps) {
  return (
    <div className="settings-section">
      <h3 className="settings-section-title">
        <FolderInput size={16} style={{ marginRight: 8 }} />
        Organisation automatique
      </h3>
      <p className="settings-hint">
        Surveille le dossier _Inbox de chaque projet et range automatiquement les fichiers
        dans le bon dossier en utilisant l'IA.
      </p>

      {!hasGeminiKey && (
        <div className="gemini-status error" style={{ marginBottom: 16 }}>
          <span>Configurez une clé API Gemini pour activer cette fonctionnalité</span>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginTop: 16 }}>
        <Switch
          checked={settings.enabled}
          onChange={(checked) => onChange({ enabled: checked })}
          label="Activer la surveillance des dossiers _Inbox"
          disabled={!hasGeminiKey}
        />

        <Switch
          checked={settings.autoMove}
          onChange={(checked) => onChange({ autoMove: checked })}
          label="Déplacement automatique"
          disabled={!hasGeminiKey || !settings.enabled}
        />

        {settings.enabled && !settings.autoMove && (
          <p className="settings-hint" style={{ marginLeft: 8 }}>
            <Zap size={12} style={{ marginRight: 4 }} />
            Mode confirmation : une notification vous demandera de valider chaque déplacement
          </p>
        )}

        {settings.enabled && settings.autoMove && (
          <div>
            <label className="settings-label">
              Seuil de confiance pour le déplacement automatique
            </label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <input
                type="range"
                min="50"
                max="100"
                step="5"
                value={settings.confidenceThreshold}
                onChange={(e) =>
                  onChange({ confidenceThreshold: parseInt(e.target.value, 10) })
                }
                style={{ flex: 1 }}
                disabled={!hasGeminiKey}
              />
              <span style={{ minWidth: 40, textAlign: 'right' }}>
                {settings.confidenceThreshold}%
              </span>
            </div>
            <p className="settings-hint" style={{ marginTop: 4 }}>
              Les fichiers avec une confiance inférieure demanderont confirmation
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
