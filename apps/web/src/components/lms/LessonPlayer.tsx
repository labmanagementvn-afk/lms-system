'use client';

import { DownloadOutlined, FormOutlined, LinkOutlined } from '@ant-design/icons';
import { Alert, Button, Typography } from 'antd';
import Link from 'next/link';
import { fileUrl } from '@/lib/api';
import { paragraphs, youtubeEmbed } from './format';
import { ScormData, ScormFrame } from './ScormFrame';

export interface PlayableLesson {
  id: string;
  type: string;
  title: string;
  content: string | null;
  url: string | null;
  testId: string | null;
  file: { id: string; name: string; mimeType: string; size: number; launchPath: string | null } | null;
  test: { id: string; title: string } | null;
}

const frame = (src: string, title: string) => <iframe src={src} title={title} style={{ width: '100%', height: '70vh', border: '1px solid #e5e7eb', borderRadius: 8, background: '#fff' }} allow="autoplay; fullscreen" allowFullScreen />;

/** Renders one lesson by type: video, document, SCORM, text, link / H5P or a quiz entry button. */
export function LessonPlayer({ lesson, student, scormData, onScormCommit }: { lesson: PlayableLesson; student: { code: string; fullName: string }; scormData?: ScormData | null; onScormCommit: (data: ScormData, completed: boolean) => void }) {
  const embed = youtubeEmbed(lesson.url);
  switch (lesson.type) {
    case 'VIDEO':
      if (lesson.file) return <video controls src={fileUrl(lesson.file.id)} style={{ width: '100%', maxHeight: '70vh', background: '#000', borderRadius: 8 }} />;
      if (embed) return <div style={{ aspectRatio: '16 / 9' }}>{frame(embed, lesson.title)}</div>;
      return external(lesson.url, 'Mở video');
    case 'DOCUMENT':
      if (lesson.file?.mimeType === 'application/pdf') return frame(fileUrl(lesson.file.id), lesson.title);
      if (lesson.file)
        return (
          <Button type="primary" icon={<DownloadOutlined />} href={fileUrl(lesson.file.id)} target="_blank">
            Tải tài liệu: {lesson.file.name}
          </Button>
        );
      return external(lesson.url, 'Mở tài liệu');
    case 'SCORM':
      if (!lesson.file?.launchPath) return <Alert type="warning" message="Gói SCORM chưa sẵn sàng" />;
      return <ScormFrame file={{ id: lesson.file.id, launchPath: lesson.file.launchPath }} student={student} initialData={scormData} onCommit={onScormCommit} />;
    case 'TEXT':
      return (
        <div style={{ fontSize: 16, lineHeight: 1.75 }}>
          {paragraphs(lesson.content).map((p, i) => (
            <Typography.Paragraph key={i}>{p}</Typography.Paragraph>
          ))}
        </div>
      );
    case 'LINK':
    case 'H5P':
      return (
        <div style={{ display: 'grid', gap: 8 }}>
          {embed ? <div style={{ aspectRatio: '16 / 9' }}>{frame(embed, lesson.title)}</div> : lesson.url ? frame(lesson.url, lesson.title) : null}
          {external(lesson.url, 'Mở trong cửa sổ mới nếu nội dung không hiển thị')}
        </div>
      );
    case 'QUIZ':
      return (
        <div style={{ textAlign: 'center', padding: '32px 0' }}>
          <Typography.Paragraph>Bài kiểm tra: {lesson.test?.title ?? ''}</Typography.Paragraph>
          {lesson.testId ? (
            <Link href={`/student/tests/${lesson.testId}`}>
              <Button type="primary" size="large" icon={<FormOutlined />}>
                Làm bài kiểm tra
              </Button>
            </Link>
          ) : (
            <Alert type="warning" message="Bài kiểm tra chưa được gắn" />
          )}
        </div>
      );
    default:
      return <Alert type="warning" message="Loại bài học chưa được hỗ trợ" />;
  }
}

function external(url: string | null, label: string) {
  if (!url) return <Alert type="warning" message="Bài học chưa có nội dung" />;
  return (
    <Button icon={<LinkOutlined />} href={url} target="_blank" rel="noopener">
      {label}
    </Button>
  );
}
