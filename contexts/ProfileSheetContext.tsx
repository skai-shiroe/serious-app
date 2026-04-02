import React, { createContext, useContext, useState, useCallback, useRef } from 'react';
import BottomSheet from '@gorhom/bottom-sheet';

type ProfileSheetContextType = {
  openProfileSheet: (profile: any) => void;
  closeProfileSheet: () => void;
  selectedProfile: any | null;
  sheetRef: React.RefObject<BottomSheet | null>;
};

const ProfileSheetContext = createContext<ProfileSheetContextType | undefined>(undefined);

export function ProfileSheetProvider({ children }: { children: React.ReactNode }) {
  const [selectedProfile, setSelectedProfile] = useState<any | null>(null);
  const sheetRef = useRef<BottomSheet>(null);

  const openProfileSheet = useCallback((profile: any) => {
    setSelectedProfile(profile);
    sheetRef.current?.expand();
  }, []);

  const closeProfileSheet = useCallback(() => {
    sheetRef.current?.close();
    // On attend la fin de l''animation pour vider le profil
    setTimeout(() => setSelectedProfile(null), 300);
  }, []);

  return (
    <ProfileSheetContext.Provider 
      value={{ 
        openProfileSheet, 
        closeProfileSheet, 
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
