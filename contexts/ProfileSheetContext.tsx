import React, { createContext, useContext, useState, useCallback } from 'react';

import { prefetchImages } from '@/lib/images';

type ProfileSheetContextType = {
  /** Ouvre (ou remplace) la fiche profil. */
  openProfileSheet: (profile: any) => void;
  /** Ferme la fiche. Si `closingProfile` est fourni, il ne ferme que si la
   *  fiche affiche toujours ce profil (protection si on rouvre pendant
   *  l'animation de fermeture). */
  closeProfileSheet: (closingProfile?: any) => void;
  /** Enrichit la fiche deja ouverte (fetch asynchrone) sans la re-ouvrir. */
  updateProfileSheet: (profile: any) => void;
  selectedProfile: any | null;
};

const ProfileSheetContext = createContext<ProfileSheetContextType | undefined>(undefined);

export function ProfileSheetProvider({ children }: { children: React.ReactNode }) {
  const [selectedProfile, setSelectedProfile] = useState<any | null>(null);

  const openProfileSheet = useCallback((profile: any) => {
    // Precharge les photos AVANT l'ouverture : le carrousel s'affiche sans flash gris
    if (profile?.photos?.length) prefetchImages(profile.photos);
    setSelectedProfile(profile);
  }, []);

  const closeProfileSheet = useCallback((closingProfile?: any) => {
    setSelectedProfile((current: any | null) => {
      if (closingProfile !== undefined && current !== closingProfile) {
        return current; // rouvert entre-temps : on ne ferme pas
      }
      return null;
    });
  }, []);

  const updateProfileSheet = useCallback((profile: any) => {
    // N'ecrit que si une fiche est ouverte : si l'utilisateur l'a fermee
    // pendant le fetch, on ne la rouvre pas par accident.
    setSelectedProfile((prev: any | null) => (prev ? profile : prev));
  }, []);

  return (
    <ProfileSheetContext.Provider 
      value={{ 
        openProfileSheet, 
        closeProfileSheet, 
        updateProfileSheet,
        selectedProfile,
      }}
    >
      {children}
    </ProfileSheetContext.Provider>
  );
}

export function useProfileSheet() {
  const context = useContext(ProfileSheetContext);
  if (context === undefined) {
    throw new Error('useProfileSheet must be used within a ProfileSheetProvider');
  }
  return context;
}
