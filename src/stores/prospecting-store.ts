import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { BBoxBounds, BuildingResult, ProspectFiltersType, AssessmentType, GrantCategory } from '@/components/map';

interface ProspectingState {
  // Map state
  bounds: BBoxBounds | null;
  mapCenter: { lat: number; lon: number } | null;
  mapZoom: number | null;

  // Search results
  buildings: BuildingResult[];
  selectedBuildingId: string | null;

  // Filters
  lastFilters: ProspectFiltersType | null;
  assessmentType: AssessmentType;
  grantCategory: GrantCategory;

  // UI state
  scrollPosition: number;
  expandedSections: string[];

  // Actions
  setBounds: (bounds: BBoxBounds | null) => void;
  setMapView: (center: { lat: number; lon: number }, zoom: number) => void;
  setBuildings: (buildings: BuildingResult[]) => void;
  setSelectedBuildingId: (id: string | null) => void;
  setLastFilters: (filters: ProspectFiltersType | null) => void;
  setAssessmentType: (type: AssessmentType) => void;
  setGrantCategory: (category: GrantCategory) => void;
  setScrollPosition: (position: number) => void;
  toggleSection: (sectionId: string) => void;
  reset: () => void;
}

const initialState = {
  bounds: null,
  mapCenter: null,
  mapZoom: null,
  buildings: [],
  selectedBuildingId: null,
  lastFilters: null,
  assessmentType: 'solar' as AssessmentType,
  grantCategory: 'residential' as GrantCategory,
  scrollPosition: 0,
  expandedSections: [],
};

export const useProspectingStore = create<ProspectingState>()(
  persist(
    (set) => ({
      ...initialState,

      setBounds: (bounds) => set({ bounds }),
      setMapView: (center, zoom) => set({ mapCenter: center, mapZoom: zoom }),
      setBuildings: (buildings) => set({ buildings }),
      setSelectedBuildingId: (id) => set({ selectedBuildingId: id }),
      setLastFilters: (filters) => set({ lastFilters: filters }),
      setAssessmentType: (type) => set({ assessmentType: type }),
      setGrantCategory: (category) => set({ grantCategory: category }),
      setScrollPosition: (position) => set({ scrollPosition: position }),
      toggleSection: (sectionId) => set((state) => ({
        expandedSections: state.expandedSections.includes(sectionId)
          ? state.expandedSections.filter(id => id !== sectionId)
          : [...state.expandedSections, sectionId]
      })),
      reset: () => set(initialState),
    }),
    {
      name: 'prospecting-store',
      storage: createJSONStorage(() => sessionStorage),
    }
  )
);
