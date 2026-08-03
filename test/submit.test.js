import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  containsLoginRequiredMessage,
  extractClientRedirect,
  extractUploadForm,
  looksLikeLoginPage,
  onRequestPost,
} from '../functions/api/submit.js';

function upstreamResponse(body, { status = 200, headers = {}, cookies = [] } = {}) {
  const responseHeaders = new Headers(headers);
  cookies.forEach((cookie) => responseHeaders.append('set-cookie', cookie));
  return new Response(body, { status, headers: responseHeaders });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('remote upload form extraction', () => {
  it('keeps hidden fields and detects the DOCX input name', () => {
    const form = extractUploadForm(`
      <form method="post" action="m_sr01_form_proc.asp">
        <input type="hidden" name="mode" value="write">
        <input name="teacher" type="hidden" value="A&amp;B">
        <input type="file" name="strFile">
      </form>
    `);

    expect(form.action).toBe(
      'https://m10.hakwonsarang.co.kr/m/acam_module/SED3/m_sr01_form_proc.asp',
    );
    expect(form.fileField).toBe('strFile');
    expect(form.hiddenFields).toEqual([
      ['mode', 'write'],
      ['teacher', 'A&B'],
    ]);
  });

  it('uses the explicit fallback when the remote page does not expose a file field', () => {
    const form = extractUploadForm('<html><body>empty</body></html>');
    expect(form.fileField).toBe('file1');
  });

  it('accepts an explicit form action on the academy host', () => {
    const form = extractUploadForm(`
      <form method="post" action="https://m10.hakwonsarang.co.kr/m/acam_module/SED3/m_sr01_form_proc.asp">
        <input type="file" name="file1">
      </form>
    `);
    expect(form.action).toBe(
      'https://m10.hakwonsarang.co.kr/m/acam_module/SED3/m_sr01_form_proc.asp',
    );
  });
});

describe('academy login response detection', () => {
  it('requires both credential fields before treating a page as the login form', () => {
    expect(looksLikeLoginPage('<a href="login_proc.asp">로그인</a>')).toBe(false);
    expect(
      looksLikeLoginPage(`
        <form action="login_proc.asp">
          <input type="text" name="txtmb_id">
          <input name="txtmb_pw" type="password">
        </form>
      `),
    ).toBe(true);
  });

  it('detects the upload page login-required message despite tags and whitespace', () => {
    expect(containsLoginRequiredMessage('<div>로그인 후 <b>이용해</b> 주십시오</div>')).toBe(true);
    expect(containsLoginRequiredMessage(`<script>alert('로그인 후 이용해 주십시오')</script>`)).toBe(true);
    expect(containsLoginRequiredMessage('<div>파일을 올려 주십시오</div>')).toBe(false);
  });

  it('follows only academy client-side redirects', () => {
    expect(
      extractClientRedirect(
        `<script>window.location.href='/m/acam_module/SED3/m_sr01_form.asp';</script>`,
        'https://m10.hakwonsarang.co.kr/m/start.asp',
      ),
    ).toBe('https://m10.hakwonsarang.co.kr/m/acam_module/SED3/m_sr01_form.asp');
    expect(
      extractClientRedirect(`<script>location.replace('https://example.com/steal')</script>`),
    ).toBe('');
  });
});

describe('academy login cookie flow', () => {
  it('creates a fresh session before login and carries it to the m10 upload form', async () => {
    const calls = [];
    const fetchMock = vi.fn(async (url, init) => {
      calls.push({ url: String(url), init, headers: new Headers(init.headers) });
      switch (calls.length) {
        case 1:
          return upstreamResponse('<html>login page</html>', {
            cookies: [
              'H2=fresh-route; Path=/; HttpOnly',
              'ASPSESSIONIDFRESH=fresh-session; Path=/',
            ],
          });
        case 2:
          return upstreamResponse(
            `<script>window.location.href='https://m10.hakwonsarang.co.kr/m/home.asp';</script>`,
            { cookies: ['academyAuth=logged-in; Path=/'] },
          );
        case 3:
          return upstreamResponse('<html>home</html>');
        case 4:
          return upstreamResponse(`
            <form method="post" action="m_sr01_form_proc.asp">
              <input type="hidden" name="mode" value="write">
              <input type="file" name="strFile">
            </form>
          `);
        case 5:
          return upstreamResponse(`<script>alert('제출되었습니다.')</script>`);
        default:
          throw new Error(`Unexpected fetch ${calls.length}: ${url}`);
      }
    });
    vi.stubGlobal('fetch', fetchMock);

    const input = new FormData();
    input.set('studentId', 'student@example');
    input.set('password', 'correct password');
    input.set('fileName', '작문 파일 format.docx');
    input.set(
      'file',
      new File([new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x01])], 'writing.docx', {
        type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      }),
    );
    const request = new Request('https://eunjaewriting.pages.dev/api/submit', {
      method: 'POST',
      body: input,
    });
    const env = {
      ACADEMY_CONFIGURED_COOKIES_JSON: JSON.stringify([
        { name: 'ASPSESSIONIDSTALE', value: 'stale-session' },
        { name: 'H2', value: 'stale-route' },
        { name: 'SED3', value: 'branch-state' },
        { name: 'ml1m1', value: '{{ID}}' },
        { name: 'ml2m2', value: '{{PASSWORD}}' },
      ]),
    };

    const response = await onRequestPost({ request, env });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, message: '제출되었습니다.' });

    expect(calls.map((call) => [call.url, call.init.method])).toEqual([
      ['https://m10.hakwonsarang.co.kr/m/m_login.asp', 'GET'],
      ['https://m10.hakwonsarang.co.kr/m/login_proc.asp', 'POST'],
      ['https://m10.hakwonsarang.co.kr/m/home.asp', 'GET'],
      ['https://m10.hakwonsarang.co.kr/m/acam_module/SED3/m_sr01_form.asp', 'GET'],
      ['https://m10.hakwonsarang.co.kr/m/acam_module/SED3/m_sr01_form_proc.asp', 'POST'],
    ]);

    expect(calls[0].headers.get('cookie')).toBeNull();
    const loginCookies = calls[1].headers.get('cookie');
    expect(loginCookies).toContain('H2=fresh-route');
    expect(loginCookies).toContain('ASPSESSIONIDFRESH=fresh-session');
    expect(loginCookies).toContain('SED3=branch-state');
    expect(loginCookies).toContain('ml1m1=student@example');
    expect(loginCookies).toContain('ml2m2=correct%20password');
    expect(loginCookies).not.toContain('stale-session');
    expect(loginCookies).not.toContain('stale-route');
    expect(calls[1].headers.get('referer')).toBe('https://m10.hakwonsarang.co.kr/m/m_login.asp');

    const uploadCookies = calls[3].headers.get('cookie');
    expect(uploadCookies).toContain('ASPSESSIONIDFRESH=fresh-session');
    expect(uploadCookies).toContain('academyAuth=logged-in');
    expect(calls[4].headers.get('origin')).toBe('https://m10.hakwonsarang.co.kr');
  });
});
