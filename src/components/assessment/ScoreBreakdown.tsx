'use client';

import { getScoreColor, getScoreLabel, ASSESSMENT_CONFIG } from '@/lib/config/assessment-config';

interface ScoreBreakdownProps {
  totalScore: number;
  solarPotentialScore: number;
  economicPotentialScore: number;
  executionSimplicityScore: number;
  segmentFitScore: number;
}

export function ScoreBreakdown({
  totalScore,
  solarPotentialScore,
  economicPotentialScore,
  executionSimplicityScore,
  segmentFitScore,
}: ScoreBreakdownProps) {
  const scoreColor = getScoreColor(totalScore);
  const scoreLabel = getScoreLabel(totalScore);

  const categories = [
    {
      label: 'Potencial Solar',
      score: solarPotentialScore,
      maxScore: ASSESSMENT_CONFIG.SCORE_WEIGHTS.SOLAR_POTENTIAL,
    },
    {
      label: 'Potencial Económico',
      score: economicPotentialScore,
      maxScore: ASSESSMENT_CONFIG.SCORE_WEIGHTS.ECONOMIC_POTENTIAL,
    },
    {
      label: 'Simplicidad Ejecución',
      score: executionSimplicityScore,
      maxScore: ASSESSMENT_CONFIG.SCORE_WEIGHTS.EXECUTION_SIMPLICITY,
    },
    {
      label: 'Ajuste Segmento',
      score: segmentFitScore,
      maxScore: ASSESSMENT_CONFIG.SCORE_WEIGHTS.SEGMENT_FIT,
    },
  ];

  // Calculate stroke dasharray for circular progress
  const circumference = 2 * Math.PI * 45; // radius = 45
  const strokeDasharray = `${(totalScore / 100) * circumference} ${circumference}`;

  return (
    <div className="space-y-6">
      {/* Circular Score Gauge */}
      <div className="flex flex-col items-center">
        <div className="relative w-32 h-32">
          <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
            {/* Background circle */}
            <circle
              cx="50"
              cy="50"
              r="45"
              fill="none"
              stroke="#e5e7eb"
              strokeWidth="8"
            />
            {/* Progress circle */}
            <circle
              cx="50"
              cy="50"
              r="45"
              fill="none"
              stroke={scoreColor}
              strokeWidth="8"
              strokeLinecap="round"
              strokeDasharray={strokeDasharray}
              className="transition-all duration-500"
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-3xl font-bold text-[#222f30]">{totalScore}</span>
            <span className="text-xs text-[#445e5f]">/ 100</span>
          </div>
        </div>
        <div
          className="mt-2 px-3 py-1 rounded-full text-sm font-medium text-white"
          style={{ backgroundColor: scoreColor }}
        >
          {scoreLabel}
        </div>
      </div>

      {/* Category Bars */}
      <div className="space-y-3">
        {categories.map((category) => {
          const percentage = (category.score / category.maxScore) * 100;
          return (
            <div key={category.label}>
              <div className="flex justify-between text-sm mb-1">
                <span className="text-[#445e5f]">{category.label}</span>
                <span className="font-medium text-[#222f30]">
                  {category.score}/{category.maxScore}
                </span>
              </div>
              <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{
                    width: `${percentage}%`,
                    backgroundColor: getScoreColor(percentage),
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
