/**
 * Sync Scheduler Component
 * Allows users to configure automatic sync schedules for projects
 */

import React, { useState, useEffect } from 'react';
import {
  useScheduleStore,
  generateCronExpression,
  cronToHumanReadable,
  SCHEDULE_TYPE_OPTIONS,
  DAY_OPTIONS,
} from '../stores/scheduleStore';
import { SyncSchedule, ScheduleType } from '../types';
import './SyncScheduler.css';

interface SyncSchedulerProps {
  projectId: string;
  projectName: string;
  onClose?: () => void;
}

export const SyncScheduler: React.FC<SyncSchedulerProps> = ({
  projectId,
  projectName,
  onClose,
}) => {
  const {
    schedules,
    loading,
    error,
    setSchedule,
    removeSchedule,
    setEnabled,
    clearError,
  } = useScheduleStore();

  const existingSchedule = schedules[projectId];

  const [scheduleType, setScheduleType] = useState<ScheduleType>(
    existingSchedule?.schedule_type || 'daily'
  );
  const [hour, setHour] = useState(9);
  const [minute, setMinute] = useState(0);
  const [dayOfWeek, setDayOfWeek] = useState(1); // Monday
  const [customCron, setCustomCron] = useState('');
  const [enabled, setLocalEnabled] = useState(existingSchedule?.enabled || false);

  useEffect(() => {
    if (existingSchedule) {
      setScheduleType(existingSchedule.schedule_type);
      setLocalEnabled(existingSchedule.enabled);

      // Parse cron to extract values
      if (existingSchedule.cron_expression) {
        const parts = existingSchedule.cron_expression.split(' ');
        if (parts.length === 5) {
          setMinute(parseInt(parts[0]) || 0);
          if (parts[1] !== '*') setHour(parseInt(parts[1]) || 9);
          if (parts[4] !== '*') setDayOfWeek(parseInt(parts[4]) || 1);
        }
        if (existingSchedule.schedule_type === 'custom') {
          setCustomCron(existingSchedule.cron_expression);
        }
      }
    }
  }, [existingSchedule]);

  const getCronExpression = (): string => {
    if (scheduleType === 'custom') {
      return customCron;
    }
    return generateCronExpression(scheduleType, hour, minute, dayOfWeek);
  };

  const handleSave = async () => {
    const cron = getCronExpression();

    const schedule: SyncSchedule = {
      project_id: projectId,
      enabled,
      schedule_type: scheduleType,
      cron_expression: cron,
    };

    try {
      await setSchedule(schedule);
      onClose?.();
    } catch (e) {
      // Error handled by store
    }
  };

  const handleDelete = async () => {
    if (confirm('Supprimer cette planification ?')) {
      await removeSchedule(projectId);
      onClose?.();
    }
  };

  const handleToggleEnabled = async () => {
    if (existingSchedule) {
      await setEnabled(projectId, !enabled);
    }
    setLocalEnabled(!enabled);
  };

  const cronPreview = getCronExpression();

  return (
    <div className="sync-scheduler">
      <div className="scheduler-header">
        <h3>Planification sync automatique</h3>
        <span className="project-name">{projectName}</span>
      </div>

      {error && (
        <div className="error-banner">
          <span>{error}</span>
          <button onClick={clearError}>×</button>
        </div>
      )}

      <div className="scheduler-content">
        <div className="form-group">
          <label className="toggle-label">
            <input
              type="checkbox"
              checked={enabled}
              onChange={handleToggleEnabled}
            />
            <span className="toggle-text">Activer la synchronisation automatique</span>
          </label>
        </div>

        <div className="form-group">
          <label>Fréquence</label>
          <select
            value={scheduleType}
            onChange={(e) => setScheduleType(e.target.value as ScheduleType)}
            disabled={!enabled}
          >
            {SCHEDULE_TYPE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        {scheduleType !== 'custom' && scheduleType !== 'hourly' && (
          <div className="time-picker">
            <div className="form-group">
              <label>Heure</label>
              <select
                value={hour}
                onChange={(e) => setHour(parseInt(e.target.value))}
                disabled={!enabled}
              >
                {Array.from({ length: 24 }, (_, i) => (
                  <option key={i} value={i}>
                    {i.toString().padStart(2, '0')}h
                  </option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label>Minute</label>
              <select
                value={minute}
                onChange={(e) => setMinute(parseInt(e.target.value))}
                disabled={!enabled}
              >
                {[0, 15, 30, 45].map((m) => (
                  <option key={m} value={m}>
                    {m.toString().padStart(2, '0')}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}

        {scheduleType === 'hourly' && (
          <div className="form-group">
            <label>Minute de chaque heure</label>
            <select
              value={minute}
              onChange={(e) => setMinute(parseInt(e.target.value))}
              disabled={!enabled}
            >
              {Array.from({ length: 60 }, (_, i) => (
                <option key={i} value={i}>
                  :{i.toString().padStart(2, '0')}
                </option>
              ))}
            </select>
          </div>
        )}

        {scheduleType === 'weekly' && (
          <div className="form-group">
            <label>Jour de la semaine</label>
            <select
              value={dayOfWeek}
              onChange={(e) => setDayOfWeek(parseInt(e.target.value))}
              disabled={!enabled}
            >
              {DAY_OPTIONS.map((day) => (
                <option key={day.value} value={day.value}>
                  {day.label}
                </option>
              ))}
            </select>
          </div>
        )}

        {scheduleType === 'custom' && (
          <div className="form-group">
            <label>Expression Cron</label>
            <input
              type="text"
              value={customCron}
              onChange={(e) => setCustomCron(e.target.value)}
              placeholder="* * * * *"
              disabled={!enabled}
            />
            <span className="hint">Format: minute heure jour-du-mois mois jour-de-semaine</span>
          </div>
        )}

        {enabled && cronPreview && (
          <div className="schedule-preview">
            <span className="preview-label">Planifié:</span>
            <span className="preview-value">{cronToHumanReadable(cronPreview)}</span>
          </div>
        )}

        {existingSchedule?.next_run && (
          <div className="next-run">
            <span className="next-run-label">Prochaine exécution:</span>
            <span className="next-run-value">
              {new Date(existingSchedule.next_run).toLocaleString('fr-FR')}
            </span>
          </div>
        )}

        {existingSchedule?.last_result && (
          <div className={`last-result ${existingSchedule.last_result.success ? 'success' : 'error'}`}>
            <span className="last-result-label">Dernière sync:</span>
            <span className="last-result-value">
              {existingSchedule.last_result.success
                ? `${existingSchedule.last_result.files_synced} fichiers synchronisés`
                : existingSchedule.last_result.error || 'Échec'}
            </span>
            <span className="last-result-time">
              {new Date(existingSchedule.last_result.timestamp).toLocaleString('fr-FR')}
            </span>
          </div>
        )}
      </div>

      <div className="scheduler-actions">
        {existingSchedule && (
          <button className="btn-danger" onClick={handleDelete} disabled={loading}>
            Supprimer
          </button>
        )}
        <div className="spacer" />
        {onClose && (
          <button className="btn-secondary" onClick={onClose}>
            Annuler
          </button>
        )}
        <button className="btn-primary" onClick={handleSave} disabled={loading}>
          {loading ? 'Enregistrement...' : 'Enregistrer'}
        </button>
      </div>
    </div>
  );
};

export default SyncScheduler;
