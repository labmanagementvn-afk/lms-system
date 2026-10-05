import { AppstoreOutlined, FileTextOutlined, FormOutlined, LinkOutlined, PlayCircleOutlined, ReadOutlined, VideoCameraOutlined } from '@ant-design/icons';
import { ReactNode } from 'react';

const ICONS: Record<string, { icon: ReactNode; color: string }> = {
  VIDEO: { icon: <VideoCameraOutlined />, color: '#dc2626' },
  DOCUMENT: { icon: <FileTextOutlined />, color: '#2563eb' },
  SCORM: { icon: <PlayCircleOutlined />, color: '#7c3aed' },
  H5P: { icon: <AppstoreOutlined />, color: '#0891b2' },
  TEXT: { icon: <ReadOutlined />, color: '#059669' },
  LINK: { icon: <LinkOutlined />, color: '#d97706' },
  QUIZ: { icon: <FormOutlined />, color: '#db2777' },
};

/** Coloured icon for a lesson type; defaults to the text icon for anything unknown. */
export function LessonTypeIcon({ type, size = 16 }: { type: string; size?: number }) {
  const i = ICONS[type] ?? ICONS.TEXT;
  return <span style={{ color: i.color, fontSize: size, lineHeight: 1 }}>{i.icon}</span>;
}
