/**
 * Time Tracker Component
 * Displays timer and controls for time tracking
 */

import { useState, useEffect, useCallback } from 'react';
import { Play, Square, Clock, DollarSign, Calendar, ChevronDown, X } from 'lucide-react';
import { useTimeStore, formatDuration, formatDurationShort, calculateBillable } from '../stores/timeStore';
import { Button } from './ui';
import './TimeTracker.css';

interface TimeTrackerProps {
  projectId: string;
  projectName: string;
  compact?: boolean;
}

export function TimeTracker({ projectId, projectName: _projectName, compact = false }: TimeTrackerProps) {
  void _projectName; // Reserved for future use (e.g., session labels)
  const {
    activeSession,
    hourlyRate,
    startSession,
    stopSession,
    getProjectStats,
    getTodayTotal,
    getWeekTotal,
  } = useTimeStore();

  const [elapsed, setElapsed] = useState(0);
  const [showDetails, setShowDetails] = useState(false);

  const isActive = activeSession?.projectId === projectId;
  const isOtherProjectActive = activeSession !== null && !isActive;

  // Update elapsed time every second when active
  useEffect(() => {
    if (!isActive || !activeSession) {
      setElapsed(0);
      return;
    }

    const startTime = new Date(activeSession.startTime).getTime();

    const updateElapsed = () => {
      setElapsed(Math.floor((Date.now() - startTime) / 1000));
    };

    updateElapsed();
    const interval = setInterval(updateElapsed, 1000);

    return () => clearInterval(interval);
  }, [isActive, activeSession]);

  const handleStart = useCallback(() => {
    startSession(projectId);
  }, [projectId, startSession]);

  const handleStop = useCallback(() => {
    stopSession();
  }, [stopSession]);

  const stats = getProjectStats(projectId);
  const todayTotal = getTodayTotal(projectId);
  const weekTotal = getWeekTotal(projectId);

  // Calculate totals including active session
  const totalSeconds = stats.totalSeconds + (isActive ? elapsed : 0);
  const billable = calculateBillable(totalSeconds, hourlyRate);

  if (compact) {
    return (
      <div className={`time-tracker-compact ${isActive ? 'active' : ''}`}>
        <button
          className={`timer-toggle ${isActive ? 'active' : ''} ${isOtherProjectActive ? 'disabled' : ''}`}
          onClick={isActive ? handleStop : handleStart}
          disabled={isOtherProjectActive}
          title={isOtherProjectActive ? 'Un autre projet est en cours' : isActive ? 'Arreter le timer' : 'Demarrer le timer'}
        >
          {isActive ? (
            <>
              <Square size={12} className="icon-stop" />
              <span className="timer-value">{formatDuration(elapsed)}</span>
            </>
          ) : (
            <>
              <Play size={12} />
              <span className="timer-label">Timer</span>
            </>
          )}
        </button>
      </div>
    );
  }

  return (
    <div className={`time-tracker ${isActive ? 'active' : ''}`}>
      <div className="time-tracker-header">
        <div className="header-left">
          <Clock size={16} />
          <span className="header-title">Temps de travail</span>
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
          <span className={`timer-value ${isActive ? 'running' : ''}`}>
            {formatDuration(isActive ? elapsed : 0)}
          </span>
          <span className="timer-label">Session actuelle</span>
        </div>

        <div className="timer-controls">
          {isActive ? (
            <Button
              variant="secondary"
              onClick={handleStop}
              className="btn-stop"
            >
              <Square size={16} />
              Stop
            </Button>
          ) : (
            <Button
              variant="primary"
              onClick={handleStart}
              disabled={isOtherProjectActive}
              title={isOtherProjectActive ? 'Un autre projet est en cours' : undefined}
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

      {showDetails && (
        <div className="time-tracker-details">
          <div className="details-row">
            <DollarSign size={14} />
            <span>Tarif horaire:</span>
            <span className="rate-value">{hourlyRate}€/h</span>
          </div>
          <div className="details-row highlight">
            <Calendar size={14} />
            <span>Facturable:</span>
            <span className="billable-value">{billable.toFixed(2)}€</span>
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
  const { activeSession, startSession, stopSession } = useTimeStore();
  const [elapsed, setElapsed] = useState(0);

  const isActive = activeSession?.projectId === projectId;
  const isOtherProjectActive = activeSession !== null && !isActive;

  useEffect(() => {
    if (!isActive || !activeSession) {
      setElapsed(0);
      return;
    }

    const startTime = new Date(activeSession.startTime).getTime();
    const updateElapsed = () => {
      setElapsed(Math.floor((Date.now() - startTime) / 1000));
    };

    updateElapsed();
    const interval = setInterval(updateElapsed, 1000);
    return () => clearInterval(interval);
  }, [isActive, activeSession]);

  return (
    <button
      className={`time-tracker-mini ${isActive ? 'active' : ''} ${isOtherProjectActive ? 'disabled' : ''}`}
      onClick={() => isActive ? stopSession() : startSession(projectId)}
      disabled={isOtherProjectActive}
      title={isOtherProjectActive ? 'Un autre projet est en cours' : isActive ? 'Arreter' : 'Demarrer le timer'}
    >
      {isActive ? (
        <>
          <div className="pulse-indicator" />
          <span className="mini-timer">{formatDuration(elapsed)}</span>
          <Square size={12} />
        </>
      ) : (
        <>
          <Clock size={14} />
          <Play size={12} />
        </>
      )}
    </button>
  );
}

// Session history panel
interface TimeSessionsPanelProps {
  projectId: string;
  onClose: () => void;
}

export function TimeSessionsPanel({ projectId, onClose }: TimeSessionsPanelProps) {
  const { sessions, hourlyRate, setHourlyRate, deleteSession, getProjectStats } = useTimeStore();
  const [editingRate, setEditingRate] = useState(false);
  const [rateValue, setRateValue] = useState(hourlyRate.toString());

  const projectSessions = sessions
    .filter((s) => s.projectId === projectId)
    .sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime());

  const stats = getProjectStats(projectId);
  const billable = calculateBillable(stats.totalSeconds, hourlyRate);

  const handleSaveRate = () => {
    const rate = parseFloat(rateValue);
    if (!isNaN(rate) && rate > 0) {
      setHourlyRate(rate);
    }
    setEditingRate(false);
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
          {editingRate ? (
            <div className="rate-edit">
              <input
                type="number"
                value={rateValue}
                onChange={(e) => setRateValue(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSaveRate()}
                autoFocus
              />
              <button onClick={handleSaveRate}>OK</button>
            </div>
          ) : (
            <button className="rate-button" onClick={() => setEditingRate(true)}>
              {hourlyRate}€/h
            </button>
          )}
        </div>
        <div className="summary-item total">
          <span className="summary-label">Facturable</span>
          <span className="summary-value">{billable.toFixed(2)}€</span>
        </div>
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
