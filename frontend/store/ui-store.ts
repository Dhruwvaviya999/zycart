import { create } from 'zustand';

interface UiState {
  searchOpen: boolean;
  mobileNavOpen: boolean;
  announcementDismissed: boolean;
  setSearchOpen: (open: boolean) => void;
  setMobileNavOpen: (open: boolean) => void;
  dismissAnnouncement: () => void;
}

export const useUiStore = create<UiState>((set) => ({
  searchOpen: false,
  mobileNavOpen: false,
  announcementDismissed: false,
  setSearchOpen: (searchOpen) => set({ searchOpen }),
  setMobileNavOpen: (mobileNavOpen) => set({ mobileNavOpen }),
  dismissAnnouncement: () => set({ announcementDismissed: true }),
}));
