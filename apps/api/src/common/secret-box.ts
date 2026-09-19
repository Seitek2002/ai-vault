import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

/**
 * Шифрование секретов, которые приходится хранить в БД (пароль от кабинета
 * ЭСФ). AES-256-GCM: аутентифицированное шифрование, подмена шифртекста
 * обнаруживается при расшифровке.
 *
 * Ключ — `ESF_SECRET_KEY`, 64 hex-символа (32 байта). Без него сохранить
 * секрет нельзя: хранить пароль открытым текстом хуже, чем не хранить вовсе.
 */

const ALGO = 'aes-256-gcm';
const IV_BYTES = 12;
const TAG_BYTES = 16;
const VERSION = 'v1';

function loadKey(): Buffer | null {
  const hex = process.env['ESF_SECRET_KEY']?.trim();
  if (!hex) return null;
  if (!/^[0-9a-fA-F]{64}$/.test(hex)) {
    throw new Error('ESF_SECRET_KEY должен быть 64 hex-символа (32 байта)');
  }
  return Buffer.from(hex, 'hex');
}

export function isSecretBoxConfigured(): boolean {
  return loadKey() !== null;
}

/** `v1:<iv>:<tag>:<ciphertext>` в base64url. */
export function seal(plaintext: string): string {
  const key = loadKey();
  if (!key) throw new Error('ESF_SECRET_KEY не задан — секрет сохранить нельзя');

  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGO, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();

  return [VERSION, iv.toString('base64url'), tag.toString('base64url'), encrypted.toString('base64url')].join(':');
}

export function open(sealed: string): string {
  const key = loadKey();
  if (!key) throw new Error('ESF_SECRET_KEY не задан — секрет расшифровать нельзя');

  const [version, ivB64, tagB64, dataB64] = sealed.split(':');
  if (version !== VERSION || !ivB64 || !tagB64 || !dataB64) {
    throw new Error('Неизвестный формат зашифрованного секрета');
  }

  const iv = Buffer.from(ivB64, 'base64url');
  const tag = Buffer.from(tagB64, 'base64url');
  if (iv.length !== IV_BYTES || tag.length !== TAG_BYTES) {
    throw new Error('Повреждённый зашифрованный секрет');
  }

  const decipher = createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(Buffer.from(dataB64, 'base64url')), decipher.final()]).toString('utf8');
}
