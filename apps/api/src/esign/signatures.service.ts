import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { SignatureProfile, SignatureProvider } from '@prisma/client';
import { AuthUser } from '../common/auth-user';
import { PrismaService } from '../prisma/prisma.service';
import { SignatureProfileDto } from './esign.dto';
import { PROVIDER_LABEL, SIGNATURE_PROVIDERS, SignatureAdapter } from './signature-provider';

/** Each signer's remote signing account (VNPT SmartCA or Viettel MySign) and the certificate it holds. */
@Injectable()
export class SignaturesService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(SIGNATURE_PROVIDERS) private readonly adapters: Map<SignatureProvider, SignatureAdapter>,
  ) {}

  /** The providers this system can sign with, and whether each is the sandbox. */
  providers() {
    return [...this.adapters.values()].map((a) => ({ provider: a.provider, label: PROVIDER_LABEL[a.provider], name: a.name, sandbox: a.name.startsWith('mock') }));
  }

  adapter(provider: SignatureProvider): SignatureAdapter {
    const a = this.adapters.get(provider);
    if (!a) throw new BadRequestException(`Chưa cấu hình nhà cung cấp ký số ${PROVIDER_LABEL[provider]}`);
    return a;
  }

  async mine(user: AuthUser) {
    const profile = await this.prisma.signatureProfile.findUnique({ where: { userId: user.userId } });
    return { profile: profile ? this.format(profile) : null, providers: this.providers() };
  }

  /** Looks up the account's certificate with the provider and keeps it as the signer's profile. */
  async save(user: AuthUser, dto: SignatureProfileDto) {
    const adapter = this.adapter(dto.provider);
    const me = await this.prisma.user.findUniqueOrThrow({ where: { id: user.userId }, select: { fullName: true } });
    let cert;
    try {
      cert = await adapter.certificate(dto.account.trim(), me.fullName);
    } catch (e) {
      throw new BadRequestException((e as Error).message);
    }
    const data = { provider: dto.provider, account: dto.account.trim(), certSerial: cert.serial, certSubject: cert.subject, certIssuer: cert.issuer, certValidFrom: cert.validFrom, certValidTo: cert.validTo };
    const profile = await this.prisma.signatureProfile.upsert({ where: { userId: user.userId }, create: { userId: user.userId, schoolId: user.schoolId, ...data }, update: data });
    return { profile: this.format(profile), providers: this.providers() };
  }

  async remove(user: AuthUser) {
    const { count } = await this.prisma.signatureProfile.deleteMany({ where: { userId: user.userId } });
    if (!count) throw new NotFoundException('Bạn chưa khai báo tài khoản ký số');
    return { ok: true };
  }

  /** The caller's profile, ready to sign now; refuses a missing or expired certificate. */
  async signerOf(user: AuthUser) {
    const profile = await this.prisma.signatureProfile.findUnique({ where: { userId: user.userId } });
    if (!profile) throw new BadRequestException('Bạn chưa khai báo tài khoản ký số (Tài khoản › Chữ ký số)');
    const now = new Date();
    if (now < profile.certValidFrom || now > profile.certValidTo) throw new BadRequestException('Chứng thư số của bạn đã hết hạn hoặc chưa có hiệu lực');
    return { profile, adapter: this.adapter(profile.provider) };
  }

  private format(p: SignatureProfile) {
    const now = new Date();
    return { ...p, providerLabel: PROVIDER_LABEL[p.provider], valid: now >= p.certValidFrom && now <= p.certValidTo };
  }
}
