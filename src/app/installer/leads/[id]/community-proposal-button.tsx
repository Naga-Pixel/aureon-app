'use client';

import { useState, useEffect } from 'react';
import { downloadCommunityProposalReport, type CommunityProposalData } from '@/lib/services/community-proposal-report';

interface CommunityProposalButtonProps {
  leadId: string;
  leadName: string;
  address?: string | null;
}

interface SolarAssessment {
  system_size_kw: number;
  panels_count: number;
  annual_production_kwh: number;
  annual_savings_eur: number;
  payback_years: number;
  raw_api_response?: {
    installationCost?: number;
    communityEnergy?: {
      selfConsumptionKwh: number;
      surplusKwh: number;
      homesServed: number;
      gridRevenue: number;
      communityRevenue: number;
      extraProfit: number;
      costWithIncentives: number;
      paybackWithIncentives: number;
    };
  };
}

export function CommunityProposalButton({ leadId, leadName, address }: CommunityProposalButtonProps) {
  const [assessment, setAssessment] = useState<SolarAssessment | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    async function fetchAssessment() {
      try {
        const res = await fetch(`/api/assessment/${leadId}`);
        if (res.ok) {
          const data = await res.json();
          if (data.data) {
            setAssessment(data.data);
          }
        }
      } catch (err) {
        console.error('[CommunityProposalButton] Failed to fetch assessment:', err);
      } finally {
        setLoading(false);
      }
    }
    fetchAssessment();
  }, [leadId]);

  const handleClick = () => {
    if (!assessment) return;

    setGenerating(true);

    try {
      const raw = assessment.raw_api_response;
      const community = raw?.communityEnergy;
      const installationCost = raw?.installationCost || assessment.system_size_kw * 1200;

      // Calculate fallback values if communityEnergy not present
      const annualKwh = assessment.annual_production_kwh;
      const selfConsumptionKwh = community?.selfConsumptionKwh ?? annualKwh * 0.3;
      const surplusKwh = community?.surplusKwh ?? annualKwh * 0.7;
      const homesServed = community?.homesServed ?? Math.floor(surplusKwh / 3500);
      const gridRevenue = community?.gridRevenue ?? surplusKwh * 0.05;
      const communityRevenue = community?.communityRevenue ?? surplusKwh * 0.11;
      const extraProfit = community?.extraProfit ?? communityRevenue - gridRevenue;
      const costWithIncentives = community?.costWithIncentives ?? installationCost * 0.6;
      const paybackWithIncentives = community?.paybackWithIncentives ?? Math.min(
        assessment.payback_years * 0.6,
        25
      );

      const data: CommunityProposalData = {
        leadName,
        address: address || undefined,
        systemKwp: assessment.system_size_kw,
        panelCount: assessment.panels_count,
        annualProductionKwh: assessment.annual_production_kwh,
        annualSavingsEur: assessment.annual_savings_eur,
        installationCost,
        paybackYears: assessment.payback_years,
        selfConsumptionKwh,
        surplusKwh,
        homesServed,
        gridRevenue,
        communityRevenue,
        extraProfit,
        costWithIncentives,
        paybackWithIncentives,
      };

      downloadCommunityProposalReport(data);
    } catch (err) {
      console.error('[CommunityProposalButton] PDF generation error:', err);
    } finally {
      setGenerating(false);
    }
  };

  if (loading) {
    return (
      <button
        disabled
        className="flex items-center gap-3 w-full p-3 rounded-xl bg-[#f7f7f5] text-gray-400 cursor-not-allowed"
      >
        <svg className="w-5 h-5 animate-spin" viewBox="0 0 24 24" fill="none">
          <circle
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="2"
            strokeDasharray="32"
            strokeLinecap="round"
          />
        </svg>
        <span>Cargando...</span>
      </button>
    );
  }

  if (!assessment) {
    return null;
  }

  return (
    <button
      onClick={handleClick}
      disabled={generating}
      className="flex items-center gap-3 w-full p-3 rounded-xl bg-[#f7f7f5] hover:bg-amber-100 transition-colors disabled:opacity-50"
    >
      <svg
        className="w-5 h-5 text-amber-500"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={1.5}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"
        />
      </svg>
      <span className="font-medium">
        {generating ? 'Generando...' : 'Propuesta Comunidad'}
      </span>
    </button>
  );
}
