import React, { createContext, useContext, useState, useCallback, useRef } from 'react';
import BottomSheet from '@gorhom/bottom-sheet';

import { prefetchImages } from '@/lib/images';

type ProfileSheetContextType = {
  openProfileSheet: (profile: any) => void;
  closeProfileSheet: () => void;
  /** Vide la fiche 320 ms plus tard (fin de l'animation de fermeture). */
  scheduleProfileSheetClose: () => void;
  /** Enrichit la fiche deja ouverte (fetch asynchrone) sans la re-ouvrir. */
  updateProfileSheet: (profile: any) => void;
  /** Vrai tant qu'une ouverture explicite n'a pas ete traitee par l'effet
   *  de ProfileBottomSheet (le snap est fait APRES le rendu du contenu). */
  openRequest: boolean;
  ackOpenRequest: () => void;
  selectedProfile: any | null;
  sheetRef: React.RefObject<BottomSheet | null>;
};

const ProfileSheetContext = createContext<ProfileSheetContextType | undefined>(undefined);

export function ProfileSheetProvider({ children }: { children: React.ReactNode }) {
  const [selectedProfile, setSelectedProfile] = useState<any | null>(null);
  const [openRequest, setOpenRequest] = useState(false);
  const sheetRef = useRef<BottomSheet>(null);
  // Timer de fermeture differee : annule si l'utilisateur rouvre la fiche
  // avant la fin de l'animation (sinon le clear vidait la nouvelle fiche).
  const clearTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancelPendingClear = useCallback(() => {
    if (clearTimer.current) {
      clearTimeout(clearTimer.current);
      clearTimer.current = null;
    }
  }, []);

  const openProfileSheet = useCallback(
    (profile: any) => {
      // Precharge les photos AVANT l'ouverture : le carrousel s'affiche sans flash gris
      if (profile?.photos?.length) prefetchImages(profile.photos);
      cancelPendingClear();
      console.log('[Sheet] ouverture demandee :', profile?.first_name ?? '?');
      setSelectedProfile(profile);
      // L'expand n'est plus fait ici : un appel impératif immediat partait
      // avant le rendu du contenu (ou sur une ref null, silencieusement).
      setOpenRequest(true);
    },
    [cancelPendingClear]
  );

  const ackOpenRequest = useCallback(() => setOpenRequest(false), []);

  const scheduleProfileSheetClose = useCallback(() => {
    if (clearTimer.current) clearTimeout(clearTimer.current);
    clearTimer.current = setTimeout(() => {
      clearTimer.current = null;
      setSelectedProfile(null);
    }, 320);
  }, []);

  const closeProfileSheet = useCallback(() => {
    sheetRef.current?.close();
    scheduleProfileSheetClose();
  }, [scheduleProfileSheetClose]);

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
        scheduleProfileSheetClose,
        updateProfileSheet,
        openRequest,
        ackOpenRequest,
        selectedProfile,
        sheetRef 
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
