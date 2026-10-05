import { generateDeviceKey, parseDeviceKey, verifyDeviceKey } from './device-keys';

describe('device keys', () => {
  it('round-trips a generated key', () => {
    const { key, prefix, hash } = generateDeviceKey();
    expect(parseDeviceKey(key)).toBe(prefix);
    expect(verifyDeviceKey(key, hash)).toBe(true);
  });

  it('rejects a wrong key', () => {
    const a = generateDeviceKey();
    const b = generateDeviceKey();
    expect(verifyDeviceKey(b.key, a.hash)).toBe(false);
    expect(parseDeviceKey('not-a-key')).toBeNull();
  });
});
