// Remote signing (ký số từ xa) through VNPT SmartCA or Viettel MySign, behind an adapter.
// Only the sandbox exists: the real services need a contract and the signer's approval in their app.
import { Logger } from '@nestjs/common';
import { SignatureProvider as Provider } from '@prisma/client';
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'crypto';

export const SIGNATURE_PROVIDERS = Symbol('SIGNATURE_PROVIDERS');

export const PROVIDER_LABEL: Record<Provider, string> = { VNPT_SMARTCA: 'VNPT SmartCA', VIETTEL_MYSIGN: 'Viettel MySign' };

export interface Certificate {
  serial: string;
  subject: string;
  issuer: string;
  validFrom: Date;
  validTo: Date;
}

export interface SignRequest {
  /** What the provider knows the signer by: CCCD number or phone. */
  account: string;
  certificate: Certificate;
  /** SHA-256 (hex) of what is signed. */
  digest: string;
  /** Shown to the signer when they confirm, e.g. "Học bạ số: Nguyễn Văn An, 2026-2027". */
  description: string;
}

export interface SignResult {
  transactionId: string;
  /** Base64. */
  signature: string;
  signedAt: Date;
}

export interface SignatureAdapter {
  readonly provider: Provider;
  readonly name: string;
  /** The certificate of the account; throws when it has none. */
  certificate(account: string, holderName: string): Promise<Certificate>;
  /** Signs a digest with the account's key; the real services wait for the signer to confirm in their app. */
  sign(request: SignRequest): Promise<SignResult>;
  verify(digest: string, signature: string, certificate: { serial: string }): Promise<boolean>;
}

const SANDBOX_KEY = 'lms-esign-sandbox';
const ISSUER: Record<Provider, string> = {
  VNPT_SMARTCA: 'CN=VNPT SmartCA RSA (thử nghiệm), O=VNPT Group, C=VN',
  VIETTEL_MYSIGN: 'CN=Viettel-CA SHA-256 (thử nghiệm), O=Viettel Group, C=VN',
};

/**
 * Sandbox signing: a certificate derived from the account, valid from 1 January of
 * this year for three years, and an HMAC as the signature. An account containing
 * "mock-nocert" has no certificate; one containing "mock-fail" refuses to confirm.
 */
export class MockSignatureAdapter implements SignatureAdapter {
  private readonly logger = new Logger('MockSignature');
  readonly name: string;

  constructor(readonly provider: Provider) {
    this.name = provider === 'VNPT_SMARTCA' ? 'mock-smartca' : 'mock-mysign';
  }

  async certificate(account: string, holderName: string): Promise<Certificate> {
    if (account.includes('mock-nocert')) throw new Error(`Tài khoản ${account} chưa được cấp chứng thư số ${PROVIDER_LABEL[this.provider]}`);
    const year = new Date().getUTCFullYear();
    const uid = /^\d{12}$/.test(account) ? `CCCD:${account}` : account;
    return {
      serial: createHash('sha256').update(`${this.provider}:${account}`).digest('hex').slice(0, 32).toUpperCase(),
      subject: `CN=${holderName}, UID=${uid}, C=VN`,
      issuer: ISSUER[this.provider],
      validFrom: new Date(Date.UTC(year, 0, 1)),
      validTo: new Date(Date.UTC(year + 3, 0, 1)),
    };
  }

  async sign(request: SignRequest): Promise<SignResult> {
    if (request.account.includes('mock-fail')) throw new Error('Người ký đã từ chối xác nhận trên ứng dụng ký số');
    this.logger.debug(`${this.name} signs ${request.description}`);
    return { transactionId: `${this.name}-${randomBytes(6).toString('hex')}`, signature: this.mac(request.digest, request.certificate.serial), signedAt: new Date() };
  }

  async verify(digest: string, signature: string, certificate: { serial: string }): Promise<boolean> {
    const expected = Buffer.from(this.mac(digest, certificate.serial), 'base64');
    const given = Buffer.from(signature, 'base64');
    return expected.length === given.length && timingSafeEqual(expected, given);
  }

  private mac(digest: string, serial: string) {
    return createHmac('sha256', `${SANDBOX_KEY}:${this.provider}:${serial}`).update(digest).digest('base64');
  }
}

/** One adapter per provider, from ESIGN_PROVIDERS ("VNPT_SMARTCA=mock,VIETTEL_MYSIGN=mock"). */
export function signatureAdaptersFactory(): Map<Provider, SignatureAdapter> {
  const adapters = new Map<Provider, SignatureAdapter>();
  const spec = process.env.ESIGN_PROVIDERS ?? 'VNPT_SMARTCA=mock,VIETTEL_MYSIGN=mock';
  for (const entry of spec.split(',').map((s) => s.trim()).filter(Boolean)) {
    const [provider, impl = 'mock'] = entry.split('=');
    if (!(provider in PROVIDER_LABEL)) throw new Error(`Unknown signature provider "${provider}"`);
    if (impl !== 'mock') throw new Error(`Signature provider "${impl}" for ${provider} is not implemented; see docs/messaging-sync-esign.md`);
    adapters.set(provider as Provider, new MockSignatureAdapter(provider as Provider));
  }
  return adapters;
}
