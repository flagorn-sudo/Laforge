/**
 * Sync Rules Panel Component
 * Configure selective sync with exclusion patterns
 */

import { useState, useEffect } from 'react';
import { Plus, X, Filter, Folder, FileX, AlertCircle, Check, HelpCircle } from 'lucide-react';
import { SyncRules } from '../types';
import { Button, Switch } from './ui';
import './SyncRulesPanel.css';

// Default patterns to exclude
const DEFAULT_EXCLUDE_PATTERNS = [
  '.DS_Store',
  '*.map',
  'node_modules/',
  '.git/',
  '*.log',
  'Thumbs.db',
  '.env',
  '.env.local',
];

// Pattern examples for help
const PATTERN_EXAMPLES = [
  { pattern: '*.log', desc: 'Tous les fichiers .log' },
  { pattern: 'node_modules/', desc: 'Dossier node_modules' },
  { pattern: '*.min.js', desc: 'Fichiers JS minifies' },
  { pattern: 'temp/*', desc: 'Contenu du dossier temp' },
  { pattern: '**/*.bak', desc: 'Fichiers .bak dans tous les sous-dossiers' },
];

interface SyncRulesPanelProps {
  syncRules?: SyncRules;
  localPath: string;
  onChange: (rules: SyncRules) => void;
  onClose?: () => void;
}

export function SyncRulesPanel({
  syncRules,
  localPath,
  onChange,
  onClose,
}: SyncRulesPanelProps) {
  const [enabled, setEnabled] = useState(syncRules?.enabled ?? false);
  const [patterns, setPatterns] = useState<string[]>(
    syncRules?.excludePatterns ?? [...DEFAULT_EXCLUDE_PATTERNS]
  );
  const [newPattern, setNewPattern] = useState('');
  const [showHelp, setShowHelp] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  useEffect(() => {
    setEnabled(syncRules?.enabled ?? false);
    setPatterns(syncRules?.excludePatterns ?? [...DEFAULT_EXCLUDE_PATTERNS]);
  }, [syncRules]);

  const handleToggleEnabled = (value: boolean) => {
    setEnabled(value);
    setHasChanges(true);
  };

  const handleAddPattern = () => {
    const trimmed = newPattern.trim();
    if (!trimmed || patterns.includes(trimmed)) return;

    setPatterns([...patterns, trimmed]);
    setNewPattern('');
    setHasChanges(true);
  };

  const handleRemovePattern = (index: number) => {
    setPatterns(patterns.filter((_, i) => i !== index));
    setHasChanges(true);
  };

  const handleAddDefault = (pattern: string) => {
    if (patterns.includes(pattern)) return;
    setPatterns([...patterns, pattern]);
    setHasChanges(true);
  };

  const handleResetDefaults = () => {
    setPatterns([...DEFAULT_EXCLUDE_PATTERNS]);
    setHasChanges(true);
  };

  const handleSave = () => {
    onChange({
      enabled,
      excludePatterns: patterns,
    });
    setHasChanges(false);
  };

  // Check if a default pattern is already in the list
  const isPatternAdded = (pattern: string) => patterns.includes(pattern);

  return (
    <div className="sync-rules-panel">
      <div className="panel-header">
        <div className="header-title">
          <Filter size={18} />
          <h3>Regles de synchronisation</h3>
        </div>
        {onClose && (
          <button className="btn-close" onClick={onClose}>
            <X size={18} />
          </button>
        )}
      </div>

      <div className="panel-content">
        {/* Enable toggle */}
        <div className="enable-section">
          <div className="enable-row">
            <div className="enable-info">
              <span className="enable-label">Activer le filtrage</span>
              <span className="enable-desc">
                Exclure certains fichiers de la synchronisation
              </span>
            </div>
            <Switch checked={enabled} onChange={handleToggleEnabled} />
          </div>
        </div>

        {/* Local path info */}
        <div className="path-info">
          <Folder size={14} />
          <span>Dossier source:</span>
          <code>{localPath || 'www'}</code>
        </div>

        {/* Patterns section */}
        <div className={`patterns-section ${!enabled ? 'disabled' : ''}`}>
          <div className="section-header">
            <h4>
              <FileX size={16} />
              Patterns d'exclusion ({patterns.length})
            </h4>
            <button
              className="help-toggle"
              onClick={() => setShowHelp(!showHelp)}
              title="Aide sur les patterns"
            >
              <HelpCircle size={16} />
            </button>
          </div>

          {/* Help panel */}
          {showHelp && (
            <div className="help-panel">
              <p>Les patterns suivent la syntaxe gitignore:</p>
              <ul>
                {PATTERN_EXAMPLES.map((ex, i) => (
                  <li key={i}>
                    <code>{ex.pattern}</code>
                    <span>{ex.desc}</span>
                    {!isPatternAdded(ex.pattern) && (
                      <button onClick={() => handleAddDefault(ex.pattern)}>
                        <Plus size={12} />
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Add pattern input */}
          <div className="add-pattern">
            <input
              type="text"
              value={newPattern}
              onChange={(e) => setNewPattern(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAddPattern()}
              placeholder="*.bak, temp/, etc."
              disabled={!enabled}
            />
            <Button
              variant="secondary"
              onClick={handleAddPattern}
              disabled={!enabled || !newPattern.trim()}
            >
              <Plus size={14} />
              Ajouter
            </Button>
          </div>

          {/* Patterns list */}
          <div className="patterns-list">
            {patterns.length === 0 ? (
              <div className="empty-patterns">
                <AlertCircle size={20} />
                <p>Aucun pattern d'exclusion</p>
                <Button
                  variant="ghost"
                  onClick={handleResetDefaults}
                  disabled={!enabled}
                >
                  Ajouter les patterns par defaut
                </Button>
              </div>
            ) : (
              patterns.map((pattern, index) => (
                <div key={index} className="pattern-item">
                  <code>{pattern}</code>
                  <button
                    className="btn-remove"
                    onClick={() => handleRemovePattern(index)}
                    disabled={!enabled}
                    title="Supprimer"
                  >
                    <X size={14} />
                  </button>
                </div>
              ))
            )}
          </div>

          {/* Quick add defaults */}
          {patterns.length > 0 && (
            <div className="quick-add">
              <span>Ajouter:</span>
              {DEFAULT_EXCLUDE_PATTERNS.filter((p) => !patterns.includes(p))
                .slice(0, 4)
                .map((pattern) => (
                  <button
                    key={pattern}
                    className="quick-pattern"
                    onClick={() => handleAddDefault(pattern)}
                    disabled={!enabled}
                  >
                    {pattern}
                  </button>
                ))}
              {patterns.length < DEFAULT_EXCLUDE_PATTERNS.length && (
                <button
                  className="reset-btn"
                  onClick={handleResetDefaults}
                  disabled={!enabled}
                >
                  Reinitialiser
                </button>
              )}
            </div>
          )}
        </div>

        {/* Info box */}
        <div className="info-box">
          <AlertCircle size={14} />
          <p>
            Les fichiers correspondant aux patterns seront ignores lors de la
            synchronisation FTP. Les patterns sont evalues par rapport au dossier
            local configure.
          </p>
        </div>

        {/* Actions */}
        <div className="panel-actions">
          {onClose && (
            <Button variant="secondary" onClick={onClose}>
              Annuler
            </Button>
          )}
          <Button
            variant="primary"
            onClick={handleSave}
            disabled={!hasChanges}
          >
            <Check size={16} />
            Enregistrer
          </Button>
        </div>
      </div>
    </div>
  );
}

// Compact version for inline display
interface SyncRulesCompactProps {
  syncRules?: SyncRules;
  onClick: () => void;
}

export function SyncRulesCompact({ syncRules, onClick }: SyncRulesCompactProps) {
  const isEnabled = syncRules?.enabled ?? false;
  const patternsCount = syncRules?.excludePatterns?.length ?? 0;

  return (
    <button className="sync-rules-compact" onClick={onClick}>
      <Filter size={14} />
      <span className="rules-label">
        {isEnabled ? `${patternsCount} exclusions` : 'Filtrage desactive'}
      </span>
      <span className={`rules-status ${isEnabled ? 'active' : ''}`}>
        {isEnabled ? 'Actif' : 'Inactif'}
      </span>
    </button>
  );
}

export default SyncRulesPanel;
