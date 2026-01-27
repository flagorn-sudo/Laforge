import { useState } from 'react';
import { DollarSign, Clock, Sun, Calendar, RefreshCw, Loader } from 'lucide-react';
import { BillingUnit, GlobalBillingSettings, Project } from '../../../types';
import { projectService } from '../../../services/projectService';

interface BillingSectionProps {
  billing: GlobalBillingSettings;
  onBillingChange: (billing: Partial<GlobalBillingSettings>) => void;
  projects?: Project[];
  onProjectsRefresh?: () => void;
  onNotification?: (type: 'success' | 'error' | 'info' | 'warning', message: string) => void;
}

const UNIT_CONFIG: Record<BillingUnit, { label: string; shortLabel: string; icon: typeof Clock; description: string }> = {
  minute: { label: 'Minute', shortLabel: 'min', icon: Clock, description: 'Facturation a la minute' },
  hour: { label: 'Heure', shortLabel: 'h', icon: Clock, description: '1 heure de travail' },
  half_day: { label: 'Demi-journee', shortLabel: '½ jour', icon: Sun, description: '4 heures de travail' },
  day: { label: 'Journee', shortLabel: 'jour', icon: Calendar, description: '8 heures de travail' },
};

const UNIT_MULTIPLIERS: Record<BillingUnit, number> = {
  minute: 60,
  hour: 3600,
  half_day: 14400,
  day: 28800,
};

function calculateEquivalences(rate: number, unit: BillingUnit): { hourly: number; halfDay: number; daily: number } {
  const ratePerSecond = rate / UNIT_MULTIPLIERS[unit];
  return {
    hourly: ratePerSecond * 3600,
    halfDay: ratePerSecond * 14400,
    daily: ratePerSecond * 28800,
  };
}

export function BillingSection({
  billing,
  onBillingChange,
  projects = [],
  onProjectsRefresh,
  onNotification,
}: BillingSectionProps) {
  const { defaultRate, defaultUnit } = billing;
  const equivalences = calculateEquivalences(defaultRate, defaultUnit);
  const [applyingToAll, setApplyingToAll] = useState(false);

  const handleRateChange = (value: string) => {
    const numValue = parseFloat(value);
    if (!isNaN(numValue) && numValue >= 0) {
      onBillingChange({ defaultRate: numValue });
    }
  };

  const handleUnitChange = (unit: BillingUnit) => {
    onBillingChange({ defaultUnit: unit });
  };

  const handleApplyToAllProjects = async () => {
    if (applyingToAll || projects.length === 0) return;

    setApplyingToAll(true);
    try {
      let updatedCount = 0;
      for (const project of projects) {
        const updated: Project = {
          ...project,
          billing: {
            hourlyRate: defaultRate,
            billingUnit: defaultUnit,
            minimumBillableMinutes: project.billing?.minimumBillableMinutes,
            currency: 'EUR',
          },
          updated: new Date().toISOString(),
        };
        await projectService.saveProject(updated);
        updatedCount++;
      }

      onNotification?.('success', `Taux applique a ${updatedCount} projet${updatedCount > 1 ? 's' : ''}`);
      onProjectsRefresh?.();
    } catch (error) {
      console.error('Failed to apply rate to all projects:', error);
      onNotification?.('error', 'Erreur lors de l\'application du taux');
    } finally {
      setApplyingToAll(false);
    }
  };

  const getEquivalenceText = () => {
    const parts: string[] = [];
    if (defaultUnit !== 'hour') {
      parts.push(`${equivalences.hourly.toFixed(2)}€/h`);
    }
    if (defaultUnit !== 'half_day') {
      parts.push(`${equivalences.halfDay.toFixed(2)}€/½j`);
    }
    if (defaultUnit !== 'day') {
      parts.push(`${equivalences.daily.toFixed(2)}€/j`);
    }
    return parts.join('  •  ');
  };

  return (
    <div className="billing-section-full">
      {/* Rate Input */}
      <div className="billing-rate-section">
        <label className="billing-label">Taux par defaut</label>
        <div className="billing-rate-input">
          <input
            type="number"
            value={defaultRate}
            onChange={(e) => handleRateChange(e.target.value)}
            min="0"
            step="5"
            className="billing-rate-field"
          />
          <span className="billing-currency">€</span>
        </div>
      </div>

      {/* Unit Selection - Big buttons */}
      <div className="billing-unit-section">
        <label className="billing-label">Unite de facturation</label>
        <div className="billing-unit-grid">
          {(['hour', 'half_day', 'day'] as BillingUnit[]).map((unit) => {
            const config = UNIT_CONFIG[unit];
            const Icon = config.icon;
            const isSelected = defaultUnit === unit;

            return (
              <button
                key={unit}
                onClick={() => handleUnitChange(unit)}
                className={`billing-unit-btn ${isSelected ? 'selected' : ''}`}
              >
                <Icon size={24} />
                <span className="unit-label">{config.label}</span>
                <span className="unit-desc">{config.description}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Equivalences */}
      {defaultRate > 0 && (
        <div className="billing-equivalences">
          <DollarSign size={14} />
          <span>Equivalences: {getEquivalenceText()}</span>
        </div>
      )}

      {/* Example Calculation */}
      <div className="billing-example">
        <div className="example-title">Exemple de calcul</div>
        <div className="example-rows">
          {defaultUnit === 'day' && (
            <>
              <div className="example-row">
                <span>4h de travail</span>
                <span className="example-amount">{(defaultRate * 0.5).toFixed(2)}€</span>
              </div>
              <div className="example-row">
                <span>8h (1 journee)</span>
                <span className="example-amount">{defaultRate.toFixed(2)}€</span>
              </div>
            </>
          )}
          {defaultUnit === 'half_day' && (
            <>
              <div className="example-row">
                <span>2h de travail</span>
                <span className="example-amount">{(defaultRate * 0.5).toFixed(2)}€</span>
              </div>
              <div className="example-row">
                <span>4h (1 demi-journee)</span>
                <span className="example-amount">{defaultRate.toFixed(2)}€</span>
              </div>
            </>
          )}
          {defaultUnit === 'hour' && (
            <>
              <div className="example-row">
                <span>30 min de travail</span>
                <span className="example-amount">{(defaultRate * 0.5).toFixed(2)}€</span>
              </div>
              <div className="example-row">
                <span>1h de travail</span>
                <span className="example-amount">{defaultRate.toFixed(2)}€</span>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Apply to all projects button */}
      <div className="billing-actions">
        <button
          className="billing-apply-all-btn"
          onClick={handleApplyToAllProjects}
          disabled={applyingToAll || projects.length === 0}
        >
          {applyingToAll ? (
            <Loader size={16} className="spinner" />
          ) : (
            <RefreshCw size={16} />
          )}
          <span>Reappliquer a tous les projets</span>
          {!applyingToAll && projects.length > 0 && (
            <span className="project-count">({projects.length})</span>
          )}
        </button>
        <p className="billing-hint">
          Remplace le taux personnalise de tous les projets par le taux global actuel.
        </p>
      </div>
    </div>
  );
}
