/**
 * Поиск пользователей Instagram через RocketAPI
 * @see https://docs.rocketapi.io/api/instagram/user/search
 */

const ROCKETAPI_URL = 'https://v1.rocketapi.io/instagram/user/search';

// Ключ: задайте EXPO_PUBLIC_ROCKETAPI_TOKEN в .env или здесь для разработки.
// В продакшене лучше вызывать API через свой backend, чтобы не светить ключ в клиенте.
const getToken = () =>
  typeof process !== 'undefined' && process.env?.EXPO_PUBLIC_ROCKETAPI_TOKEN
    ? process.env.EXPO_PUBLIC_ROCKETAPI_TOKEN
    : 'R6GDy-zoO71aNDuH26aYgQ';

/**
 * Находит массив пользователей в ответе (любая вложенность)
 */
function extractUsersList(data) {
  if (!data || typeof data !== 'object') return [];
  if (Array.isArray(data)) return data;
  const keys = ['users', 'items', 'data', 'results', 'list', 'response', 'body', 'result'];
  for (const k of keys) {
    const v = data[k];
    if (Array.isArray(v)) return v;
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      const nested = extractUsersList(v);
      if (nested.length > 0) return nested;
    }
  }
  const firstArray = Object.values(data).find((v) => Array.isArray(v));
  return firstArray ?? [];
}

/**
 * Нормализует пользователя из ответа API (разные поля у разных версий API)
 */
function normalizeUser(u) {
  if (!u || typeof u !== 'object') return null;
  const username = u.username ?? u.user_name ?? u.user?.username ?? '';
  const id = String((u.pk ?? u.id ?? u.user_id ?? username) || Math.random());
  const fullName = u.full_name ?? u.fullName ?? u.name ?? '';
  // RocketAPI/Instagram: поле именно profile_pic_url
  const profilePicUrl =
    (typeof u.profile_pic_url === 'string' && u.profile_pic_url) ||
    u.profile_picture ||
    u.profile_pic_url_hd ||
    u.avatar ||
    u.profile_image_url ||
    null;
  return { id, username, fullName, profilePicUrl };
}

/**
 * Поиск пользователей по запросу (никнейм/имя)
 * @param {string} query
 * @returns {Promise<Array<{ id, username, fullName, profilePicUrl }>>}
 */
export async function searchUsers(query) {
  const q = (query || '').trim();
  if (!q) return [];

  const token = getToken();
  const res = await fetch(ROCKETAPI_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Token ${token}`,
    },
    body: JSON.stringify({ query: q }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(res.status === 401 ? 'Неверный API ключ' : errText || `Ошибка ${res.status}`);
  }

  const data = await res.json();
  // Формат RocketAPI: { num_results: 40, users: [ { pk, username, full_name, profile_pic_url, ... } ] }
  const rawList = data?.users && Array.isArray(data.users) ? data.users : extractUsersList(data);
  const list = rawList.filter(Boolean).map(normalizeUser).filter((u) => u && u.username);
  return list;
}
