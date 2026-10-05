import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import AdmZip from 'adm-zip';
import { randomUUID } from 'crypto';
import { createReadStream, promises as fs } from 'fs';
import { extname, join, normalize, resolve, sep } from 'path';
import { PrismaService } from '../prisma/prisma.service';

export interface UploadedFile {
  originalname: string;
  mimetype: string;
  size: number;
  /** Temporary path multer wrote the upload to. */
  path: string;
}

/** Directory uploads live in; relative paths are resolved from the API's working directory. */
export const uploadDir = () => resolve(process.env.UPLOAD_DIR ?? './uploads');
export const uploadMaxBytes = () => Number(process.env.UPLOAD_MAX_MB ?? 200) * 1024 * 1024;

const SAFE_EXT = /^[a-z0-9]{1,8}$/;

/** Picks the launch page of a SCORM 1.2 / 2004 package from its manifest. */
export function scormLaunchPath(manifest: string): string | null {
  // Prefer the resource referenced by the first <item>, else the first resource with an href.
  const identifierref = /<item\b[^>]*identifierref="([^"]+)"/i.exec(manifest)?.[1];
  if (identifierref) {
    const re = new RegExp(`<resource\\b[^>]*identifier="${identifierref.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"[^>]*href="([^"]+)"`, 'i');
    const href = re.exec(manifest)?.[1];
    if (href) return href;
  }
  return /<resource\b[^>]*href="([^"]+)"/i.exec(manifest)?.[1] ?? null;
}

/**
 * Local-disk file storage for lesson material. Files are served back through the
 * API so the URL carries the token; extracted SCORM packages are public under an
 * unguessable id because the package's own pages load their assets by relative path.
 */
@Injectable()
export class UploadsService {
  private readonly logger = new Logger(UploadsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async store(schoolId: string, userId: string | null, file: UploadedFile) {
    const id = randomUUID();
    const ext = extname(file.originalname).slice(1).toLowerCase();
    const rel = join('files', SAFE_EXT.test(ext) ? `${id}.${ext}` : id);
    await fs.mkdir(join(uploadDir(), 'files'), { recursive: true });
    await fs.rename(file.path, join(uploadDir(), rel));
    return this.prisma.storedFile.create({
      data: { schoolId, uploadedById: userId, name: file.originalname, mimeType: file.mimetype || 'application/octet-stream', size: file.size, path: rel },
    });
  }

  /** Unpacks a SCORM zip next to the other uploads and remembers its launch page. */
  async storeScorm(schoolId: string, userId: string | null, file: UploadedFile) {
    let zip: AdmZip;
    try {
      zip = new AdmZip(file.path);
    } catch {
      throw new BadRequestException('Tệp không phải gói SCORM (.zip)');
    }
    const entries = zip.getEntries();
    const manifestEntry = entries.find((e) => /(^|\/)imsmanifest\.xml$/i.test(e.entryName));
    if (!manifestEntry) throw new BadRequestException('Gói SCORM thiếu imsmanifest.xml');
    // The manifest may sit in a sub-folder when the zip wraps the package in a directory.
    const prefix = manifestEntry.entryName.slice(0, -'imsmanifest.xml'.length);
    const launch = scormLaunchPath(manifestEntry.getData().toString('utf8'));
    if (!launch) throw new BadRequestException('Không tìm thấy trang khởi chạy trong imsmanifest.xml');

    const id = randomUUID();
    const rel = join('scorm', id);
    const target = join(uploadDir(), rel);
    await fs.mkdir(target, { recursive: true });
    for (const e of entries) {
      if (e.isDirectory || !e.entryName.startsWith(prefix)) continue;
      const name = normalize(e.entryName.slice(prefix.length));
      // Zip slip: an entry may not escape the package directory.
      if (name.startsWith('..') || name.includes(`..${sep}`) || resolve(target, name) !== join(target, name)) continue;
      const out = join(target, name);
      await fs.mkdir(resolve(out, '..'), { recursive: true });
      await fs.writeFile(out, e.getData());
    }
    await fs.unlink(file.path).catch(() => undefined);
    return this.prisma.storedFile.create({
      data: { schoolId, uploadedById: userId, name: file.originalname, mimeType: 'application/zip', size: file.size, path: rel, launchPath: launch.split('?')[0] },
    });
  }

  async get(schoolId: string, id: string) {
    const f = await this.prisma.storedFile.findFirst({ where: { id, schoolId } });
    if (!f) throw new NotFoundException('Không tìm thấy tệp');
    return f;
  }

  /** Any file by id (no school check): used for public SCORM assets whose id is the secret. */
  async getPublic(id: string) {
    const f = await this.prisma.storedFile.findUnique({ where: { id } });
    if (!f) throw new NotFoundException('Không tìm thấy tệp');
    return f;
  }

  absolutePath(file: { path: string }, inner?: string) {
    const base = join(uploadDir(), file.path);
    if (!inner) return base;
    const full = resolve(base, normalize(inner));
    if (!full.startsWith(base + sep)) throw new NotFoundException('Không tìm thấy tệp');
    return full;
  }

  stream(file: { path: string }, inner?: string) {
    return createReadStream(this.absolutePath(file, inner));
  }

  async remove(schoolId: string, id: string) {
    const f = await this.get(schoolId, id);
    await this.prisma.storedFile.delete({ where: { id: f.id } });
    await fs.rm(join(uploadDir(), f.path), { recursive: true, force: true }).catch((e) => this.logger.warn(`Không xóa được ${f.path}: ${e}`));
    return { ok: true };
  }
}
