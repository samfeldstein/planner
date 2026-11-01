// A Safari tab and the installed Home Screen app keep separate data on iOS, so the app only
// runs installed, or on a local dev host where there is no Home Screen to install to.

// A phone testing against a dev server on the same Wi-Fi reaches it by a private LAN address.
const PRIVATE_LAN = /^(?:10\.\d{1,3}\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3}|172\.(?:1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3})$/;

export const isLocalHost = (hostname) =>
  ['localhost', '127.0.0.1', '[::1]'].includes(hostname) || hostname.endsWith('.localhost') || PRIVATE_LAN.test(hostname);

export const needsInstall = ({ hostname, standalone }) => !standalone && !isLocalHost(hostname);
