/**
 * Chatera backend API (OpenAPI: /api/auth/*)
 * Базовый URL — origin без хвостового слэша; пути как в спецификации (/api/...).
 */

const DEFAULT_ORIGIN = 'https://app.chatera.ai';

export function getChateraApiOrigin() {
  const fromEnv =
    typeof process !== 'undefined' && process.env?.EXPO_PUBLIC_CHATERA_API_URL;
  const raw = String(fromEnv || DEFAULT_ORIGIN).trim();
  return raw.replace(/\/+$/, '');
}

/**
 * Нужна регистрация: диалоги, привязка WhatsApp и сохранение настроек доступны после входа в аккаунт.
 * @param {{ message?: string, status?: number, body?: object }|null|undefined} err
 * @returns {boolean}
 */
export function errorMeansRegistrationRequired(err) {
  if (err == null) return false;
  if (err.status === 401) return true;
  const fromBody =
    (typeof err.body?.error === 'string' && err.body.error) ||
    (typeof err.body?.message === 'string' && err.body.message) ||
    '';
  const combined = `${err.message || ''} ${fromBody}`.toUpperCase();
  if (combined.includes('NOT_AUTHENTICATED')) return true;
  if (combined.includes('AUTHENTICATION REQUIRED')) return true;
  return false;
}

/**
 * Создаёт анонимную сессию (POST /api/session).
 * Вызывается один раз при старте приложения.
 * @returns {Promise<{ sessionId?: string, session?: object }>}
 */
export async function createSession() {
  const origin = getChateraApiOrigin();
  const res = await fetch(`${origin}/api/session`, {
    method: 'POST',
    headers: { Accept: 'application/json' },
    credentials: 'include',
  });
  let data = {};
  const text = await res.text();
  if (text) {
    try { data = JSON.parse(text); } catch { /* ignore */ }
  }
  return data;
}

/**
 * Текущая сессия (GET /api/session). В session.bot — prompt, stages после создания бота.
 * @returns {Promise<object|null>} тело { success, session } или null при 404/ошибке
 */
export async function fetchSession() {
  const origin = getChateraApiOrigin();
  const res = await fetch(`${origin}/api/session`, {
    method: 'GET',
    headers: { Accept: 'application/json' },
    credentials: 'include',
  });
  let data = {};
  const text = await res.text();
  if (text) {
    try { data = JSON.parse(text); } catch { /* ignore */ }
  }
  if (res.status === 404 || !res.ok) return null;
  return data;
}

/**
 * Список ботов аккаунта (GET /api/bots). Полная карточка бота, не только вложение в session.
 * Без авторизации — 401, возвращаем пустой список без throw.
 * @returns {Promise<{ success?: boolean, count?: number, bots?: object[] }|null>}
 */
export async function fetchBots() {
  const origin = getChateraApiOrigin();
  const res = await fetch(`${origin}/api/bots`, {
    method: 'GET',
    headers: { Accept: 'application/json' },
    credentials: 'include',
  });
  let data = {};
  const text = await res.text();
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      /* ignore */
    }
  }
  if (res.status === 401) {
    return { success: false, count: 0, bots: [] };
  }
  if (!res.ok) {
    return null;
  }
  return data;
}

/**
 * Первый bot._id из ответа GET /api/bots (удобно, когда session.bot урезан).
 * @param {object|null|undefined} apiResponse — тело ответа fetchBots
 * @returns {string|null}
 */
export function getFirstBotIdFromBots(apiResponse) {
  const list = apiResponse?.bots;
  if (!Array.isArray(list) || list.length === 0) return null;
  const raw = list[0]?._id ?? list[0]?.id;
  if (raw == null || raw === '') return null;
  return String(raw);
}

/**
 * Достаёт инструкцию и этапы из session.bot (ответ GET /api/session).
 * @param {object|null} apiResponse
 * @returns {{ instruction: string|null, stages: object[]|null }|null}
 */
export function parseBotSettingsFromSession(apiResponse) {
  const bot = apiResponse?.session?.bot;
  if (!bot || typeof bot !== 'object' || Object.keys(bot).length === 0) {
    return null;
  }

  let instruction = null;
  const p = bot.prompt;
  if (typeof p === 'string' && p.trim()) {
    instruction = p;
  } else if (p != null && typeof p === 'object') {
    if (typeof p.text === 'string' && p.text.trim()) instruction = p.text;
    else if (typeof p.content === 'string' && p.content.trim()) instruction = p.content;
  }

  let stages = null;
  if (Array.isArray(bot.stages) && bot.stages.length > 0) {
    stages = bot.stages.map((s, i) => {
      if (s == null) {
        return {
          id: `st_${i}`,
          title: `Этап ${i + 1}`,
          prompt: '',
          allowedMoves: [],
          order: undefined,
        };
      }
      if (typeof s === 'string') {
        return { id: `st_${i}`, title: s, prompt: '', allowedMoves: [], order: undefined };
      }
      const titleRaw =
        s.name ?? s.title ?? s.label ?? s.stage ?? s.description;
      const title =
        titleRaw != null && String(titleRaw).trim()
          ? String(titleRaw).trim()
          : `Этап ${i + 1}`;
      const id = String(s._id ?? s.id ?? s.key ?? `st_${i}`);
      const prompt = typeof s.prompt === 'string' ? s.prompt : '';
      const allowedMoves = Array.isArray(s.allowedMoves)
        ? s.allowedMoves.map((x) => String(x))
        : [];
      let order;
      if (typeof s.order === 'number' && !Number.isNaN(s.order)) {
        order = s.order;
      } else if (s.order != null && String(s.order).trim() !== '') {
        const n = Number(String(s.order).trim());
        if (!Number.isNaN(n)) order = n;
      }
      return { id, title, prompt, allowedMoves, order };
    });
  }

  if (instruction == null && stages == null) return null;
  return { instruction, stages };
}

/**
 * ID бота из GET /api/session (Mongo: session.bot._id).
 * @param {object|null} apiResponse
 * @returns {string|null}
 */
export function getBotIdFromSession(apiResponse) {
  const bot = apiResponse?.session?.bot;
  if (!bot || typeof bot !== 'object') return null;
  const raw = bot._id ?? bot.id;
  if (raw == null || raw === '') return null;
  return String(raw);
}

/**
 * phoneNumber бота из GET /api/session (если уже привязан WhatsApp).
 * @param {object|null} apiResponse
 * @returns {string|null}
 */
export function getBotPhoneNumberFromSession(apiResponse) {
  const bot = apiResponse?.session?.bot;
  if (!bot || typeof bot !== 'object') return null;
  const raw = bot.phoneNumber;
  if (raw == null || String(raw).trim() === '') return null;
  return String(raw).trim();
}

/**
 * Проверка привязки WhatsApp по данным бота.
 * @param {object|null|undefined} bot
 * @returns {boolean}
 */
export function isWhatsAppLinkedForBot(bot) {
  const raw = bot?.phoneNumber;
  return raw != null && String(raw).trim() !== '';
}

/**
 * Объект «аккаунт» для UI при возврате по cookie (POST /api/session или GET /api/session уже с bot).
 * @param {object|null|undefined} apiResponse — тело ответа с полем session
 * @returns {{ id: string, username: string, fullName: string, profilePicUrl: null }}
 */
export function buildResumeAccountFromSession(apiResponse) {
  const s = apiResponse?.session;
  if (!s || typeof s !== 'object') {
    return {
      id: 'session',
      username: 'business',
      fullName: 'Ваш агент',
      profilePicUrl: null,
    };
  }
  const quiz =
    s.quiz && typeof s.quiz === 'object' && !Array.isArray(s.quiz) ? s.quiz : {};
  const fromQuiz = (k) => {
    const v = quiz[k];
    return typeof v === 'string' && v.trim() ? v.trim() : '';
  };
  let username =
    fromQuiz('username') ||
    fromQuiz('instagramUsername') ||
    fromQuiz('instagram_handle') ||
    '';
  if (!username) username = 'business';
  else username = username.replace(/^@/, '');
  const fullNameRaw =
    fromQuiz('businessName') || fromQuiz('fullName') || fromQuiz('name') || username;
  const id =
    (typeof s.instagramAccountId === 'string' && s.instagramAccountId) ||
    getBotIdFromSession(apiResponse) ||
    'session';
  return {
    id: String(id),
    username,
    fullName: fullNameRaw || username,
    profilePicUrl: null,
  };
}

/**
 * Привязка бота к WhatsApp (Green API) — код для ввода в приложении.
 * POST /api/bots/:botId/link-whatsapp, body: { phoneNumber } — только цифры, 10–15.
 * @param {string} botId
 * @param {string} phoneNumberDigits
 * @param {{ signal?: AbortSignal }} [options]
 */
export async function linkBotWhatsApp(botId, phoneNumberDigits, options = {}) {
  const { signal } = options;
  const digits = String(phoneNumberDigits || '').replace(/\D/g, '');
  if (digits.length < 10 || digits.length > 15) {
    throw new Error('Номер: от 10 до 15 цифр');
  }
  const origin = getChateraApiOrigin();
  const url = `${origin}/api/bots/${encodeURIComponent(botId)}/link-whatsapp`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ phoneNumber: digits }),
    credentials: 'include',
    signal,
  });
  let data = {};
  const text = await res.text();
  if (text) {
    try { data = JSON.parse(text); } catch { /* ignore */ }
  }
  if (!res.ok) {
    const msg =
      (typeof data.message === 'string' && data.message) ||
      (typeof data.error === 'string' && data.error) ||
      `Ошибка привязки (${res.status})`;
    const err = new Error(msg);
    err.status = res.status;
    err.body = data;
    throw err;
  }
  return data;
}

/**
 * Список записей RAG (GET /api/rag/:botId/entries).
 * @param {string} botId
 * @param {{ limit?: number, offset?: string }} [options]
 * @returns {Promise<{ success?: boolean, entries?: object[], nextOffset?: string|null }|null>}
 */
export async function fetchRagEntries(botId, options = {}) {
  const { limit = 100, offset } = options;
  const origin = getChateraApiOrigin();
  const qs = new URLSearchParams();
  qs.set('limit', String(limit));
  if (offset != null && String(offset) !== '') qs.set('offset', String(offset));
  const url = `${origin}/api/rag/${encodeURIComponent(botId)}/entries?${qs}`;
  const res = await fetch(url, {
    method: 'GET',
    headers: { Accept: 'application/json' },
    credentials: 'include',
  });
  let data = {};
  const text = await res.text();
  if (text) {
    try { data = JSON.parse(text); } catch { /* ignore */ }
  }
  if (!res.ok) return null;
  return data;
}

/**
 * Создать текстовую запись RAG (POST /api/rag/:botId/entries).
 * @param {string} botId
 * @param {{ title?: string, content: string, type?: string }} payload
 * @returns {Promise<object>}
 */
export async function createRagEntry(botId, payload) {
  const origin = getChateraApiOrigin();
  const url = `${origin}/api/rag/${encodeURIComponent(botId)}/entries`;
  const title = typeof payload?.title === 'string' ? payload.title.trim() : '';
  const content = typeof payload?.content === 'string' ? payload.content : '';
  const type = typeof payload?.type === 'string' ? payload.type : 'custom';

  const attemptBodies = [
    { entries: [{ title, content }] },
    { entries: [{ title, content, type }] },
    { title, content, type },
  ];

  let lastErr = null;
  for (const body of attemptBodies) {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify(body),
    });
    let data = {};
    const text = await res.text();
    if (text) {
      try { data = JSON.parse(text); } catch { data = {}; }
    }
    if (res.ok) return data;

    const msg =
      (typeof data.error === 'string' && data.error) ||
      (typeof data.message === 'string' && data.message) ||
      `Не удалось добавить запись (${res.status})`;
    const err = new Error(msg);
    err.status = res.status;
    err.body = data;
    lastErr = err;
    if (res.status !== 400) break;
  }
  throw lastErr || new Error('Не удалось добавить запись');
}

/**
 * Удалить запись RAG (DELETE /api/rag/:botId/entries/:entryId).
 * @param {string} botId
 * @param {string} entryId
 * @returns {Promise<object>}
 */
export async function deleteRagEntry(botId, entryId) {
  const origin = getChateraApiOrigin();
  const url = `${origin}/api/rag/${encodeURIComponent(botId)}/entries/${encodeURIComponent(entryId)}`;
  const res = await fetch(url, {
    method: 'DELETE',
    headers: { Accept: 'application/json' },
    credentials: 'include',
  });
  let data = {};
  const text = await res.text();
  if (text) {
    try { data = JSON.parse(text); } catch { data = {}; }
  }
  if (!res.ok) {
    const msg =
      (typeof data.error === 'string' && data.error) ||
      (typeof data.message === 'string' && data.message) ||
      `Не удалось удалить запись (${res.status})`;
    const err = new Error(msg);
    err.status = res.status;
    err.body = data;
    throw err;
  }
  return data;
}

/**
 * Записи RAG → элементы для блока «База знаний».
 * @param {object[]} entries
 * @returns {object[]}
 */
export function ragEntriesToKbItems(entries) {
  if (!Array.isArray(entries)) return [];
  return entries.map((e) => {
    const content = typeof e?.content === 'string' ? e.content : '';
    const title =
      typeof e?.title === 'string' && e.title.trim() ? e.title : 'Без названия';
    const typeStr = e?.type != null ? String(e.type) : '';
    const meta = typeStr
      ? `${content.length} симв. · ${typeStr}`
      : `${content.length} симв.`;
    return {
      id: `rag_${e.id}`,
      type: 'text',
      title,
      text: content,
      source: 'rag',
      ragEntryId: String(e.id),
      ragType: e.type,
      kbMeta: meta,
    };
  });
}

/**
 * Запускает загрузку Instagram-профиля и фоновую генерацию бота
 * (GET /api/instagram/create-bot?username=...).
 * @param {string} username
 * @returns {Promise<{ success: boolean, profile?: object, quick?: object, jobId?: string, status?: string }>}
 */
export async function createInstagramBot(username) {
  const origin = getChateraApiOrigin();
  const url = `${origin}/api/instagram/create-bot?username=${encodeURIComponent(username)}`;
  const res = await fetch(url, {
    method: 'GET',
    headers: { Accept: 'application/json' },
    credentials: 'include',
  });
  let data = {};
  const text = await res.text();
  if (text) {
    try { data = JSON.parse(text); } catch { /* ignore */ }
  }
  if (!res.ok) {
    const msg =
      (typeof data.message === 'string' && data.message) ||
      `Ошибка создания бота (${res.status})`;
    const err = new Error(msg);
    err.status = res.status;
    throw err;
  }
  return data;
}

/**
 * Поиск Instagram-пользователей (GET /api/instagram/search?query=...).
 * @param {string} query
 * @returns {Promise<object[]>}
 */
export async function searchInstagramUsers(query) {
  const q = String(query || '').trim();
  if (!q) return [];
  const origin = getChateraApiOrigin();
  const url = `${origin}/api/instagram/search?query=${encodeURIComponent(q)}`;
  const res = await fetch(url, {
    method: 'GET',
    headers: { Accept: 'application/json' },
    credentials: 'include',
  });
  let data = {};
  const text = await res.text();
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = {};
    }
  }
  if (!res.ok) {
    const msg =
      (typeof data.message === 'string' && data.message) ||
      (typeof data.error === 'string' && data.error) ||
      `Ошибка поиска (${res.status})`;
    const err = new Error(msg);
    err.status = res.status;
    err.body = data;
    throw err;
  }
  const users = Array.isArray(data?.users) ? data.users : [];
  return users.map((u, idx) => ({
    id: String(u?.pk ?? u?.id ?? `ig_${idx}`),
    username: String(
      u?.username ?? u?.user?.username ?? u?.handle ?? '',
    ).replace(/^@/, ''),
    fullName:
      (typeof u?.full_name === 'string' && u.full_name) ||
      (typeof u?.fullName === 'string' && u.fullName) ||
      '',
    profilePicUrl:
      (typeof u?.profile_pic_url === 'string' && u.profile_pic_url) ||
      (typeof u?.profilePicUrl === 'string' && u.profilePicUrl) ||
      null,
  })).filter((u) => u.username);
}

/**
 * Один запрос статуса бота (GET /api/instagram/bot-status).
 * @returns {Promise<{ status: number, data: object }>}
 */
export async function fetchBotStatus() {
  const origin = getChateraApiOrigin();
  const res = await fetch(`${origin}/api/instagram/bot-status`, {
    method: 'GET',
    headers: { Accept: 'application/json' },
    credentials: 'include',
  });
  let data = {};
  const text = await res.text();
  if (text) {
    try { data = JSON.parse(text); } catch { /* ignore */ }
  }
  return { status: res.status, data };
}

/**
 * Отправляет сообщение боту (POST /api/prompt-agent/test).
 * @param {string} message
 * @returns {Promise<{ response: string, testBotHistory?: object[] }>}
 */
export async function testPromptAgent(message) {
  const origin = getChateraApiOrigin();
  const res = await fetch(`${origin}/api/prompt-agent/test`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ message }),
    credentials: 'include',
  });

  let data = {};
  const text = await res.text();
  if (text) {
    try { data = JSON.parse(text); } catch { /* ignore */ }
  }

  if (!res.ok) {
    const msg =
      (typeof data.error === 'string' && data.error) ||
      (typeof data.message === 'string' && data.message) ||
      `Ошибка (${res.status})`;
    const err = new Error(msg);
    err.status = res.status;
    throw err;
  }

  return data;
}

/**
 * Сброс истории тестового чата на сервере (POST /api/prompt-agent/test с resetHistory: true).
 * @returns {Promise<object>}
 */
export async function resetTestPromptHistory() {
  const origin = getChateraApiOrigin();
  const res = await fetch(`${origin}/api/prompt-agent/test`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ resetHistory: true }),
    credentials: 'include',
  });

  let data = {};
  const text = await res.text();
  if (text) {
    try { data = JSON.parse(text); } catch { /* ignore */ }
  }

  if (!res.ok) {
    const msg =
      (typeof data.error === 'string' && data.error) ||
      (typeof data.message === 'string' && data.message) ||
      `Ошибка сброса (${res.status})`;
    const err = new Error(msg);
    err.status = res.status;
    throw err;
  }

  return data;
}

/**
 * История тестового чата (GET /api/prompt-agent/test-history).
 * @returns {Promise<{ testBotHistory?: { role: string, content: string }[], hasHistory?: boolean }>}
 */
export async function fetchTestBotHistory() {
  const origin = getChateraApiOrigin();
  const res = await fetch(`${origin}/api/prompt-agent/test-history`, {
    method: 'GET',
    headers: { Accept: 'application/json' },
    credentials: 'include',
  });
  let data = {};
  const text = await res.text();
  if (text) {
    try { data = JSON.parse(text); } catch { /* ignore */ }
  }
  if (!res.ok) return { testBotHistory: [] };
  return data;
}

/**
 * Список чатов бота (GET /api/bots/:botId/chats).
 * @param {string} botId
 * @param {{ page?: number, limit?: number }} [options]
 * @returns {Promise<{ success?: boolean, data?: { items: object[], total: number, page: number, limit: number, hasMore: boolean } }>}
 */
export async function fetchBotChats(botId, options = {}) {
  const { page = 1, limit = 20 } = options;
  const origin = getChateraApiOrigin();
  const qs = new URLSearchParams();
  qs.set('page', String(page));
  qs.set('limit', String(limit));
  const url = `${origin}/api/bots/${encodeURIComponent(botId)}/chats?${qs}`;
  const res = await fetch(url, {
    method: 'GET',
    headers: { Accept: 'application/json' },
    credentials: 'include',
  });
  let data = {};
  const text = await res.text();
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      /* ignore */
    }
  }
  if (!res.ok) {
    const msg =
      (typeof data.error === 'string' && data.error) ||
      (typeof data.message === 'string' && data.message) ||
      `Не удалось загрузить диалоги (${res.status})`;
    const err = new Error(msg);
    err.status = res.status;
    err.body = data;
    throw err;
  }
  return data;
}

/**
 * Детали чата (GET /api/chats/:botId/:chatId).
 * @param {string} botId
 * @param {string} chatId
 */
export async function fetchChat(botId, chatId) {
  const origin = getChateraApiOrigin();
  const url = `${origin}/api/chats/${encodeURIComponent(botId)}/${encodeURIComponent(chatId)}`;
  const res = await fetch(url, {
    method: 'GET',
    headers: { Accept: 'application/json' },
    credentials: 'include',
  });
  let data = {};
  const text = await res.text();
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      /* ignore */
    }
  }
  if (!res.ok) {
    const msg =
      (typeof data.error === 'string' && data.error) ||
      (typeof data.message === 'string' && data.message) ||
      `Не удалось загрузить чат (${res.status})`;
    const err = new Error(msg);
    err.status = res.status;
    err.body = data;
    throw err;
  }
  return data;
}

/**
 * Сообщения чата (GET /api/chats/:botId/:chatId/messages), новые первыми на сервере.
 * @param {string} botId
 * @param {string} chatId
 * @param {{ page?: number, limit?: number }} [options]
 */
export async function fetchChatMessages(botId, chatId, options = {}) {
  const { page = 1, limit = 50 } = options;
  const origin = getChateraApiOrigin();
  const qs = new URLSearchParams();
  qs.set('page', String(page));
  qs.set('limit', String(limit));
  const url = `${origin}/api/chats/${encodeURIComponent(botId)}/${encodeURIComponent(
    chatId,
  )}/messages?${qs}`;
  const res = await fetch(url, {
    method: 'GET',
    headers: { Accept: 'application/json' },
    credentials: 'include',
  });
  let data = {};
  const text = await res.text();
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      /* ignore */
    }
  }
  if (!res.ok) {
    const msg =
      (typeof data.error === 'string' && data.error) ||
      (typeof data.message === 'string' && data.message) ||
      `Не удалось загрузить сообщения (${res.status})`;
    const err = new Error(msg);
    err.status = res.status;
    err.body = data;
    throw err;
  }
  return data;
}

/**
 * Сервер: type user = клиент; bot | manager | log = наши ответы.
 * @param {string} type
 * @returns {boolean} true — пузырь справа (зелёный), как ответ бота/менеджера
 */
export function isOutgoingWaMessageType(type) {
  const t = String(type || '').toLowerCase();
  return t === 'bot' || t === 'manager' || t === 'log';
}

/**
 * Текущий пользователь по cookie-сессии (GET /api/auth/me).
 * @returns {Promise<
 *   | { ok: true; success?: boolean; user: object; botId?: string; sessionId?: string }
 *   | { ok: false; status: number; message?: string }
 * >}
 */
export async function fetchAuthMe() {
  const origin = getChateraApiOrigin();
  const res = await fetch(`${origin}/api/auth/me`, {
    method: 'GET',
    headers: { Accept: 'application/json' },
    credentials: 'include',
  });
  let data = {};
  const text = await res.text();
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      /* ignore */
    }
  }
  if (res.status === 401) {
    return {
      ok: false,
      status: 401,
      message:
        (typeof data.message === 'string' && data.message) || 'Not authenticated',
    };
  }
  if (!res.ok) {
    return {
      ok: false,
      status: res.status,
      message:
        (typeof data.message === 'string' && data.message) ||
        (typeof data.error === 'string' && data.error) ||
        `Ошибка профиля (${res.status})`,
    };
  }
  return {
    ok: true,
    success: data.success,
    user: data.user ?? null,
    botId: data.botId != null ? String(data.botId) : '',
    sessionId: data.sessionId != null ? String(data.sessionId) : '',
  };
}

/**
 * Регистрация только email + пароль (POST /api/auth/register).
 * @param {{ email: string; password: string }} params
 * @returns {Promise<object>} тело ответа при успехе (201)
 */
export async function registerWithEmailPassword({ email, password }) {
  const origin = getChateraApiOrigin();
  const url = `${origin}/api/auth/register`;

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      email: email.trim().toLowerCase(),
      password,
    }),
    credentials: 'include',
  });

  let data = {};
  const text = await res.text();
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = { message: text.slice(0, 200) };
    }
  }

  if (!res.ok) {
    const msg =
      (typeof data.message === 'string' && data.message) ||
      (typeof data.error === 'string' && data.error) ||
      `Запрос не выполнен (${res.status})`;
    const err = new Error(msg);
    err.status = res.status;
    err.body = data;
    throw err;
  }

  return data;
}

/**
 * Похоже ли строка на Mongo ObjectId (24 hex).
 * @param {string|null|undefined} s
 * @returns {boolean}
 */
export function isLikelyMongoObjectId(s) {
  return typeof s === 'string' && /^[a-fA-F0-9]{24}$/.test(s);
}

/**
 * PATCH /api/bots/:botId — обновить поля бота (нужна авторизация, владелец).
 * @param {string} botId
 * @param {{ prompt?: string }} body
 * @returns {Promise<{ ok: boolean; status: number; data: object; message?: string }>}
 */
export async function patchBot(botId, body) {
  const origin = getChateraApiOrigin();
  const res = await fetch(
    `${origin}/api/bots/${encodeURIComponent(botId)}`,
    {
      method: 'PATCH',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify(body),
    },
  );
  let data = {};
  const text = await res.text();
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = {};
    }
  }
  const msg =
    (typeof data.message === 'string' && data.message) ||
    (res.ok ? '' : `HTTP ${res.status}`);
  return {
    ok: res.ok,
    status: res.status,
    data,
    message: msg,
  };
}

/**
 * PATCH /api/bots/:botId/stages/:stageId — текст промпта этапа (PromptStage).
 * @param {string} botId
 * @param {string} stageId
 * @param {string} prompt
 */
export async function patchBotStagePrompt(botId, stageId, prompt) {
  const origin = getChateraApiOrigin();
  const res = await fetch(
    `${origin}/api/bots/${encodeURIComponent(botId)}/stages/${encodeURIComponent(
      stageId,
    )}`,
    {
      method: 'PATCH',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify({
        prompt: typeof prompt === 'string' ? prompt : '',
      }),
    },
  );
  let data = {};
  const text = await res.text();
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = {};
    }
  }
  const msg =
    (typeof data.message === 'string' && data.message) ||
    (res.ok ? '' : `HTTP ${res.status}`);
  return {
    ok: res.ok,
    status: res.status,
    data,
    message: msg,
  };
}
