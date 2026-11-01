// A Safari tab and the installed Home Screen app keep separate data on iOS, so the app only
// runs installed, or on a local dev host where there is no Home Screen to install to.

export const isLocalHost = (hostname) =>
  ['localhost', '127.0.0.1', '[::1]'].includes(hostname) || hostname.endsWith('.localhost');

export const needsInstall = ({ hostname, standalone }) => !standalone && !isLocalHost(hostname);
