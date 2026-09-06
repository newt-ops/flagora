async function hmacSha256(key: unknown, data: string): Promise<Uint8Array> {
  const cryptoKey = await window.crypto.subtle.importKey(
    'raw',
    key as BufferSource,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await window.crypto.subtle.sign(
    'HMAC',
    cryptoKey,
    new TextEncoder().encode(data),
  );
  return new Uint8Array(signature);
}

function bufferToHex(buffer: Uint8Array): string {
  return Array.from(buffer)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export async function generateDevInitData(customUser?: {
  id?: number;
  first_name?: string;
  last_name?: string;
  username?: string;
}): Promise<string> {
  const botToken = 'test_bot_token_12345:ABCdefGHIjklMNOpqrSTUvwxYZ';
  const now = Math.floor(Date.now() / 1000);
  const userObj = customUser ?? {
    id: 123456789,
    first_name: 'Dev',
    last_name: 'Player',
    username: 'dev_player',
  };

  const fields: Record<string, string> = {
    auth_date: String(now),
    query_id: 'DEV_QUERY_ID_123',
    user: JSON.stringify(userObj),
  };

  const keys = Object.keys(fields).sort((a, b) => a.localeCompare(b));
  const dataCheckString = keys.map((k) => `${k}=${fields[k]}`).join('\n');

  const webAppDataKey = new TextEncoder().encode('WebAppData');
  const secretKey = await hmacSha256(webAppDataKey, botToken);
  const hashBuffer = await hmacSha256(secretKey, dataCheckString);
  const hash = bufferToHex(hashBuffer);

  const params = new URLSearchParams(fields);
  params.set('hash', hash);
  return params.toString();
}
