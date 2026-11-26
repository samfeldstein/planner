// What the dev server prints for the phone preview, from the Mac's network interfaces (os.networkInterfaces()).
// Only private LAN addresses work: the app shows its install gate on any other host (src/js/ui/install.js).
// Pure, so tests can import it without starting the server.

import { isLocalHost } from '../src/js/ui/install.js';

export function phoneLines(interfaces, port) {
  const ipv4 = Object.values(interfaces).flat().filter((a) => a && a.family === 'IPv4' && !a.internal).map((a) => a.address);
  const lan = ipv4.filter((ip) => isLocalHost(ip));
  if (lan.length) return lan.map((ip) => `On your phone (same Wi-Fi): http://${ip}:${port}`);
  if (!ipv4.length) return ['No network address found: connect the Mac to the same Wi-Fi as the phone.'];
  // Usually a VPN or a self-assigned address with Wi-Fi off; the phone would get the install gate on these.
  return [`No private network address for the phone (found ${ipv4.join(', ')}, which the app treats as a website): ` +
    'connect the Mac to the same Wi-Fi as the phone, or turn off a VPN.'];
}
