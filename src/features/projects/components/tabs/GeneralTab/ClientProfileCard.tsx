/**
 * Client Profile Card
 * Displays and manages client description and design theme tags
 */

import { useState } from 'react';
import { Sparkles, Loader, Edit3, Check, Plus, X } from 'lucide-react';
import { Card, Button } from '../../../../../components/ui';

interface ClientProfileCardProps {
  clientDescription: string;
  themeTags: string[];
  geminiApiKey?: string;
  currentSiteUrl?: string;
  generatingProfile: boolean;
  onGenerateProfile: () => void;
  onSaveDescription: (description: string) => void;
  onAddTag: (tag: string) => void;
  onRemoveTag: (index: number) => void;
}

export function ClientProfileCard({
  clientDescription,
  themeTags,
  geminiApiKey,
  currentSiteUrl,
  generatingProfile,
  onGenerateProfile,
  onSaveDescription,
  onAddTag,
  onRemoveTag,
}: ClientProfileCardProps) {
  const [editingDescription, setEditingDescription] = useState(false);
  const [localDescription, setLocalDescription] = useState(clientDescription);
  const [showAddTag, setShowAddTag] = useState(false);
  const [newTagValue, setNewTagValue] = useState('');

  const handleSaveDescription = () => {
    setEditingDescription(false);
    onSaveDescription(localDescription);
  };

  const handleAddTag = () => {
    if (!newTagValue.trim()) return;
    onAddTag(newTagValue.trim());
    setNewTagValue('');
    setShowAddTag(false);
  };

  // Sync local description when prop changes
  if (!editingDescription && localDescription !== clientDescription) {
    setLocalDescription(clientDescription);
  }

  return (
    <Card
      title="Profil client"
      action={
        geminiApiKey && currentSiteUrl && (
          <Button
            variant="ghost"
            onClick={onGenerateProfile}
            disabled={generatingProfile}
            style={{ padding: '4px 8px', fontSize: 12 }}
          >
            {generatingProfile ? (
              <Loader size={14} className="spinner" />
            ) : (
              <Sparkles size={14} />
            )}
            {clientDescription ? 'Régénérer' : 'Générer'}
          </Button>
        )
      }
    >
      {/* Description */}
      <div className="client-description">
        {editingDescription ? (
          <textarea
            value={localDescription}
            onChange={(e) => setLocalDescription(e.target.value)}
            placeholder="Description de l'activité du client..."
            rows={3}
          />
        ) : (
          <p>
            {clientDescription || (
              <span className="profile-card-empty">
                {!currentSiteUrl
                  ? "Ajoutez l'URL du site client pour générer le profil."
                  : !geminiApiKey
                  ? 'Configurez une clé API Gemini dans les paramètres.'
                  : 'Cliquez sur Générer pour analyser le site.'}
              </span>
            )}
          </p>
        )}
        <button
          onClick={() => {
            if (editingDescription) {
              handleSaveDescription();
            } else {
              setEditingDescription(true);
            }
          }}
        >
          {editingDescription ? <Check size={14} /> : <Edit3 size={14} />}
        </button>
      </div>

      {/* Theme Tags */}
      <div className="theme-tags">
        <span className="theme-label">Orientations design:</span>
        <div className="chips-container">
          {themeTags.map((tag, i) => (
            <span key={i} className="chip">
              {tag}
              <button onClick={() => onRemoveTag(i)}>
                <X size={10} />
              </button>
            </span>
          ))}
          {!showAddTag ? (
            <button className="chip chip-add" onClick={() => setShowAddTag(true)}>
              <Plus size={12} /> Ajouter
            </button>
          ) : (
            <div className="add-tag-inline">
              <input
                type="text"
                value={newTagValue}
                onChange={(e) => setNewTagValue(e.target.value)}
                placeholder="Nouveau tag..."
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleAddTag();
                  if (e.key === 'Escape') {
                    setShowAddTag(false);
                    setNewTagValue('');
                  }
                }}
                autoFocus
              />
              <button onClick={handleAddTag}>OK</button>
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}
