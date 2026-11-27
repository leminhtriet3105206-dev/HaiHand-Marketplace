const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:4000';

export const DEFAULT_AVATAR_PLACEHOLDER =
  "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 80 80'><rect width='80' height='80' rx='40' fill='%23E7E5E4'/><circle cx='40' cy='31' r='14' fill='%23A8A29E'/><path d='M16 70c3-14 14-21 24-21s21 7 24 21' fill='%23A8A29E'/></svg>";

export const DEFAULT_IMAGE_PLACEHOLDER =
  "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 120 120'><rect width='120' height='120' fill='%23F5F5F4'/><rect x='26' y='30' width='68' height='54' rx='6' fill='none' stroke='%23A8A29E' stroke-width='4'/><circle cx='46' cy='48' r='6' fill='%23A8A29E'/><path d='M32 78l18-18 14 14 10-10 14 14' fill='none' stroke='%23A8A29E' stroke-width='4' stroke-linecap='round' stroke-linejoin='round'/></svg>";

export function getImageUrl(imgStr, fallback = DEFAULT_IMAGE_PLACEHOLDER) {
  if (!imgStr || typeof imgStr !== 'string') return fallback;
  const trimmed = imgStr.trim();
  if (!trimmed) return fallback;
  if (
    trimmed.startsWith('http://') ||
    trimmed.startsWith('https://') ||
    trimmed.startsWith('blob:') ||
    trimmed.startsWith('data:')
  ) {
    return trimmed;
  }
  const normalized = trimmed.replace(/\\/g, '/').replace(/^\/+/, '');
  return `${API_URL}/${normalized}`;
}
