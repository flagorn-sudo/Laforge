/**
 * Design Analysis Card
 * Displays extracted colors from the website
 */

import { Palette, Loader, RefreshCw } from 'lucide-react';
import { Card, Button } from '../../../../../components/ui';
import { mergeSimilarColors, isLightColor } from '../../../../../hooks/useColorMerge';

interface DesignAnalysisCardProps {
  colors: string[];
  analyzing: boolean;
  canAnalyze: boolean;
  onAnalyze: () => void;
}

export function DesignAnalysisCard({
  colors,
  analyzing,
  canAnalyze,
  onAnalyze,
}: DesignAnalysisCardProps) {
  // Merge similar colors to reduce palette
  const mergedColors = mergeSimilarColors(colors, 30);

  return (
    <Card
      title="Analyse du design"
      action={
        canAnalyze && (
          <Button
            variant="ghost"
            onClick={onAnalyze}
            disabled={analyzing}
            style={{ padding: '4px 8px', fontSize: 12 }}
          >
            {analyzing ? (
              <Loader size={14} className="spinner" />
            ) : (
              <RefreshCw size={14} />
            )}
            {colors.length > 0 ? 'Réanalyser' : 'Analyser'}
          </Button>
        )
      }
    >
      <div className="design-section">
        <div className="design-colors">
          <Palette size={14} />
          <span>Couleurs:</span>
          {mergedColors.length > 0 ? (
            <div className="color-chips">
              {mergedColors.slice(0, 10).map((color, i) => (
                <span
                  key={i}
                  className="color-chip"
                  style={{ background: color }}
                  title={color}
                >
                  <span
                    style={{
                      color: isLightColor(color) ? '#000' : '#fff',
                      fontSize: 9,
                    }}
                  >
                    {color}
                  </span>
                </span>
              ))}
              {mergedColors.length > 10 && (
                <span className="color-more">+{mergedColors.length - 10}</span>
              )}
            </div>
          ) : (
            <span className="no-colors">Non détectées</span>
          )}
        </div>
      </div>
    </Card>
  );
}
