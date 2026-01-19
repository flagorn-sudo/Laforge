/**
 * ScrapingProgress Component
 * Visual progress indicator with steps for the scraping process
 */

import {
  Globe,
  FolderSync,
  FileText,
  Sparkles,
  CheckCircle,
  Loader,
} from 'lucide-react';
import './ScrapingProgress.css';

type ScrapingStage =
  | 'idle'
  | 'scraping'
  | 'organizing'
  | 'generating'
  | 'improving'
  | 'complete'
  | 'error';

interface ScrapingProgressProps {
  stage: ScrapingStage;
  progress: number;
  progressMessage: string;
  showImproving?: boolean; // Whether the improving step is enabled
}

interface Step {
  id: ScrapingStage;
  label: string;
  description: string;
  icon: React.ReactNode;
}

const STEPS: Step[] = [
  {
    id: 'scraping',
    label: 'Scraping',
    description: 'Analyse et telechargement du site',
    icon: <Globe size={18} />,
  },
  {
    id: 'organizing',
    label: 'Organisation',
    description: 'Classement des fichiers',
    icon: <FolderSync size={18} />,
  },
  {
    id: 'generating',
    label: 'Documentation',
    description: 'Generation du rapport',
    icon: <FileText size={18} />,
  },
  {
    id: 'improving',
    label: 'Amelioration',
    description: 'Optimisation avec l\'IA',
    icon: <Sparkles size={18} />,
  },
];

function getStepStatus(
  stepId: ScrapingStage,
  currentStage: ScrapingStage
): 'pending' | 'active' | 'complete' {
  const stageOrder: ScrapingStage[] = ['scraping', 'organizing', 'generating', 'improving', 'complete'];
  const stepIndex = stageOrder.indexOf(stepId);
  const currentIndex = stageOrder.indexOf(currentStage);

  if (currentStage === 'complete') return 'complete';
  if (currentStage === 'error') {
    return stepIndex <= currentIndex ? 'complete' : 'pending';
  }
  if (stepIndex < currentIndex) return 'complete';
  if (stepIndex === currentIndex) return 'active';
  return 'pending';
}

export function ScrapingProgress({
  stage,
  progress,
  progressMessage,
  showImproving = true,
}: ScrapingProgressProps) {
  const displayedSteps = showImproving
    ? STEPS
    : STEPS.filter((s) => s.id !== 'improving');

  const getStepIcon = (step: Step, status: 'pending' | 'active' | 'complete') => {
    if (status === 'complete') {
      return <CheckCircle size={18} />;
    }
    if (status === 'active') {
      return <Loader size={18} className="spinner" />;
    }
    // Use the step's own icon when pending
    return step.icon;
  };

  return (
    <div className="scraping-progress-enhanced">
      {/* Steps indicator */}
      <div className="progress-steps">
        {displayedSteps.map((step, index) => {
          const status = getStepStatus(step.id, stage);
          const isLast = index === displayedSteps.length - 1;

          return (
            <div key={step.id} className="progress-step-wrapper">
              <div className={`progress-step ${status}`}>
                <div className="progress-step-icon">
                  {getStepIcon(step, status)}
                </div>
                <div className="progress-step-content">
                  <span className="progress-step-label">{step.label}</span>
                  <span className="progress-step-description">
                    {status === 'active' ? progressMessage || step.description : step.description}
                  </span>
                </div>
              </div>
              {!isLast && (
                <div className={`progress-step-connector ${status === 'complete' ? 'complete' : ''}`} />
              )}
            </div>
          );
        })}
      </div>

      {/* Progress bar */}
      <div className="progress-bar-container">
        <div className="progress-bar-track">
          <div
            className="progress-bar-fill"
            style={{ width: `${progress}%` }}
          />
        </div>
        <div className="progress-bar-label">
          <span className="progress-bar-percentage">{progress}%</span>
          {stage !== 'complete' && (
            <span className="progress-bar-message">{progressMessage}</span>
          )}
        </div>
      </div>

      {/* Stage-specific info */}
      <div className="progress-stage-info">
        {stage === 'scraping' && (
          <p>Connexion au site et telechargement des pages, images et styles...</p>
        )}
        {stage === 'organizing' && (
          <p>Organisation des fichiers dans les dossiers du projet...</p>
        )}
        {stage === 'generating' && (
          <p>Generation du fichier de documentation Markdown...</p>
        )}
        {stage === 'improving' && (
          <p>Amelioration et optimisation des textes avec Gemini...</p>
        )}
        {stage === 'complete' && (
          <p className="complete">Scraping termine avec succes !</p>
        )}
      </div>
    </div>
  );
}
