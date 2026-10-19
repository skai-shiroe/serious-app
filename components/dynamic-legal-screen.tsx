import React, { useEffect, useState } from 'react';
import LegalScreen, { type LegalSection } from '@/components/legal-screen';
import { watchAppSetting } from '@/lib/app-settings';

export default function DynamicLegalScreen({ settingKey, ...props }: {
  settingKey: 'terms' | 'privacy';
  title: string;
  updatedAt: string;
  sections: LegalSection[];
}) {
  const [sections, setSections] = useState(props.sections);
  useEffect(() => {
    return watchAppSetting<Record<string, LegalSection[]>>('legal_content', {}, (content) => {
      const remote = content?.[settingKey];
      setSections(Array.isArray(remote) && remote.length ? remote : props.sections);
    });
  }, [settingKey, props.sections]);
  return <LegalScreen {...props} sections={sections} />;
}
