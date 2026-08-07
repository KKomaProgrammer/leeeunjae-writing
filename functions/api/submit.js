const SEND_CONFIGURED_COOKIES = 1;

const LOGIN_PAGE_URL = 'https://m10.hakwonsarang.co.kr/m/m_login.asp';
const LOGIN_URL = 'https://m10.hakwonsarang.co.kr/m/login_proc.asp';
const UPLOAD_FORM_URL = 'https://m10.hakwonsarang.co.kr/m/acam_module/SED3/m_sr01_form.asp';
const UPLOAD_PROC_URL = 'https://m10.hakwonsarang.co.kr/m/acam_module/SED3/m_sr01_form_proc.asp';
const UPLOAD_LIST_URL = 'https://m10.hakwonsarang.co.kr/m/acam_module/SED3/m_sr01.asp';
const ACADEMY_HOSTS = new Set(['m10.hakwonsarang.co.kr']);
const MOBILE_USER_AGENT =
  'Mozilla/5.0 (Linux; Android 14; Mobile) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36';
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

function safeCookieValue(value) {
  return Array.from(String(value ?? ''), (character) => {
    const code = character.codePointAt(0);
    const allowed =
      code === 0x21 ||
      (code >= 0x23 && code <= 0x2b) ||
      (code >= 0x2d && code <= 0x3a) ||
      (code >= 0x3c && code <= 0x5b) ||
      (code >= 0x5d && code <= 0x7e);
    return allowed ? character : encodeURIComponent(character);
  }).join('');
}

function isFreshOnlyCookie(name) {
  return /^ASPSESSIONID/i.test(name) || name.toUpperCase() === 'H2';
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
    .filter(
      (cookie) =>
        cookie &&
        typeof cookie.name === 'string' &&
        /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/.test(cookie.name) &&
        cookie.value != null,
    )
    .filter((cookie) => !isFreshOnlyCookie(cookie.name))
    .map((cookie) => [
      cookie.name,
      String(cookie.value)
        .replaceAll('{{ID}}', safeCookieValue(studentId))
        .replaceAll('{{PASSWORD}}', safeCookieValue(password))
        .replaceAll('입력했던ID', safeCookieValue(studentId))
        .replaceAll('입력했던비밀번호', safeCookieValue(password)),
    ]);
}

function addConfiguredCookies(jar, studentId, password, env) {
  if (SEND_CONFIGURED_COOKIES !== 1) return;

  const configured = [
    ['ml1m1chk', 'true'],
    ['ml2m2chk', 'true'],
    ['ml2m2', safeCookieValue(password)],
    ['mlacamcode', 'SED3'],
    ['ml1m1', safeCookieValue(studentId)],
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

function resolveAcademyUrl(value, baseUrl) {
  try {
    const candidate = new URL(value, baseUrl);
    if (candidate.protocol !== 'https:' || !ACADEMY_HOSTS.has(candidate.hostname)) return '';
    return candidate.toString();
  } catch {
    return '';
  }
}

async function remoteFetch(url, init, jar) {
  const safeUrl = resolveAcademyUrl(url, LOGIN_PAGE_URL);
  if (!safeUrl) throw new Error('학원 사이트가 허용되지 않은 주소로 이동하려고 했습니다.');

  const headers = new Headers(init.headers ?? {});
  const cookies = cookieHeader(jar);
  if (cookies) headers.set('cookie', cookies);
  headers.set('accept-language', 'ko-KR,ko;q=0.9,en;q=0.7');
  headers.set('user-agent', MOBILE_USER_AGENT);

  const response = await fetch(safeUrl, {
    ...init,
    headers,
    redirect: 'manual',
  });
  collectCookies(response.headers, jar);
  const buffer = await response.arrayBuffer();
  return {
    status: response.status,
    headers: response.headers,
    url: safeUrl,
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
    currentUrl = resolveAcademyUrl(location, result.url);
    if (!currentUrl) throw new Error('학원 사이트가 허용되지 않은 주소로 이동하려고 했습니다.');
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

function hasHtmlAttribute(tag, name) {
  const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`\\s${escapedName}(?:\\s*=|\\s|/?>)`, 'i').test(tag);
}

function extractSelectValues(selectTag) {
  const openingTag = selectTag.match(/<select\b[^>]*>/i)?.[0] ?? '';
  const selectAttributes = parseAttributes(openingTag);
  if (!selectAttributes.name || hasHtmlAttribute(openingTag, 'disabled')) return [];

  const options = Array.from(selectTag.matchAll(/<option\b[^>]*>([\s\S]*?)<\/option>/gi), (match) => {
    const optionTag = match[0].match(/<option\b[^>]*>/i)?.[0] ?? '';
    const attributes = parseAttributes(optionTag);
    return {
      selected: hasHtmlAttribute(optionTag, 'selected'),
      disabled: hasHtmlAttribute(optionTag, 'disabled'),
      value: attributes.value ?? decodeEntities(match[1].replace(/<[^>]+>/g, '')).trim(),
    };
  }).filter((option) => !option.disabled);

  const selected = options.filter((option) => option.selected);
  const values = selected.length ? selected : options.slice(0, 1);
  return values.map((option) => [selectAttributes.name, option.value]);
}

function extractSuccessfulControls(form) {
  const fields = [];
  const submitters = [];

  for (const match of form.matchAll(/<input\b[^>]*>/gi)) {
    const tag = match[0];
    const attributes = parseAttributes(tag);
    const type = (attributes.type ?? 'text').toLowerCase();
    if (!attributes.name || hasHtmlAttribute(tag, 'disabled')) continue;
    if (['submit', 'image'].includes(type)) {
      if (attributes.name) {
        submitters.push({
          name: attributes.name,
          value: attributes.value ?? '',
          preferred: /등록|제출|저장|확인|upload|submit/i.test(attributes.value ?? ''),
        });
      }
      continue;
    }
    if (['file', 'button', 'reset'].includes(type)) continue;
    if (['checkbox', 'radio'].includes(type) && !hasHtmlAttribute(tag, 'checked')) continue;
    fields.push([attributes.name, attributes.value ?? (['checkbox', 'radio'].includes(type) ? 'on' : '')]);
  }

  for (const match of form.matchAll(/<textarea\b[^>]*>[\s\S]*?<\/textarea>/gi)) {
    const openingTag = match[0].match(/<textarea\b[^>]*>/i)?.[0] ?? '';
    const attributes = parseAttributes(openingTag);
    if (!attributes.name || hasHtmlAttribute(openingTag, 'disabled')) continue;
    const value = match[0].replace(/^<textarea\b[^>]*>/i, '').replace(/<\/textarea>$/i, '');
    fields.push([attributes.name, decodeEntities(value)]);
  }

  for (const match of form.matchAll(/<select\b[^>]*>[\s\S]*?<\/select>/gi)) {
    fields.push(...extractSelectValues(match[0]));
  }

  for (const match of form.matchAll(/<button\b[^>]*>[\s\S]*?<\/button>/gi)) {
    const openingTag = match[0].match(/<button\b[^>]*>/i)?.[0] ?? '';
    const attributes = parseAttributes(openingTag);
    const type = (attributes.type ?? 'submit').toLowerCase();
    if (type !== 'submit' || !attributes.name || hasHtmlAttribute(openingTag, 'disabled')) continue;
    const label = decodeEntities(match[0].replace(/^<button\b[^>]*>/i, '').replace(/<\/button>$/i, '').replace(/<[^>]+>/g, ' ')).trim();
    submitters.push({
      name: attributes.name,
      value: attributes.value ?? label,
      preferred: /등록|제출|저장|확인|upload|submit/i.test(`${attributes.value ?? ''} ${label}`),
    });
  }

  const submitter = submitters.find((candidate) => candidate.preferred) ?? submitters[0];
  if (submitter) fields.push([submitter.name, submitter.value]);

  return fields;
}

function extractStaticFieldAssignments(html, fieldNames) {
  const knownNames = new Map(fieldNames.map((name) => [name.toLowerCase(), name]));
  const candidates = new Map();
  const add = (name, value) => {
    const actualName = knownNames.get(String(name ?? '').toLowerCase());
    if (!actualName) return;
    if (!candidates.has(actualName)) candidates.set(actualName, new Set());
    candidates.get(actualName).add(decodeScriptString(value));
  };

  const source = String(html ?? '');
  const propertyPattern = /\b([A-Za-z_$][\w$]*)\.value\s*=\s*(["'])([^"']*)\2/gi;
  const idPattern = /getElementById\(\s*(["'])([^"']+)\1\s*\)\.value\s*=\s*(["'])([^"']*)\3/gi;
  const jqueryIdPattern = /\$\(\s*(["'])#([^"']+)\1\s*\)\.val\(\s*(["'])([^"']*)\3\s*\)/gi;
  let match;
  while ((match = propertyPattern.exec(source))) add(match[1], match[3]);
  while ((match = idPattern.exec(source))) add(match[2], match[4]);
  while ((match = jqueryIdPattern.exec(source))) add(match[2], match[4]);

  return new Map(
    [...candidates].flatMap(([name, values]) => (values.size === 1 ? [[name, [...values][0]]] : [])),
  );
}

export function extractUploadForm(html) {
  const forms = Array.from(String(html).matchAll(/<form\b[^>]*>[\s\S]*?<\/form>/gi), (match) => match[0]);
  const selected =
    forms.find((form) => /type\s*=\s*["']?file/i.test(form)) ??
    forms.find((form) => /m_sr01_form_proc\.asp/i.test(form)) ??
    String(html);
  const openingTag = selected.match(/<form\b[^>]*>/i)?.[0] ?? '';
  const formAttributes = parseAttributes(openingTag);
  let fields = extractSuccessfulControls(selected);
  const assignedValues = extractStaticFieldAssignments(
    html,
    fields.map(([name]) => name),
  );
  fields = fields.map(([name, value]) => [name, value || assignedValues.get(name) || '']);
  let fileField = '';

  for (const match of selected.matchAll(/<input\b[^>]*>/gi)) {
    const attributes = parseAttributes(match[0]);
    const type = (attributes.type ?? 'text').toLowerCase();
    if (type === 'file' && attributes.name && !fileField) fileField = attributes.name;
  }

  let action = UPLOAD_PROC_URL;
  if (formAttributes.action) {
    action = resolveAcademyUrl(formAttributes.action, UPLOAD_FORM_URL) || action;
  }

  return {
    action,
    method: (formAttributes.method || 'get').toLowerCase(),
    enctype: (formAttributes.enctype || '').toLowerCase(),
    fileField,
    fields,
  };
}

function extractAlert(html) {
  const match = String(html).match(/alert\s*\(\s*(["'])([\s\S]{0,500}?)\1\s*\)/i);
  return match ? decodeEntities(match[2].replace(/\\n/g, ' ').replace(/\\(["'])/g, '$1')).trim() : '';
}

function decodeScriptString(value) {
  return decodeEntities(String(value ?? ''))
    .replace(/\\u([0-9a-f]{4})/gi, (_, code) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/\\x([0-9a-f]{2})/gi, (_, code) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/\\r\\n|\\n|\\r|\\t/g, ' ')
    .replace(/\\(["'\\/])/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractScriptVariable(html, name) {
  const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const doubleQuoted = new RegExp(
    `(?:var\\s+)?${escapedName}\\s*=\\s*"((?:\\\\.|[^"\\\\])*)"`,
    'i',
  );
  const singleQuoted = new RegExp(
    `(?:var\\s+)?${escapedName}\\s*=\\s*'((?:\\\\.|[^'\\\\])*)'`,
    'i',
  );
  const source = String(html ?? '');
  const match = source.match(doubleQuoted) ?? source.match(singleQuoted);
  return match ? decodeScriptString(match[1]) : null;
}

function extractPageTitle(html) {
  const match = String(html ?? '').match(/<title\b[^>]*>([\s\S]*?)<\/title>/i);
  return match ? decodeEntities(match[1].replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim() : '';
}

function extractScriptRedirectUrls(html, baseUrl = UPLOAD_FORM_URL) {
  const urls = [];
  const pattern = /(?:location(?:\.href|\.replace)?|window\.location)\s*(?:=|\()\s*(["'])([^"']+)\1/gi;
  let match;
  while ((match = pattern.exec(String(html ?? ''))) && urls.length < 3) {
    const resolved = resolveAcademyUrl(decodeEntities(match[2]), baseUrl);
    if (resolved) urls.push(resolved);
  }
  return [...new Set(urls)];
}

function extractScriptLocations(html, baseUrl = UPLOAD_FORM_URL) {
  return extractScriptRedirectUrls(html, baseUrl).map((value) => {
    const url = new URL(value);
    return `${url.pathname}${url.search}`;
  });
}

export function extractRecordCodes(html) {
  const source = decodeEntities(String(html ?? '')).replace(/%5f/gi, '_');
  const codes = new Set();
  const patterns = [
    /[?&]rfi_code=([^&#"'\s<>]+)/gi,
    /\brfi_code\s*[:=]\s*(["'])([^"']+)\1/gi,
  ];
  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(source))) {
      const rawValue = match[2] ?? match[1] ?? '';
      let value = rawValue;
      try {
        value = decodeURIComponent(rawValue);
      } catch {
        // Keep the raw legacy ASP value when it contains an incomplete percent escape.
      }
      value = value.trim();
      if (value) codes.add(value);
    }
  }
  return codes;
}

function hasNewRecord(beforeHtml, afterHtml) {
  const before = extractRecordCodes(beforeHtml);
  return [...extractRecordCodes(afterHtml)].some((code) => !before.has(code));
}

function redactDiagnostic(value, secrets, maxLength = 180) {
  let text = String(value ?? '').replace(/\s+/g, ' ').trim();
  for (const secret of secrets) {
    if (secret) text = text.replaceAll(String(secret), '[숨김]');
  }
  return text.slice(0, maxLength);
}

function responseScriptSource(html) {
  return Array.from(String(html ?? '').matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi), (match) => match[1])
    .join(' ')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|\s)\/\/[^\r\n]*/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

function formDataDiagnostic(formData, fileField, secrets) {
  const values = {};
  for (const [name, value] of formData) {
    if (value instanceof File) {
      values[name] = `[파일 ${value.name}, ${value.size}바이트]`;
    } else {
      values[name] = redactDiagnostic(value, secrets, 100);
    }
  }
  if (!values[fileField]) values[fileField] = '[파일 없음]';
  return values;
}

function makeUploadDiagnostic(submitted, uploadForm, outgoing, secrets, listBaseline, resultPage) {
  const finalUrl = new URL(submitted.url);
  const resultUrl = resultPage ? new URL(resultPage.url) : null;
  const beforeCodes = [...extractRecordCodes(listBaseline)].slice(0, 12);
  const afterCodes = resultPage ? [...extractRecordCodes(resultPage.text)].slice(0, 12) : [];
  return {
    status: submitted.status,
    path: `${finalUrl.pathname}${finalUrl.search}`,
    responseLength: submitted.text.length,
    title: redactDiagnostic(extractPageTitle(submitted.text), secrets),
    alert: redactDiagnostic(extractAlert(submitted.text), secrets),
    errorCode: redactDiagnostic(extractScriptVariable(submitted.text, 'strErrCode'), secrets),
    message: redactDiagnostic(extractScriptVariable(submitted.text, 'strMsg'), secrets),
    locations: extractScriptLocations(submitted.text, submitted.url),
    fileField: uploadForm.fileField,
    fields: [...new Set(uploadForm.fields.map(([name]) => name))].slice(0, 24),
    fieldValues: formDataDiagnostic(outgoing, uploadForm.fileField, secrets),
    responseScript: redactDiagnostic(responseScriptSource(submitted.text), secrets, 700),
    listBeforeCodes: beforeCodes,
    listAfterCodes: afterCodes,
    resultPath: resultUrl ? `${resultUrl.pathname}${resultUrl.search}` : '',
    resultLength: resultPage?.text?.length ?? 0,
  };
}

export function extractLoginFailure(html) {
  const errorCode = extractScriptVariable(html, 'strErrCode');
  if (errorCode !== null) {
    if (!errorCode) return '';
    const message = extractScriptVariable(html, 'strMsg');
    return message || `로그인에 실패했습니다. (${errorCode})`;
  }

  const alertMessage = extractAlert(html);
  return isFailureMessage(alertMessage) ? alertMessage : '';
}

export function looksLikeLoginPage(html) {
  const fieldNames = new Set();
  for (const match of String(html ?? '').matchAll(/<input\b[^>]*>/gi)) {
    const attributes = parseAttributes(match[0]);
    if (attributes.name) fieldNames.add(attributes.name.toLowerCase());
  }
  return fieldNames.has('txtmb_id') && fieldNames.has('txtmb_pw');
}

export function containsLoginRequiredMessage(html) {
  const text = decodeEntities(
    String(html ?? '')
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' '),
  ).replace(/\s+/g, ' ');
  return (
    /로그인\s*후\s*이용해\s*주십시오/.test(text) ||
    /로그인\s*후\s*이용해\s*주십시오/.test(extractAlert(html))
  );
}

function isFailureMessage(message) {
  return /(실패|오류|잘못|없습니다|확인.*(?:아이디|비밀번호)|로그인.*(?:필요|해)|invalid|failed|error)/i.test(message);
}

function visiblePageText(html) {
  return decodeEntities(
    String(html ?? '')
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' '),
  )
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeForMatch(value) {
  return decodeEntities(String(value ?? ''))
    .normalize('NFC')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

export function pageContainsFileName(html, fileName) {
  const expected = normalizeForMatch(fileName);
  if (!expected) return false;
  const sources = [String(html ?? ''), visiblePageText(html)];
  try {
    sources.push(decodeURIComponent(String(html ?? '').replace(/\+/g, '%20')));
  } catch {
    // Malformed percent escapes are common in old ASP pages; raw HTML is still checked.
  }
  return sources.some((source) => normalizeForMatch(source).includes(expected));
}

export function extractSubmissionSuccess(html) {
  const candidates = [extractAlert(html), visiblePageText(html)].filter(Boolean);
  return (
    candidates.find((message) =>
      /(?:(?:제출|등록|저장|업로드).{0,24}(?:완료|성공|되었습니다|되었)|정상적으로.{0,24}(?:처리|제출|등록|저장|업로드))/i.test(
        message,
      ),
    ) ?? ''
  );
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
    const loginPage = await fetchFollowingRedirects(
      LOGIN_PAGE_URL,
      { method: 'GET', headers: { accept: 'text/html,application/xhtml+xml' } },
      jar,
    );
    if (loginPage.status >= 400) {
      throw new Error(`로그인 페이지를 불러오지 못했습니다. (${loginPage.status})`);
    }
    addConfiguredCookies(jar, studentId, password, env);

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
        headers: {
          accept: 'text/html,application/xhtml+xml',
          'content-type': 'application/x-www-form-urlencoded',
          origin: new URL(LOGIN_URL).origin,
          referer: LOGIN_PAGE_URL,
        },
        body: loginBody.toString(),
      },
      jar,
    );

    if (login.status >= 400) throw new Error(`로그인 서버가 오류를 반환했습니다. (${login.status})`);
    const loginFailure = extractLoginFailure(login.text);
    if (loginFailure) throw new Error(loginFailure);

    const uploadPage = await fetchFollowingRedirects(
      UPLOAD_FORM_URL,
      { method: 'GET', headers: { referer: LOGIN_URL } },
      jar,
    );
    if (uploadPage.status >= 400) {
      throw new Error(`제출 화면을 불러오지 못했습니다. (${uploadPage.status})`);
    }
    if (containsLoginRequiredMessage(uploadPage.text) || looksLikeLoginPage(uploadPage.text)) {
      throw new Error('학원 로그인 세션이 만들어지지 않았습니다. ID와 비밀번호를 확인해 주세요.');
    }

    const uploadForm = extractUploadForm(uploadPage.text);
    if (!uploadForm.fileField) {
      throw new Error('학원 제출 화면에서 파일 선택 항목을 찾지 못했습니다. 제출 화면이 변경되었을 수 있습니다.');
    }
    if (uploadForm.method !== 'post') {
      throw new Error('학원 제출 화면의 전송 방식이 POST가 아닙니다. 제출 화면이 변경되었을 수 있습니다.');
    }
    const outgoing = new FormData();
    uploadForm.fields.forEach(([name, value]) => outgoing.append(name, value));
    const remoteFileNameField = uploadForm.fields.find(([name]) => name.toLowerCase() === 'rfi_filename')?.[0];
    if (remoteFileNameField) outgoing.set(remoteFileNameField, fileName);
    outgoing.set(uploadForm.fileField, file, fileName);

    const listBeforeSubmission = await fetchFollowingRedirects(
      UPLOAD_LIST_URL,
      { method: 'GET', headers: { referer: UPLOAD_FORM_URL } },
      jar,
    );
    const usableListBaseline =
      listBeforeSubmission.status < 400 &&
      !containsLoginRequiredMessage(listBeforeSubmission.text) &&
      !looksLikeLoginPage(listBeforeSubmission.text)
        ? listBeforeSubmission.text
        : '';

    const submitted = await fetchFollowingRedirects(
      uploadForm.action || UPLOAD_PROC_URL,
      {
        method: 'POST',
        headers: { origin: new URL(UPLOAD_FORM_URL).origin, referer: UPLOAD_FORM_URL },
        body: outgoing,
      },
      jar,
    );
    if (submitted.status >= 400) throw new Error(`제출 서버가 오류를 반환했습니다. (${submitted.status})`);
    if (containsLoginRequiredMessage(submitted.text) || looksLikeLoginPage(submitted.text)) {
      throw new Error('로그인 상태가 유지되지 않았습니다. 다시 시도해 주세요.');
    }

    const remoteMessage = extractAlert(submitted.text);
    if (isFailureMessage(remoteMessage)) throw new Error(remoteMessage);

    let confirmedMessage = extractSubmissionSuccess(submitted.text);
    let fileConfirmed = pageContainsFileName(submitted.text, fileName);
    let newRecordConfirmed = false;
    let resultPage = null;
    const scriptRedirect = extractScriptRedirectUrls(submitted.text, submitted.url)[0];
    if (!confirmedMessage && !fileConfirmed && scriptRedirect) {
      const redirectedPage = await fetchFollowingRedirects(
        scriptRedirect,
        { method: 'GET', headers: { referer: submitted.url } },
        jar,
      );
      resultPage = redirectedPage;
      if (containsLoginRequiredMessage(redirectedPage.text) || looksLikeLoginPage(redirectedPage.text)) {
        throw new Error('제출 결과를 확인하는 중 로그인 상태가 해제되었습니다.');
      }
      confirmedMessage = extractSubmissionSuccess(redirectedPage.text);
      fileConfirmed = pageContainsFileName(redirectedPage.text, fileName);
      newRecordConfirmed = Boolean(usableListBaseline) && hasNewRecord(usableListBaseline, redirectedPage.text);
    }
    if (!confirmedMessage && !fileConfirmed && !newRecordConfirmed) {
      const verificationPage = await fetchFollowingRedirects(
        UPLOAD_FORM_URL,
        { method: 'GET', headers: { referer: submitted.url } },
        jar,
      );
      if (containsLoginRequiredMessage(verificationPage.text) || looksLikeLoginPage(verificationPage.text)) {
        throw new Error('제출 후 로그인 상태가 해제되어 파일 등록을 확인하지 못했습니다.');
      }
      fileConfirmed = pageContainsFileName(verificationPage.text, fileName);
    }

    if (!confirmedMessage && !fileConfirmed && !newRecordConfirmed) {
      const diagnostic = makeUploadDiagnostic(
        submitted,
        uploadForm,
        outgoing,
        [studentId, password],
        usableListBaseline,
        resultPage,
      );
      console.warn('Academy upload was not confirmed', {
        ...diagnostic,
      });
      const unconfirmedError = new Error(
        '학원 서버에서 파일 등록 완료를 확인하지 못했습니다. 실제 등록이 확인되지 않아 성공으로 처리하지 않았습니다.',
      );
      unconfirmedError.diagnostic = diagnostic;
      throw unconfirmedError;
    }

    return json({
      ok: true,
      fileName,
      message: confirmedMessage || `${fileName} 파일 등록이 확인되었습니다.`,
    });
  } catch (error) {
    console.error('Writing submission failed', error instanceof Error ? error.message : error);
    return json(
      {
        ok: false,
        message: error instanceof Error ? error.message : '제출 중 오류가 발생했습니다.',
        ...(error?.diagnostic ? { diagnostic: error.diagnostic } : {}),
      },
      502,
    );
  }
}

export function onRequestGet() {
  return json({ ok: false, message: 'POST 요청만 사용할 수 있습니다.' }, 405);
}
