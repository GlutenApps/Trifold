import { create } from 'zustand';

/** Left rail sections, in order (DESIGN.md §9). */
export const SECTIONS = [
  { id: 'campaign', label: 'Campaign' },
  { id: 'compendium', label: 'Compendium' },
  { id: 'encounters', label: 'Encounters' },
  { id: 'presenter', label: 'Presenter' },
  { id: 'music', label: 'Music' },
  { id: 'dice', label: 'Dice' },
  { id: 'settings', label: 'Settings' },
] as const;

export type SectionId = (typeof SECTIONS)[number]['id'];

interface UiState {
  section: SectionId;
  setSection(section: SectionId): void;
}

export const useUiStore = create<UiState>((set) => ({
  section: 'campaign',
  setSection: (section) => set({ section }),
}));
