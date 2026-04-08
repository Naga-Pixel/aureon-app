import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

interface LeadsState {
  // Filters
  statusFilter: string | null;
  islandFilter: string | null;
  searchQuery: string;

  // UI state
  scrollPosition: number;
  selectedLeadId: string | null;
  expandedLeadIds: string[];

  // Actions
  setStatusFilter: (status: string | null) => void;
  setIslandFilter: (island: string | null) => void;
  setSearchQuery: (query: string) => void;
  setScrollPosition: (position: number) => void;
  setSelectedLeadId: (id: string | null) => void;
  toggleExpandedLead: (id: string) => void;
  reset: () => void;
}

const initialState = {
  statusFilter: null,
  islandFilter: null,
  searchQuery: '',
  scrollPosition: 0,
  selectedLeadId: null,
  expandedLeadIds: [],
};

export const useLeadsStore = create<LeadsState>()(
  persist(
    (set) => ({
      ...initialState,

      setStatusFilter: (status) => set({ statusFilter: status }),
      setIslandFilter: (island) => set({ islandFilter: island }),
      setSearchQuery: (query) => set({ searchQuery: query }),
      setScrollPosition: (position) => set({ scrollPosition: position }),
      setSelectedLeadId: (id) => set({ selectedLeadId: id }),
      toggleExpandedLead: (id) => set((state) => ({
        expandedLeadIds: state.expandedLeadIds.includes(id)
          ? state.expandedLeadIds.filter(leadId => leadId !== id)
          : [...state.expandedLeadIds, id]
      })),
      reset: () => set(initialState),
    }),
    {
      name: 'leads-store',
      storage: createJSONStorage(() => sessionStorage),
    }
  )
);
