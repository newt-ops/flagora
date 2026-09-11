export const BASE_URL = __ENV.TARGET_URL || 'http://localhost:3001';
export const WS_URL = __ENV.WS_URL || BASE_URL.replace(/^http/, 'ws');
export const SESSION_SECRET = __ENV.SESSION_SECRET || 'test_session_secret_for_load_testing_32chars';
export const TARGET_VUS = Number(__ENV.TARGET_VUS) || 500;
export const DURATION = __ENV.DURATION || '3m';

export function getJsonHeaders(sessionToken) {
  const headers = {
    'Content-Type': 'application/json',
  };
  if (sessionToken) {
    headers.Authorization = `Bearer ${sessionToken}`;
  }
  return headers;
}
