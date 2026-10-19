import { isIPv4, isIPv6 } from 'net';

/**
 * Expande una IPv6 a sus 8 grupos (maneja "::" y direcciones IPv4 embebidas).
 */
const expandIPv6 = (ip: string): string[] => {
  let address = ip.split('%')[0];
  const embedded = address.match(/^(.*:)(\d+\.\d+\.\d+\.\d+)$/);
  if (embedded) {
    const [a, b, c, d] = embedded[2].split('.').map(Number);
    address =
      embedded[1] +
      ((a << 8) | b).toString(16) +
      ':' +
      ((c << 8) | d).toString(16);
  }
  const [head, tail] = address.split('::');
  const headGroups = head ? head.split(':') : [];
  const tailGroups = tail ? tail.split(':') : [];
  const missing = 8 - headGroups.length - tailGroups.length;
  const groups =
    tail === undefined
      ? headGroups
      : [
          ...headGroups,
          ...Array<string>(Math.max(missing, 0)).fill('0'),
          ...tailGroups,
        ];
  return groups.map((g) => g.toLowerCase().padStart(4, '0'));
};

/**
 * Clave de cubo para una IP. Una IPv6 se agrupa por su prefijo /64: quien
 * controla un /64 puede rotar entre 2^64 direcciones, asi que limitar la
 * direccion exacta no frenaria nada. Una IPv4 mapeada en IPv6 se normaliza.
 */
export const ipBucket = (raw: string | undefined): string => {
  if (!raw) return 'unknown';
  const mapped = raw.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i);
  const ip = mapped ? mapped[1] : raw;
  if (isIPv4(ip)) return ip;
  if (isIPv6(ip)) return expandIPv6(ip).slice(0, 4).join(':') + '::/64';
  return 'unknown';
};
