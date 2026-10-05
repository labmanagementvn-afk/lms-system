import { BadRequestException, Controller, Delete, Get, NotFoundException, Param, Post, Res, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { promises as fs } from 'fs';
import { diskStorage } from 'multer';
import { join } from 'path';
import { AuthUser } from '../common/auth-user';
import { AllowQueryToken, AnyRole, CurrentUser, Public } from '../common/decorators';
import { UploadedFile as Upload, UploadsService, uploadDir, uploadMaxBytes } from './uploads.service';

const multerOptions = () => ({
  storage: diskStorage({
    destination: (_req, _file, cb) => {
      const tmp = join(uploadDir(), 'tmp');
      fs.mkdir(tmp, { recursive: true }).then(
        () => cb(null, tmp),
        (e: Error) => cb(e, tmp),
      );
    },
  }),
  limits: { fileSize: uploadMaxBytes() },
});

const fileBody = { schema: { type: 'object', properties: { file: { type: 'string', format: 'binary' } } } };

@ApiTags('uploads')
@ApiBearerAuth()
@Controller('uploads')
export class UploadsController {
  constructor(private readonly service: UploadsService) {}

  @Post()
  @ApiOperation({ summary: 'Upload a lesson file (video, document, image)' })
  @ApiConsumes('multipart/form-data')
  @ApiBody(fileBody)
  @UseInterceptors(FileInterceptor('file', multerOptions()))
  upload(@CurrentUser() user: AuthUser, @UploadedFile() file?: Upload) {
    if (!file) throw new BadRequestException('Chưa chọn tệp');
    return this.service.store(user.schoolId, user.userId, file);
  }

  @Post('scorm')
  @ApiOperation({ summary: 'Upload and unpack a SCORM package (.zip)' })
  @ApiConsumes('multipart/form-data')
  @ApiBody(fileBody)
  @UseInterceptors(FileInterceptor('file', multerOptions()))
  uploadScorm(@CurrentUser() user: AuthUser, @UploadedFile() file?: Upload) {
    if (!file) throw new BadRequestException('Chưa chọn tệp');
    return this.service.storeScorm(user.schoolId, user.userId, file);
  }

  /** Pages and assets inside an extracted SCORM package; the package id is the only secret. */
  @Get('scorm/:id/*path')
  @Public()
  async scormAsset(@Param('id') id: string, @Param('path') path: string | string[], @Res() res: Response) {
    const file = await this.service.getPublic(id);
    if (!file.launchPath) throw new NotFoundException('Không tìm thấy tệp');
    const inner = Array.isArray(path) ? path.join('/') : path;
    const full = this.service.absolutePath(file, inner);
    await fs.access(full).catch(() => {
      throw new NotFoundException('Không tìm thấy tệp');
    });
    res.sendFile(full);
  }

  @Get(':id')
  @AnyRole()
  @AllowQueryToken()
  @ApiOperation({ summary: 'Download / stream a file; accepts ?access_token= for <video> and <iframe>' })
  async download(@CurrentUser() user: AuthUser, @Param('id') id: string, @Res() res: Response) {
    const file = await this.service.get(user.schoolId, id);
    if (file.launchPath) throw new NotFoundException('Gói SCORM được mở qua trang khởi chạy');
    res.setHeader('Content-Type', file.mimeType);
    res.setHeader('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(file.name)}`);
    res.sendFile(this.service.absolutePath(file));
  }

  @Delete(':id')
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.remove(user.schoolId, id);
  }
}
