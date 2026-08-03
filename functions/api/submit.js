const SEND_CONFIGURED_COOKIES = 1;

const LOGIN_URL = 'https://m10.hakwonsarang.co.kr/m/login_proc.asp';
const UPLOAD_FORM_URL = 'https://m10.hakwonsarang.co.kr/m/acam_module/SED3/m_sr01_form.asp';
const UPLOAD_PROC_URL = 'https://m10.hakwonsarang.co.kr/m/acam_module/SED3/m_sr01_form_proc.asp';
const FALLBACK_FILE_FIELD = 'file1';
const MAX_FILE_SIZE = 8 * 1024 * 1024;

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
    },
  });
}

function splitSetCookieHeader(value) {
  if (!value) return [];
  return value.split(/,(?=\s*[^;,\s]+=)/g);
}

function getSetCookies(headers) {
  if (typeof headers.getSetCookie === 'function') return headers.getSetCookie();
  return splitSetCookieHeader(headers.get('set-cookie'));
}

function collectCookies(headers, jar) {
  getSetCookies(headers).forEach((cookie) => {
    const firstPart = cookie.split(';', 1)[0];
    const separator = firstPart.indexOf('=');
    if (separator <= 0) return;
    const name = firstPart.slice(0, separator).trim();
    const value = firstPart.slice(separator + 1).trim();
    if (/max-age=0|expires=thu,\s*01 jan 1970/i.test(cookie)) jar.delete(name);
    else jar.set(name, value);
  });
}

function cookieHeader(jar) {
  return Array.from(jar, ([name, value]) => `${name}=${value}`).join('; ');
}

function freshSessionValue(jar) {
  if (jar.has('ASPSESSIONIDSCTADTBS')) return jar.get('ASPSESSIONIDSCTADTBS');
  const session = Array.from(jar).find(([name]) => name.startsWith('ASPSESSIONID'));
  return session?.[1] ?? '';
}

function readSecretCookies(env, studentId, password) {
  const raw = env?.ACADEMY_CONFIGURED_COOKIES_JSON;
  if (!raw) return [];

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('Cloudflare 쿠키 환경변수의 JSON 형식이 올바르지 않습니다.');
  }
  if (!Array.isArray(parsed)) {
    throw new Error('Cloudflare 쿠키 환경변수는 쿠키 배열이어야 합니다.');
  }

  return parsed
    .filter((cookie) => cookie && typeof cookie.name === 'string' && cookie.value != null)
    .filter((cookie) => !cookie.name.startsWith('ASPSESSIONID'))
    .map((cookie) => [
      cookie.name,
      String(cookie.value)
        .replaceAll('{{ID}}', studentId)
        .replaceAll('{{PASSWORD}}', password)
        .replaceAll('입력했던ID', studentId)
        .replaceAll('입력했던비밀번호', password),
    ]);
}

function addConfiguredCookies(jar, studentId, password, env) {
  if (SEND_CONFIGURED_COOKIES !== 1) return;

  const configured = [
    ['ASPSESSIONIDSCTADTBS', freshSessionValue(jar)],
    ['ml1m1chk', 'true'],
    ['ml2m2chk', 'true'],
    ['ml2m2', encodeURIComponent(password)],
    ['mlacamcode', 'SED3'],
    ['ml1m1', encodeURIComponent(studentId)],
    ['EIS', 'classchoicemethod=1&BranchGRCODE=SED3'],
    ...readSecretCookies(env, studentId, password),
  ];

  configured.forEach(([name, value]) => {
    if (value) jar.set(name, value);
  });
}

function remoteCharset(headers) {
  const contentType = headers.get('content-type') ?? '';
  const match = contentType.match(/charset\s*=\s*["']?([^;"'\s]+)/i);
  const value = match?.[1]?.toLowerCase();
  if (!value) return 'utf-8';
  if (value === 'ks_c_5601-1987' || value === 'euc_kr' || value === 'x-windows-949') return 'euc-kr';
  return value;
}

function decodeRemote(buffer, headers) {
  const bytes = new Uint8Array(buffer);
  try {
    return new TextDecoder(remoteCharset(headers)).decode(bytes);
  } catch {
    return new TextDecoder('utf-8').decode(bytes);
  }
}

async function remoteFetch(url, init, jar) {
  const headers = new Headers(init.headers ?? {});
  const cookies = cookieHeader(jar);
  if (cookies) headers.set('cookie', cookies);
  headers.set('accept-language', 'ko-KR,ko;q=0.9,en;q=0.7');
  headers.set('user-agent', 'Mozilla/5.0 (compatible; WritingOutline/1.0)');

  const response = await fetch(url, {
    ...init,
    headers,
    redirect: 'manual',
  });
  collectCookies(response.headers, jar);
  const buffer = await response.arrayBuffer();
  return {
    status: response.status,
    headers: response.headers,
    url,
    text: decodeRemote(buffer, response.headers),
  };
}

async function fetchFollowingRedirects(url, init, jar, maxRedirects = 5) {
  let currentUrl = url;
  let currentInit = init;

  for (let count = 0; count <= maxRedirects; count += 1) {
    const result = await remoteFetch(currentUrl, currentInit, jar);
    const location = result.headers.get('location');
    if (result.status < 300 || result.status >= 400 || !location) return result;
    currentUrl = new URL(location, currentUrl).toString();
    currentInit = { method: 'GET', headers: { referer: result.url } };
  }
  throw new Error('학원 사이트의 이동 응답이 너무 많습니다.');
}

function decodeEntities(value) {
  return String(value ?? '')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&amp;/gi, '&')
    .replace(/&#(\d+);/g, (_, number) => String.fromCodePoint(Number(number)))
    .replace(/&#x([0-9a-f]+);/gi, (_, number) => String.fromCodePoint(Number.parseInt(number, 16)));
}

function parseAttributes(tag) {
  const attributes = {};
  const pattern = /([:\w-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g;
  let match;
  while ((match = pattern.exec(tag))) {
    attributes[match[1].toLowerCase()] = decodeEntities(match[2] ?? match[3] ?? match[4] ?? '');
  }
  return attributes;
}

export function extractUploadForm(html) {
  const forms = Array.from(String(html).matchAll(/<form\b[^>]*>[\s\S]*?<\/form>/gi), (match) => match[0]);
  const selected =
    forms.find((form) => /type\s*=\s*["']?file/i.test(form)) ??
    forms.find((form) => /m_sr01_form_proc\.asp/i.test(form)) ??
    String(html);
  const openingTag = selected.match(/<form\b[^>]*>/i)?.[0] ?? '';
  const formAttributes = parseAttributes(openingTag);
  const hiddenFields = [];
  let fileField = '';

  for (const match of selected.matchAll(/<input\b[^>]*>/gi)) {
    const attributes = parseAttributes(match[0]);
    const type = (attributes.type ?? 'text').toLowerCase();
    if (type === 'file' && attributes.name && !fileField) fileField = attributes.name;
    if (type === 'hidden' && attributes.name) {
      hiddenFields.push([attributes.name, attributes.value ?? '']);
    }
  }

  let action = UPLOAD_PROC_URL;
  if (formAttributes.action) {
    const candidate = new URL(formAttributes.action, UPLOAD_FORM_URL);
    if (candidate.protocol === 'https:' && candidate.hostname === 'm10.hakwonsarang.co.kr') {
      action = candidate.toString();
    }
  }

  return {
    action,
    fileField: fileField || FALLBACK_FILE_FIELD,
    hiddenFields,
  };
}

function extractAlert(html) {
  const match = String(html).match(/alert\s*\(\s*(["'])([\s\S]{0,500}?)\1\s*\)/i);
  return match ? decodeEntities(match[2].replace(/\\n/g, ' ').replace(/\\(["'])/g, '$1')).trim() : '';
}

function looksLikeLogin(html) {
  return /name\s*=\s*["']txtmb_(?:id|pw)["']/i.test(html) || /login_proc\.asp/i.test(html);
}

function isFailureMessage(message) {
  return /(실패|오류|잘못|없습니다|확인.*(?:아이디|비밀번호)|로그인.*(?:필요|해)|invalid|failed|error)/i.test(message);
}

function safeFileName(value) {
  const clean = String(value ?? '')
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  const withExtension = clean.toLowerCase().endsWith('.docx') ? clean : `${clean || '작문 파일 format'}.docx`;
  return withExtension.slice(0, 180);
}

function sameOrigin(request) {
  const origin = request.headers.get('origin');
  return !origin || origin === new URL(request.url).origin;
}

export async function onRequestPost({ request, env }) {
  if (!sameOrigin(request)) return json({ ok: false, message: '허용되지 않은 요청입니다.' }, 403);

  try {
    const incoming = await request.formData();
    const studentId = String(incoming.get('studentId') ?? '').trim();
    const password = String(incoming.get('password') ?? '');
    const file = incoming.get('file');
    const fileName = safeFileName(incoming.get('fileName') || file?.name);

    if (!studentId || !password) return json({ ok: false, message: 'ID와 비밀번호를 입력해 주세요.' }, 400);
    if (studentId.length > 100 || password.length > 200) {
      return json({ ok: false, message: 'ID 또는 비밀번호가 너무 깁니다.' }, 400);
    }
    if (!(file instanceof File) || !file.size) {
      return json({ ok: false, message: '제출할 DOCX 파일이 없습니다.' }, 400);
    }
    if (file.size > MAX_FILE_SIZE) {
      return json({ ok: false, message: 'DOCX 파일은 8MB 이하여야 합니다.' }, 413);
    }
    const signature = new Uint8Array(await file.slice(0, 4).arrayBuffer());
    if (signature[0] !== 0x50 || signature[1] !== 0x4b) {
      return json({ ok: false, message: '올바른 DOCX 파일이 아닙니다.' }, 400);
    }

    const jar = new Map();
    const loginBody = new URLSearchParams({
      gotarget: 'mmsc',
      IsMobile: 'T',
      param: 'gotobranch_st',
      txtbr_code: 'SED3',
      txtmb_id: studentId,
      txtmb_pw: password,
      chkmb_id: 'on',
      chkmb_pw: 'on',
    });

    const login = await remoteFetch(
      LOGIN_URL,
      {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded; charset=UTF-8' },
        body: loginBody.toString(),
      },
      jar,
    );
    addConfiguredCookies(jar, studentId, password, env);

    if (login.status >= 400) throw new Error(`로그인 서버가 오류를 반환했습니다. (${login.status})`);
    const loginAlert = extractAlert(login.text);
    if (isFailureMessage(loginAlert)) throw new Error(loginAlert);

    if (login.status >= 300 && login.status < 400 && login.headers.get('location')) {
      await fetchFollowingRedirects(new URL(login.headers.get('location'), LOGIN_URL).toString(), { method: 'GET' }, jar);
    }

    const uploadPage = await fetchFollowingRedirects(
      UPLOAD_FORM_URL,
      { method: 'GET', headers: { referer: LOGIN_URL } },
      jar,
    );
    if (uploadPage.status >= 400) {
      throw new Error(`제출 화면을 불러오지 못했습니다. (${uploadPage.status})`);
    }
    if (looksLikeLogin(uploadPage.text)) throw new Error('ID 또는 비밀번호를 확인해 주세요.');

    const uploadForm = extractUploadForm(uploadPage.text);
    const outgoing = new FormData();
    uploadForm.hiddenFields.forEach(([name, value]) => outgoing.append(name, value));
    outgoing.set(uploadForm.fileField, file, fileName);

    const submitted = await fetchFollowingRedirects(
      uploadForm.action || UPLOAD_PROC_URL,
      { method: 'POST', headers: { referer: UPLOAD_FORM_URL }, body: outgoing },
      jar,
    );
    if (submitted.status >= 400) throw new Error(`제출 서버가 오류를 반환했습니다. (${submitted.status})`);
    if (looksLikeLogin(submitted.text)) throw new Error('로그인 상태가 유지되지 않았습니다. 다시 시도해 주세요.');

    const remoteMessage = extractAlert(submitted.text);
    if (isFailureMessage(remoteMessage)) throw new Error(remoteMessage);

    return json({
      ok: true,
      fileName,
      message: remoteMessage || '작문 파일이 제출되었습니다.',
    });
  } catch (error) {
    console.error('Writing submission failed', error instanceof Error ? error.message : error);
    return json(
      {
        ok: false,
        message: error instanceof Error ? error.message : '제출 중 오류가 발생했습니다.',
      },
      502,
    );
  }
}

export function onRequestGet() {
  return json({ ok: false, message: 'POST 요청만 사용할 수 있습니다.' }, 405);
}
