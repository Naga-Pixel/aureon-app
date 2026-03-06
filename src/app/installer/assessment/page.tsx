'use client';

import { useState } from 'react';
import { AssessmentForm, AssessmentResults } from '@/components/assessment';
import { SolarAssessment } from '@/lib/supabase/types';

export default function AssessmentPage() {
  const [assessment, setAssessment] = useState<SolarAssessment | null>(null);

  const handleSuccess = (newAssessment: SolarAssessment) => {
    setAssessment(newAssessment);
  };

  const handleAssessAnother = () => {
    setAssessment(null);
  };

  return (
    <div className="p-6">
      {/* Header */}
      <div className="mb-6">
        <nav className="text-sm text-[#445e5f] mb-2">
          <span>Panel</span>
          <span className="mx-2">/</span>
          <span className="text-[#222f30]">Evaluación Solar</span>
        </nav>
        <h1 className="text-2xl font-semibold text-[#222f30]">
          Evaluación Solar Comercial
        </h1>
        <p className="text-[#445e5f] mt-1">
          Evalúa el potencial solar de cualquier propiedad comercial y genera un Aureon Commercial Score.
        </p>
      </div>

      {/* Content */}
      {assessment ? (
        <AssessmentResults
          assessment={assessment}
          onAssessAnother={handleAssessAnother}
          showActions={true}
        />
      ) : (
        <AssessmentForm onSuccess={handleSuccess} />
      )}
    </div>
  );
}
