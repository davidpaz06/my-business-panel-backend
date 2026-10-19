import { ipBucket } from './client-ip';

describe('ipBucket', () => {
  it('deja las IPv4 tal cual', () => {
    expect(ipBucket('190.120.5.9')).toBe('190.120.5.9');
  });

  it('normaliza IPv4 mapeada en IPv6', () => {
    expect(ipBucket('::ffff:190.120.5.9')).toBe('190.120.5.9');
  });

  it('agrupa las IPv6 por prefijo /64', () => {
    const a = ipBucket('2001:db8:abcd:12:1111:2222:3333:4444');
    const b = ipBucket('2001:db8:abcd:12:ffff:eeee:dddd:cccc');
    expect(a).toBe(b);
    expect(a).toBe('2001:0db8:abcd:0012::/64');
    expect(ipBucket('2001:db8:abcd:13::1')).not.toBe(a);
  });

  it('expande la forma comprimida', () => {
    expect(ipBucket('2001:db8::1')).toBe('2001:0db8:0000:0000::/64');
    expect(ipBucket('::1')).toBe('0000:0000:0000:0000::/64');
  });

  it('valores ausentes o invalidos caen en un cubo comun', () => {
    expect(ipBucket(undefined)).toBe('unknown');
    expect(ipBucket('no-es-una-ip')).toBe('unknown');
  });
});
