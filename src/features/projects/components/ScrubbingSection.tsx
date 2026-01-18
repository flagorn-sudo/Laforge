import { useState } from 'react';
import { Plus, Trash2, FileDown, Globe } from 'lucide-react';
import { ReferenceWebsite } from '../../../types';
import { Input, Button } from '../../../components/ui';

const MAX_REFERENCE_WEBSITES = 5;

function isValidUrl(string: string): boolean {
  try {
    const url = new URL(string);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

interface ScrubbingSectionProps {
  name: string;
  client?: string;
  currentSiteUrl?: string;
  referenceWebsites: ReferenceWebsite[];
  onCurrentSiteUrlChange: (url: string) => void;
  onAddReferenceWebsite: (website: ReferenceWebsite) => void;
  onRemoveReferenceWebsite: (index: number) => void;
}

export function ScrubbingSection({
  name,
  client,
  currentSiteUrl,
  referenceWebsites,
  onCurrentSiteUrlChange,
  onAddReferenceWebsite,
  onRemoveReferenceWebsite,
}: ScrubbingSectionProps) {
  const [newReferenceUrl, setNewReferenceUrl] = useState('');

  const handleAddReferenceWebsite = () => {
    if (!newReferenceUrl.trim()) return;
    if (referenceWebsites.length >= MAX_REFERENCE_WEBSITES) return;

    let url = newReferenceUrl.trim();
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      url = 'https://' + url;
    }

    if (!isValidUrl(url)) return;

    const newRef: ReferenceWebsite = {
      url,
      addedAt: new Date().toISOString(),
    };

    onAddReferenceWebsite(newRef);
    setNewReferenceUrl('');
  };

  const handleExportMarkdown = () => {
    const lines = [
      `# ${name}`,
      '',
      client ? `**Client:** ${client}` : '',
      '',
      '## Site actuel',
      currentSiteUrl ? `- ${currentSiteUrl}` : '_Non défini_',
      '',
      '## Sites de référence graphique',
    ];

    if (referenceWebsites.length > 0) {
      referenceWebsites.forEach((ref) => {
        lines.push(`- [${ref.name || ref.url}](${ref.url})`);
      });
    } else {
      lines.push('_Aucun site de référence_');
    }

    const content = lines.filter(Boolean).join('\n');
    const blob = new Blob([content], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${name || 'projet'}-references.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="form-section">
      <div className="form-section-title">Scrubbing</div>
      <Input
        label="Site actuel (ancien site client)"
        value={currentSiteUrl || ''}
        onChange={(e) => onCurrentSiteUrlChange(e.target.value)}
        placeholder="https://old-site.com"
      />

      <div className="form-field" style={{ marginTop: 16 }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 8,
          }}
        >
          <label className="form-label" style={{ marginBottom: 0 }}>
            Sites de référence graphique ({referenceWebsites.length}/
            {MAX_REFERENCE_WEBSITES})
          </label>
        </div>

        {referenceWebsites.length > 0 && (
          <div className="reference-websites-list">
            {referenceWebsites.map((ref, index) => (
              <div key={index} className="reference-website-item">
                <Globe size={14} className="reference-icon" />
                <span className="reference-url">{ref.url}</span>
                <button
                  type="button"
                  className="reference-remove"
                  onClick={() => onRemoveReferenceWebsite(index)}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        )}

        {referenceWebsites.length < MAX_REFERENCE_WEBSITES && (
          <div className="reference-add-row">
            <Input
              value={newReferenceUrl}
              onChange={(e) => setNewReferenceUrl(e.target.value)}
              placeholder="https://reference-site.com"
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleAddReferenceWebsite();
                }
              }}
            />
            <Button
              type="button"
              variant="secondary"
              onClick={handleAddReferenceWebsite}
              disabled={!newReferenceUrl.trim()}
              style={{ flexShrink: 0 }}
            >
              <Plus size={16} />
            </Button>
          </div>
        )}

        <Button
          type="button"
          variant="ghost"
          onClick={handleExportMarkdown}
          style={{ marginTop: 12, fontSize: 13 }}
        >
          <FileDown size={14} />
          Exporter en Markdown
        </Button>
      </div>
    </div>
  );
}
