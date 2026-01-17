import { useState } from 'react';
import { Wand2, Loader, ClipboardPaste, Check } from 'lucide-react';
import { ParsedFTPCredentials } from '../types';
import { geminiService } from '../services/geminiService';
import { Modal, Button } from './ui';

interface SmartPasteProps {
  apiKey: string;
  onCredentialsParsed: (credentials: ParsedFTPCredentials) => void;
  onClose: () => void;
}

export function SmartPaste({ apiKey, onCredentialsParsed, onClose }: SmartPasteProps) {
  const [text, setText] = useState('');
  const [parsing, setParsing] = useState(false);
  const [parsed, setParsed] = useState<ParsedFTPCredentials | null>(null);
  const [error, setError] = useState('');

  const handleParse = async () => {
    if (!text.trim()) return;

    setParsing(true);
    setError('');
    setParsed(null);

    try {
      const credentials = await geminiService.parseFTPCredentials(text, apiKey);
      setParsed(credentials);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur lors du parsing');
    }

    setParsing(false);
  };

  const handleUse = () => {
    if (parsed) {
      onCredentialsParsed(parsed);
    }
  };

  return (
    <Modal
      title="Smart Paste FTP"
      onClose={onClose}
      footer={
        parsed ? (
          <>
            <Button variant="secondary" onClick={() => setParsed(null)}>
              Recommencer
            </Button>
            <Button onClick={handleUse}>
              <Check size={16} />
              Utiliser ces identifiants
            </Button>
          </>
        ) : (
          <>
            <Button variant="secondary" onClick={onClose}>
              Annuler
            </Button>
            <Button onClick={handleParse} disabled={!text.trim() || parsing}>
              {parsing ? <Loader className="spinner" size={16} /> : <Wand2 size={16} />}
              {parsing ? 'Analyse...' : 'Analyser'}
            </Button>
          </>
        )
      }
    >
      <div style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <ClipboardPaste size={18} style={{ color: 'var(--accent-blue)' }} />
          <span style={{ color: 'var(--text-secondary)', fontSize: 14 }}>
            Collez un email ou texte contenant des identifiants FTP
          </span>
        </div>
        <p style={{ color: 'var(--text-secondary)', fontSize: 12 }}>
          L'IA va extraire automatiquement les informations de connexion.
        </p>
      </div>

      {!parsed ? (
        <textarea
          className="form-input"
          style={{ minHeight: 200, resize: 'vertical', fontFamily: 'monospace', fontSize: 13 }}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={`Exemple:
Voici vos accès FTP :
Serveur: ftp.example.com
Utilisateur: user123
Mot de passe: secret456
Port: 21`}
          autoFocus
        />
      ) : (
        <div
          style={{
            background: 'var(--bg-tertiary)',
            borderRadius: 'var(--radius-md)',
            padding: 16,
          }}
        >
          <h4 style={{ marginBottom: 12, color: 'var(--success)' }}>
            Identifiants détectés
          </h4>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {parsed.host && (
              <div className="info-row">
                <strong>Hôte:</strong>
                <code style={{ color: 'var(--accent-blue)' }}>{parsed.host}</code>
              </div>
            )}
            {parsed.username && (
              <div className="info-row">
                <strong>Utilisateur:</strong>
                <code style={{ color: 'var(--accent-blue)' }}>{parsed.username}</code>
              </div>
            )}
            {parsed.password && (
              <div className="info-row">
                <strong>Mot de passe:</strong>
                <code style={{ color: 'var(--accent-blue)' }}>{'•'.repeat(parsed.password.length)}</code>
              </div>
            )}
            {parsed.port && (
              <div className="info-row">
                <strong>Port:</strong>
                <code style={{ color: 'var(--accent-blue)' }}>{parsed.port}</code>
              </div>
            )}
            {parsed.path && (
              <div className="info-row">
                <strong>Chemin:</strong>
                <code style={{ color: 'var(--accent-blue)' }}>{parsed.path}</code>
              </div>
            )}
            {parsed.testUrl && (
              <div className="info-row">
                <strong>URL de test:</strong>
                <code style={{ color: 'var(--accent-blue)' }}>{parsed.testUrl}</code>
              </div>
            )}
          </div>
        </div>
      )}

      {error && (
        <div
          style={{
            marginTop: 16,
            padding: 12,
            borderRadius: 'var(--radius-md)',
            background: 'rgba(232, 76, 76, 0.1)',
            color: 'var(--error)',
            fontSize: 14,
          }}
        >
          {error}
        </div>
      )}

      {!apiKey && (
        <div
          style={{
            marginTop: 16,
            padding: 12,
            borderRadius: 'var(--radius-md)',
            background: 'rgba(255, 183, 77, 0.1)',
            color: 'var(--warning)',
            fontSize: 14,
          }}
        >
          Configurez votre clé API Gemini dans les paramètres pour utiliser cette fonctionnalité.
        </div>
      )}
    </Modal>
  );
}
