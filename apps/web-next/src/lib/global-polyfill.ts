// amazon-cognito-identity-js expects a Node-style `global`.
if (typeof (globalThis as Record<string, unknown>).global === 'undefined') {
  (globalThis as Record<string, unknown>).global = globalThis;
}
export {};
