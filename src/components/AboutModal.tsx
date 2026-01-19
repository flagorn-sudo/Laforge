import { useEffect, useState } from 'react';
import { getVersion } from '@tauri-apps/api/app';
import { Modal } from './ui';

interface AboutModalProps {
  onClose: () => void;
}

export function AboutModal({ onClose }: AboutModalProps) {
  const [version, setVersion] = useState('');

  useEffect(() => {
    getVersion().then(setVersion);
  }, []);

  const currentYear = new Date().getFullYear();

  return (
    <Modal title="" onClose={onClose} className="about-modal">
      <div className="about-content">
        <img src="/forge-icon.png" alt="La Forge" className="about-icon" />
        <h1>La Forge</h1>
        <p className="about-version">Version {version}</p>
        <p className="about-description">
          Application de gestion de projets web
        </p>
        <div className="about-copyright">
          <p>Développé par <strong>Fix DESVILLES</strong></p>
          <p>
            <a href="https://getaninja.fr" target="_blank" rel="noopener noreferrer">Get A Ninja</a>
            {' · '}
            <a href="mailto:fix@getaninja.fr">fix@getaninja.fr</a>
          </p>
          <p className="about-legal">© {currentYear} Tous droits réservés.</p>
        </div>
      </div>
    </Modal>
  );
}
