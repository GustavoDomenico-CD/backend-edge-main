/**
 * Stub ESM-only @whiskeysockets/baileys for Jest e2e (CJS runtime).
 * Não conecta ao WhatsApp; só permite subir o AppModule nos testes.
 */
function makeWASocket() {
  return {
    ev: {
      on: () => {},
      process: () => {},
    },
    end: () => {},
    logout: async () => {},
    sendMessage: async () => ({ key: { id: 'mock' } }),
  };
}

module.exports = {
  __esModule: true,
  default: makeWASocket,
  Browsers: { ubuntu: ['Edge', 'Linux', ''] },
  DisconnectReason: { loggedOut: 1, restartRequired: 2, connectionClosed: 2 },
  fetchLatestBaileysVersion: async () => ({ version: [2, 3000, 0], isLatest: true }),
  isJidBroadcast: () => false,
  makeCacheableSignalKeyStore: (store) => store,
  useMultiFileAuthState: async () => ({
    state: {
      creds: {},
      keys: { get: () => undefined, set: () => {} },
    },
    saveCreds: async () => {},
  }),
};
