import { useState, useEffect } from 'react';
import { Monitor, Layout } from 'lucide-react';
import { invoke } from '@tauri-apps/api/tauri';
import { Switch } from '../../../components/ui';

interface MacOSSettingsSectionProps {
  showMenuBarIcon: boolean;
  onShowMenuBarIconChange: (show: boolean) => void;
}

export function MacOSSettingsSection({
  showMenuBarIcon,
  onShowMenuBarIconChange,
}: MacOSSettingsSectionProps) {
  const [launchAtStartup, setLaunchAtStartup] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Load current autostart status
    invoke<boolean>('get_autostart_enabled')
      .then(setLaunchAtStartup)
      .catch(() => setLaunchAtStartup(false))
      .finally(() => setLoading(false));
  }, []);

  const handleLaunchAtStartupChange = async (enabled: boolean) => {
    try {
      await invoke('set_autostart_enabled', { enabled });
      setLaunchAtStartup(enabled);
    } catch (error) {
      console.error('Failed to update autostart setting:', error);
    }
  };

  return (
    <div className="settings-section">
      <h3 className="settings-section-title">
        <Monitor size={16} style={{ marginRight: 8 }} />
        Paramètres macOS
      </h3>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginTop: 16 }}>
        <Switch
          checked={launchAtStartup}
          onChange={handleLaunchAtStartupChange}
          label="Lancer La Forge au démarrage de macOS"
          disabled={loading}
        />

        <Switch
          checked={showMenuBarIcon}
          onChange={onShowMenuBarIconChange}
          label="Afficher l'icône dans la barre de menus"
        />

        {showMenuBarIcon && (
          <p className="settings-hint" style={{ marginLeft: 8 }}>
            <Layout size={12} style={{ marginRight: 4 }} />
            L'icône permet d'accéder rapidement à La Forge depuis la barre de menus
          </p>
        )}
      </div>
    </div>
  );
}
