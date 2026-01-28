/**
 * Time Tracker Component
 * Displays timer and controls for time tracking
 */

import { useState, useEffect, useCallback } from 'react';
import { Play, Square, Pause, Clock, DollarSign, Calendar, ChevronDown, X, Plus, History } from 'lucide-react';
import { useTimeStore, formatDuration, formatDurationShort, calculateBillableForProject } from '../stores/timeStore';
import { ProjectBilling, GlobalBillingSettings, BillingUnit, BILLING_UNIT_CONFIG } from '../types';
import { Button } from './ui';
import './TimeTracker.css';

// Default global billing for fallback
const DEFAULT_GLOBAL_BILLING: GlobalBillingSettings = {
  defaultRate: 75,
  defaultUnit: 'hour' as BillingUnit,
  defaultCurrency: 'EUR' as const,
};

interface TimeTrackerProps {
  projectId: string;
  projectName: string;
  compact?: boolean;
  projectBilling?: ProjectBilling;
  globalBilling?: GlobalBillingSettings;
  onOpenHistory?: () => void;
}

export function TimeTracker({
  projectId,
  projectName: _projectName,
  compact = false,
  projectBilling,
  globalBilling = DEFAULT_GLOBAL_BILLING,
  onOpenHistory,
}: TimeTrackerProps) {
  void _projectName; // Reserved for future use (e.g., session labels)
  const {
    activeSessions,
    startSession,
    stopSession,
    pauseSession,
    resumeSession,
    getProjectStats,
    getTodayTotal,
    getWeekTotal,
  } = useTimeStore();

  const [elapsed, setElapsed] = useState(0);
  const [showDetails, setShowDetails] = useState(false);

  // Find active session for this project
  const activeSession = activeSessions.find(s => s.projectId === projectId) || null;
  const isActive = activeSession !== null;
  const isPaused = activeSession?.isPaused ?? false;

  // Update elapsed time every second when active and not paused
  useEffect(() => {
    if (!isActive || !activeSession) {
      setElapsed(0);
      return;
    }

    const updateElapsed = () => {
      if (activeSession.isPaused) {
        // When paused, show accumulated time
        setElapsed(activeSession.accumulatedTime);
      } else {
        // When running, show accumulated + current running time
        const startTime = new Date(activeSession.startTime).getTime();
        const runningTime = Math.floor((Date.now() - startTime) / 1000);
        setElapsed(activeSession.accumulatedTime + runningTime);
      }
    };

    updateElapsed();
    const interval = setInterval(updateElapsed, 1000);

    return () => clearInterval(interval);
  }, [isActive, activeSession, activeSession?.isPaused, activeSession?.accumulatedTime, activeSession?.startTime]);

  const handleStart = useCallback(() => {
    startSession(projectId);
  }, [projectId, startSession]);

  const handleStop = useCallback(() => {
    stopSession(projectId);
  }, [projectId, stopSession]);

  const handlePause = useCallback(() => {
    pauseSession(projectId);
  }, [projectId, pauseSession]);

  const handleResume = useCallback(() => {
    resumeSession(projectId);
  }, [projectId, resumeSession]);

  const stats = getProjectStats(projectId);
  const todayTotal = getTodayTotal(projectId);
  const weekTotal = getWeekTotal(projectId);

  // Calculate totals including active session
  const totalSeconds = stats.totalSeconds + (isActive ? elapsed : 0);

  // Calculate billing with project-specific settings (cascade: project > global > fallback)
  const billingInfo = calculateBillableForProject(
    totalSeconds,
    projectBilling,
    globalBilling.defaultRate,
    globalBilling.defaultUnit
  );
  const effectiveRate = projectBilling?.hourlyRate ?? globalBilling.defaultRate;
  const effectiveUnit = projectBilling?.billingUnit ?? globalBilling.defaultUnit;
  const billingUnitLabel = BILLING_UNIT_CONFIG[effectiveUnit].label;
  const currency = projectBilling?.currency ?? 'EUR';

  if (compact) {
    return (
      <div className={`time-tracker-compact ${isActive ? 'active' : ''} ${isPaused ? 'paused' : ''}`}>
        {isActive ? (
          <div className="timer-toggle-group">
            <button
              className={`timer-toggle active ${isPaused ? 'paused' : ''}`}
              onClick={isPaused ? handleResume : handlePause}
              title={isPaused ? 'Reprendre le timer' : 'Mettre en pause'}
            >
              {isPaused ? (
                <>
                  <Play size={12} />
                  <span className="timer-value paused">{formatDuration(elapsed)}</span>
                </>
              ) : (
                <>
                  <Pause size={12} className="icon-pause" />
                  <span className="timer-value">{formatDuration(elapsed)}</span>
                </>
              )}
            </button>
            <button
              className="timer-stop-btn"
              onClick={handleStop}
              title="Arreter le timer"
            >
              <Square size={12} />
            </button>
          </div>
        ) : (
          <button
            className="timer-toggle"
            onClick={handleStart}
            title="Demarrer le timer"
          >
            <Play size={12} />
            <span className="timer-label">Timer</span>
          </button>
        )}
      </div>
    );
  }

  return (
    <div className={`time-tracker ${isActive ? 'active' : ''} ${isPaused ? 'paused' : ''}`}>
      <div className="time-tracker-header">
        <div className="header-left">
          <Clock size={16} />
          <span className="header-title">Temps de travail</span>
          {isPaused && <span className="paused-badge">En pause</span>}
        </div>
        <button
          className="details-toggle"
          onClick={() => setShowDetails(!showDetails)}
        >
          <ChevronDown size={14} className={showDetails ? 'rotated' : ''} />
        </button>
      </div>

      <div className="time-tracker-main">
        <div className="timer-display">
          <span className={`timer-value ${isActive ? (isPaused ? 'paused' : 'running') : ''}`}>
            {formatDuration(isActive ? elapsed : 0)}
          </span>
          <div className="timer-billing-live">
            <span className="billing-amount">{billingInfo.amount.toFixed(2)}{currency === 'EUR' ? '€' : currency}</span>
            <span className="billing-detail">({billingInfo.billedUnits} {billingInfo.unitLabel})</span>
          </div>
        </div>

        <div className="timer-controls">
          {isActive ? (
            <div className="timer-buttons">
              {isPaused ? (
                <Button
                  variant="success"
                  onClick={handleResume}
                >
                  <Play size={16} />
                  Reprendre
                </Button>
              ) : (
                <Button
                  variant="secondary"
                  onClick={handlePause}
                  className="btn-pause"
                >
                  <Pause size={16} />
                  Pause
                </Button>
              )}
              <Button
                variant="danger"
                onClick={handleStop}
              >
                <Square size={16} />
                Stopper
              </Button>
            </div>
          ) : (
            <Button
              variant="success"
              onClick={handleStart}
            >
              <Play size={16} />
              Demarrer
            </Button>
          )}
        </div>
      </div>

      <div className="time-tracker-stats">
        <div className="stat-item">
          <span className="stat-value">{formatDurationShort(todayTotal + (isActive ? elapsed : 0))}</span>
          <span className="stat-label">Aujourd'hui</span>
        </div>
        <div className="stat-item">
          <span className="stat-value">{formatDurationShort(weekTotal + (isActive ? elapsed : 0))}</span>
          <span className="stat-label">Cette semaine</span>
        </div>
        <div className="stat-item">
          <span className="stat-value">{formatDurationShort(totalSeconds)}</span>
          <span className="stat-label">Total projet</span>
        </div>
      </div>

      {onOpenHistory && (
        <button className="time-tracker-history-btn" onClick={onOpenHistory}>
          <History size={14} />
          <span>Historique & Ajouter du temps</span>
        </button>
      )}

      {showDetails && (
        <div className="time-tracker-details">
          <div className="details-row">
            <DollarSign size={14} />
            <span>Tarif:</span>
            <span className="rate-value">
              {effectiveRate}€/{effectiveUnit === 'hour' ? 'h' : effectiveUnit === 'half_day' ? '½j' : 'j'}
            </span>
          </div>
          <div className="details-row">
            <Calendar size={14} />
            <span>Mode:</span>
            <span>{billingUnitLabel}</span>
          </div>
          <div className="details-row highlight">
            <DollarSign size={14} />
            <span>Facture:</span>
            <span className="billable-value">
              {billingInfo.billedUnits.toFixed(2)} {billingInfo.unitLabel} = {billingInfo.amount.toFixed(2)}{currency === 'EUR' ? '€' : currency}
            </span>
          </div>
          <div className="details-row">
            <Clock size={14} />
            <span>Sessions:</span>
            <span>{stats.sessionsCount}</span>
          </div>
        </div>
      )}
    </div>
  );
}

// Mini version for header
export function TimeTrackerMini({ projectId }: { projectId: string }) {
  const { activeSessions, startSession, stopSession, pauseSession, resumeSession } = useTimeStore();
  const [elapsed, setElapsed] = useState(0);

  const activeSession = activeSessions.find(s => s.projectId === projectId) || null;
  const isActive = activeSession !== null;
  const isPaused = activeSession?.isPaused ?? false;

  useEffect(() => {
    if (!isActive || !activeSession) {
      setElapsed(0);
      return;
    }

    const updateElapsed = () => {
      if (activeSession.isPaused) {
        setElapsed(activeSession.accumulatedTime);
      } else {
        const startTime = new Date(activeSession.startTime).getTime();
        const runningTime = Math.floor((Date.now() - startTime) / 1000);
        setElapsed(activeSession.accumulatedTime + runningTime);
      }
    };

    updateElapsed();
    const interval = setInterval(updateElapsed, 1000);
    return () => clearInterval(interval);
  }, [isActive, activeSession, activeSession?.isPaused, activeSession?.accumulatedTime, activeSession?.startTime]);

  const handleClick = () => {
    if (isActive) {
      if (isPaused) {
        resumeSession(projectId);
      } else {
        pauseSession(projectId);
      }
    } else {
      startSession(projectId);
    }
  };

  return (
    <div className={`time-tracker-mini-container ${isActive ? 'active' : ''} ${isPaused ? 'paused' : ''}`}>
      <button
        className={`time-tracker-mini ${isActive ? 'active' : ''} ${isPaused ? 'paused' : ''}`}
        onClick={handleClick}
        title={isActive ? (isPaused ? 'Reprendre' : 'Pause') : 'Demarrer le timer'}
      >
        {isActive ? (
          <>
            {!isPaused && <div className="pulse-indicator" />}
            <span className={`mini-timer ${isPaused ? 'paused' : ''}`}>{formatDuration(elapsed)}</span>
            {isPaused ? <Play size={12} /> : <Pause size={12} />}
          </>
        ) : (
          <>
            <Clock size={14} />
            <Play size={12} />
          </>
        )}
      </button>
      {isActive && (
        <button
          className="mini-stop-btn"
          onClick={() => stopSession(projectId)}
          title="Arreter le timer"
        >
          <Square size={10} />
        </button>
      )}
    </div>
  );
}

// Session history panel
interface TimeSessionsPanelProps {
  projectId: string;
  onClose: () => void;
  projectBilling?: ProjectBilling;
  globalBilling?: GlobalBillingSettings;
}

export function TimeSessionsPanel({
  projectId,
  onClose,
  projectBilling,
  globalBilling = DEFAULT_GLOBAL_BILLING,
}: TimeSessionsPanelProps) {
  const { sessions, deleteSession, addManualSession, getProjectStats } = useTimeStore();
  const [showAddForm, setShowAddForm] = useState(false);
  const [manualHours, setManualHours] = useState('');
  const [manualMinutes, setManualMinutes] = useState('');
  const [manualNotes, setManualNotes] = useState('');

  const projectSessions = sessions
    .filter((s) => s.projectId === projectId)
    .sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime());

  const stats = getProjectStats(projectId);
  const billingInfo = calculateBillableForProject(
    stats.totalSeconds,
    projectBilling,
    globalBilling.defaultRate,
    globalBilling.defaultUnit
  );
  const effectiveRate = projectBilling?.hourlyRate ?? globalBilling.defaultRate;
  const effectiveUnit = projectBilling?.billingUnit ?? globalBilling.defaultUnit;
  const rateUnitLabel = effectiveUnit === 'hour' ? '€/h' : effectiveUnit === 'half_day' ? '€/½j' : '€/j';

  const handleAddManualTime = () => {
    const hours = parseInt(manualHours) || 0;
    const minutes = parseInt(manualMinutes) || 0;

    if (hours === 0 && minutes === 0) return;

    addManualSession(projectId, hours, minutes, manualNotes || undefined);
    setManualHours('');
    setManualMinutes('');
    setManualNotes('');
    setShowAddForm(false);
  };

  const formatSessionDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('fr-FR', {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div className="time-sessions-panel">
      <div className="panel-header">
        <h3>Historique du temps</h3>
        <button className="btn-close" onClick={onClose}>
          <X size={18} />
        </button>
      </div>

      <div className="panel-summary">
        <div className="summary-item">
          <span className="summary-label">Temps total</span>
          <span className="summary-value">{formatDurationShort(stats.totalSeconds)}</span>
        </div>
        <div className="summary-item">
          <span className="summary-label">Sessions</span>
          <span className="summary-value">{stats.sessionsCount}</span>
        </div>
        <div className="summary-item rate">
          <span className="summary-label">Tarif</span>
          <span className="summary-value">{effectiveRate}{rateUnitLabel}</span>
        </div>
        <div className="summary-item total">
          <span className="summary-label">Facturable</span>
          <span className="summary-value">
            {billingInfo.billedUnits.toFixed(2)} {billingInfo.unitLabel} = {billingInfo.amount.toFixed(2)}€
          </span>
        </div>
      </div>

      {/* Add manual time form */}
      <div className="add-manual-time">
        {showAddForm ? (
          <div className="manual-time-form">
            <div className="manual-time-inputs">
              <div className="time-input-group">
                <input
                  type="number"
                  min="0"
                  max="99"
                  value={manualHours}
                  onChange={(e) => setManualHours(e.target.value)}
                  placeholder="0"
                />
                <span>h</span>
              </div>
              <div className="time-input-group">
                <input
                  type="number"
                  min="0"
                  max="59"
                  value={manualMinutes}
                  onChange={(e) => setManualMinutes(e.target.value)}
                  placeholder="0"
                />
                <span>min</span>
              </div>
              <div className="manual-amount-preview">
                {(() => {
                  const hours = parseInt(manualHours) || 0;
                  const minutes = parseInt(manualMinutes) || 0;
                  const totalSeconds = (hours * 3600) + (minutes * 60);
                  if (totalSeconds === 0) return null;
                  const preview = calculateBillableForProject(
                    totalSeconds,
                    projectBilling,
                    globalBilling.defaultRate,
                    globalBilling.defaultUnit
                  );
                  return <span className="amount-preview">+{preview.amount.toFixed(2)}€</span>;
                })()}
              </div>
            </div>
            <input
              type="text"
              className="manual-notes-input"
              value={manualNotes}
              onChange={(e) => setManualNotes(e.target.value)}
              placeholder="Note (optionnel)"
              onKeyDown={(e) => e.key === 'Enter' && handleAddManualTime()}
            />
            <div className="manual-time-actions">
              <button className="btn-cancel" onClick={() => setShowAddForm(false)}>
                Annuler
              </button>
              <button
                className="btn-add"
                onClick={handleAddManualTime}
                disabled={!manualHours && !manualMinutes}
              >
                Ajouter
              </button>
            </div>
          </div>
        ) : (
          <button className="btn-add-time" onClick={() => setShowAddForm(true)}>
            <Plus size={14} />
            Ajouter du temps manuellement
          </button>
        )}
      </div>

      <div className="sessions-list">
        {projectSessions.length === 0 ? (
          <div className="empty-sessions">
            <Clock size={24} />
            <p>Aucune session enregistree</p>
          </div>
        ) : (
          projectSessions.map((session) => (
            <div key={session.id} className="session-item">
              <div className="session-info">
                <span className="session-date">{formatSessionDate(session.startTime)}</span>
                <span className="session-duration">{formatDuration(session.duration)}</span>
              </div>
              {session.notes && <span className="session-notes">{session.notes}</span>}
              <button
                className="btn-delete"
                onClick={() => deleteSession(session.id)}
                title="Supprimer"
              >
                <X size={14} />
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export default TimeTracker;
