'use client';

import { useState } from 'react';
import { BatteryAssessmentForm } from '@/components/battery/BatteryAssessmentForm';
import { BatteryAssessmentResults } from '@/components/battery/BatteryAssessmentResults';
import { BatteryAssessment } from '@/lib/supabase/types';

export default function BatteryAssessmentPage() {
  const [assessment, setAssessment] = useState<BatteryAssessment | null>(null);

  const handleSuccess = (newAssessment: BatteryAssessment) => {
    setAssessment(newAssessment);
  };

  const handleNewAssessment = () => {
    setAssessment(null);
  };

  return (
    <div className="p-6">
      {/* Header */}
      <div className="mb-6">
        <nav className="text-sm text-[#445e5f] mb-2">
          <span>Panel</span>
          <span className="mx-2">/</span>
          <span className="text-[#222f30]">Evaluación Batería</span>
        </nav>
        <h1 className="text-2xl font-semibold text-[#222f30]">
          Evaluación de Batería Residencial
        </h1>
        <p className="text-[#445e5f] mt-1">
          Evalúa la idoneidad de una vivienda para instalación de batería de respaldo.
        </p>
      </div>

      {/* Content */}
      {assessment ? (
        <BatteryAssessmentResults
          assessment={assessment}
          onNewAssessment={handleNewAssessment}
        />
      ) : (
        <BatteryAssessmentForm onSuccess={handleSuccess} />
      )}
    </div>
  );
}
