import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  containsLoginRequiredMessage,
  extractChapterValues,
  extractGradeTerms,
  extractLoginFailure,
  extractRecordCodes,
  extractSubmissionSuccess,
  extractUploadForm,
  looksLikeLoginPage,
  onRequestPost,
  pageContainsFileName,
} from '../functions/api/submit.js';

function upstreamResponse(body, { status = 200, headers = {}, cookies = [] } = {}) {
  const responseHeaders = new Headers(headers);
  cookies.forEach((cookie) => responseHeaders.append('set-cookie', cookie));
  return new Response(body, { status, headers: responseHeaders });
}

async function multipartText(call) {
  return call.init.body instanceof Uint8Array
    ? new TextDecoder().decode(call.init.body)
    : call.init.body.text();
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
    expect(form.fields).toEqual([
      ['mode', 'write'],
      ['teacher', 'A&B'],
    ]);
    expect(form.controlOrder.map((control) => `${control.kind}:${control.name}`)).toEqual([
      'field:mode',
      'field:teacher',
      'file:strFile',
    ]);
    expect(form.method).toBe('post');
  });

  it('does not guess a file field when the remote page does not expose one', () => {
    const form = extractUploadForm('<html><body>empty</body></html>');
    expect(form.fileField).toBe('');
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

  it('keeps successful non-file controls just like browser FormData', () => {
    const form = extractUploadForm(`
      <form method="post" enctype="multipart/form-data">
        <input type="hidden" name="mode" value="write">
        <input type="text" name="subject" value="Writing 1">
        <input type="checkbox" name="notice" value="Y" checked>
        <input type="checkbox" name="ignored" value="Y">
        <textarea name="memo">A&amp;B</textarea>
        <select name="category"><option value="one">1</option><option value="two" selected>2</option></select>
        <input type="file" name="upfile">
        <button type="submit" name="action" value="save">취소</button>
        <button type="submit" name="action" value="upload">등록</button>
      </form>
    `);
    expect(form.fields).toEqual([
      ['mode', 'write'],
      ['subject', 'Writing 1'],
      ['notice', 'Y'],
      ['memo', 'A&B'],
      ['category', 'two'],
      ['action', 'upload'],
    ]);
    expect(form.selectDiagnostics.category).toEqual([
      { value: 'one', text: '1', selected: false },
      { value: 'two', text: '2', selected: true },
    ]);
    expect(form.controlOrder.map((control) => `${control.kind}:${control.name}`)).toEqual([
      'field:mode',
      'field:subject',
      'field:notice',
      'field:memo',
      'field:category',
      'file:upfile',
    ]);
  });

  it('extracts dynamic select actions and ASP request paths', () => {
    const form = extractUploadForm(`
      <form method="post">
        <select name="selGtCode" onchange="GetChapter(this.value)"><option value="">선택</option></select>
        <input type="file" name="rfi_file">
      </form>
      <script>
        function GetChapter(pVal) { $.get('/LMS/SED3/GetGradeTermChapter.asp', { pGtCode: pVal }); }
      </script>
    `);
    expect(form.selectActions).toEqual({ selGtCode: ['GetChapter(this.value)'] });
    expect(form.requestHints).toContain('/LMS/SED3/GetGradeTermChapter.asp');
  });

  it('parses the academy grade-term XML records', () => {
    expect(
      extractGradeTerms(`
        <root>
          <rs><gt_code>GT2026</gt_code><tk_name><![CDATA[Writing]]></tk_name><tl_name>66B</tl_name><gt_startymd>2026-01-01</gt_startymd><gt_endymd>2026-12-31</gt_endymd></rs>
        </root>
      `),
    ).toEqual([
      {
        code: 'GT2026',
        book: 'Writing',
        level: '66B',
        start: '2026-01-01',
        end: '2026-12-31',
      },
    ]);
  });

  it('parses chapter values from options or XML records', () => {
    expect(extractChapterValues('<option value="">선택</option><option value="12">12회</option>')).toEqual(['12']);
    expect(extractChapterValues('<root><rs><gtc_chapter>13</gtc_chapter></rs></root>')).toEqual(['13']);
  });

});

describe('academy upload confirmation', () => {
  it('only recognizes explicit completion messages', () => {
    expect(extractSubmissionSuccess(`<script>alert('파일이 정상적으로 등록되었습니다.')</script>`)).toContain(
      '등록되었습니다',
    );
    expect(extractSubmissionSuccess('<html><body>작문 파일 등록 화면</body></html>')).toBe('');
  });

  it('extracts record codes from links and script values', () => {
    expect(
      [...extractRecordCodes(`
        <a href="m_sr01_view.asp?rfi_code=R100&amp;page=1">첫 파일</a>
        <script>var rfi_code = 'R101';</script>
      `)],
    ).toEqual(['R100', 'R101']);
    expect([...extractRecordCodes(`<script>url += '?rfi_code=' + pRfiCode;</script>`)]).toEqual([]);
  });

  it('finds the exact uploaded filename in text or an encoded link', () => {
    expect(pageContainsFileName('<a>3반_홍길동_2회_작문.docx</a>', '3반_홍길동_2회_작문.docx')).toBe(true);
    expect(
      pageContainsFileName(
        '<a href="download.asp?name=%EC%9E%91%EB%AC%B8%20%ED%8C%8C%EC%9D%BC%20format.docx">받기</a>',
        '작문 파일 format.docx',
      ),
    ).toBe(true);
    expect(pageContainsFileName('<div>다른 파일.docx</div>', '작문 파일 format.docx')).toBe(false);
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

  it('uses strErrCode instead of an alert inside an unexecuted branch', () => {
    const successResponse = `
      <script>
        var strMsg = "";
        var strErrCode = "";
        if (strErrCode!="") {
          alert("Error: Wrong Data");
          location.href="m_login.asp?acamcode=SED3";
        } else {
          location.href="/m/acam_module/SED3/m_sr01_form.asp";
        }
      </script>
    `;
    expect(extractLoginFailure(successResponse)).toBe('');
  });

  it('returns the detailed upstream login error when strErrCode is set', () => {
    const failureResponse = `
      <script>
        var strMsg = "등록된 아이디가 없습니다.\\n\\n아이디를 확인하신 후 다시 로그인 해주십시오.";
        var strErrCode = "NoneID";
        if (strErrCode!="") alert("Error: Wrong Data");
      </script>
    `;
    expect(extractLoginFailure(failureResponse)).toBe(
      '등록된 아이디가 없습니다. 아이디를 확인하신 후 다시 로그인 해주십시오.',
    );
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
            `<script>
              var strMsg = "";
              var strErrCode = "";
              if (strErrCode!="") {
                alert("Error: Wrong Data");
                location.href="m_login.asp?acamcode=SED3";
              }
            </script>`,
            { cookies: ['academyAuth=logged-in; Path=/'] },
          );
        case 3:
          return upstreamResponse(`
            <form method="post" action="m_sr01_form_proc.asp">
              <input type="hidden" name="mode" value="write">
              <input type="file" name="strFile">
            </form>
          `);
        case 4:
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

    const uploadCookies = calls[2].headers.get('cookie');
    expect(uploadCookies).toContain('ASPSESSIONIDFRESH=fresh-session');
    expect(uploadCookies).toContain('academyAuth=logged-in');
    expect(calls[3].headers.get('origin')).toBe('https://m10.hakwonsarang.co.kr');
    const firstMultipart = await multipartText(calls[3]);
    expect(firstMultipart).toContain('name="mode"\r\n\r\nwrite');
    expect(firstMultipart).toContain('name="strFile"; filename="작문 파일 format.docx"');
    expect(calls[3].init.body).toBeInstanceOf(Uint8Array);
    expect(new Headers(calls[3].init.headers).get('content-type')).toMatch(
      /^multipart\/form-data; boundary=----WebKitFormBoundary/,
    );
  });

  it('follows the real JavaScript list redirect and confirms a new record', async () => {
    const calls = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url, init) => {
        calls.push({ url: String(url), init });
        switch (calls.length) {
          case 1:
            return upstreamResponse('<html>login</html>', { cookies: ['ASPSESSIONIDFRESH=x; Path=/'] });
          case 2:
            return upstreamResponse('<script>var strMsg=""; var strErrCode="";</script>');
          case 3:
            return upstreamResponse(`
              <form method="post" enctype="multipart/form-data" action="m_sr01_form_proc.asp">
                <input type="hidden" name="rfi_code" value="">
                <input type="hidden" name="procType" value="I">
                <input type="hidden" name="rfi_filename" value="">
                <input type="file" name="rfi_file">
              </form>
            `);
          case 4:
            return upstreamResponse(`<script>location.href='/m/acam_module/SED3/m_sr01.asp';</script>`);
          case 5:
            return upstreamResponse('<a href="m_sr01_view.asp?rfi_code=R101">작문 파일 format.docx</a>');
          default:
            throw new Error(`Unexpected fetch ${calls.length}: ${url}`);
        }
      }),
    );

    const input = new FormData();
    input.set('studentId', 'student');
    input.set('password', 'password');
    input.set('fileName', '작문 파일 format.docx');
    input.set(
      'file',
      new File([new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x01])], 'writing.docx', {
        type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      }),
    );
    const response = await onRequestPost({
      request: new Request('https://eunjaewriting.pages.dev/api/submit', { method: 'POST', body: input }),
      env: {},
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, fileName: '작문 파일 format.docx' });
    expect(calls.map((call) => [call.url, call.init.method])).toEqual([
      ['https://m10.hakwonsarang.co.kr/m/m_login.asp', 'GET'],
      ['https://m10.hakwonsarang.co.kr/m/login_proc.asp', 'POST'],
      ['https://m10.hakwonsarang.co.kr/m/acam_module/SED3/m_sr01_form.asp', 'GET'],
      ['https://m10.hakwonsarang.co.kr/m/acam_module/SED3/m_sr01_form_proc.asp', 'POST'],
      ['https://m10.hakwonsarang.co.kr/m/acam_module/SED3/m_sr01.asp', 'GET'],
    ]);
    const redirectedMultipart = await multipartText(calls[3]);
    expect(redirectedMultipart).toContain('C:\\fakepath\\작문 파일 format.docx');
    expect(redirectedMultipart).toContain('name="rfi_file"; filename="작문 파일 format.docx"');
    expect(redirectedMultipart).toContain(
      'Content-Type: application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    );
  });

  it('loads and selects the academy grade term before uploading', async () => {
    const calls = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url, init) => {
        calls.push({ url: String(url), init });
        switch (calls.length) {
          case 1:
            return upstreamResponse('<html>login</html>', { cookies: ['ASPSESSIONIDFRESH=x; Path=/'] });
          case 2:
            return upstreamResponse('<script>var strMsg=""; var strErrCode="";</script>');
          case 3:
            return upstreamResponse(`
              <form method="post" enctype="multipart/form-data" action="m_sr01_form_proc.asp">
                <input type="hidden" name="rfi_code" value="">
                <input type="hidden" name="procType" value="">
                <input type="hidden" name="rfi_filename" value="">
                <select name="selCaClass">
                  <option value="7963|C|1020178|C|0000006700000000|C|0000006700000002">66B2(26)-고미성T 7:00</option>
                  <option value="8032|C|1020178|C|0000003800000000|C|0000003800000001">작문-초6(26)</option>
                </select>
                <select name="selGtCode" onchange="GetTermChapter(this.options[selectedIndex].value)"><option value="">선택</option></select>
                <select name="sel_gtc_chapter"><option value="">선택</option></select>
                <select name="sel_rfiType"><option value="A">선행</option><option value="B">재시</option></select>
                <input type="file" name="rfi_file">
              </form>
              <script>
                function GetClassGradeTerm(pVal) { return '/LMS/SED3/GetClassGradeTerm.asp'; }
                function GetTermChapter(pVal) { return '/LMS/SED3/GetTermChapter.asp'; }
              </script>
            `);
          case 4:
            return upstreamResponse(`
              <root><rs><gt_code>2544</gt_code><tk_name>Writing</tk_name><tl_name>6</tl_name><gt_startymd>2026-01-01</gt_startymd><gt_endymd>2026-12-31</gt_endymd></rs></root>
            `);
          case 5:
            return upstreamResponse('<root><rs><gtc_chapter>17</gtc_chapter></rs><rs><gtc_chapter>18</gtc_chapter></rs><rs><gtc_chapter>19</gtc_chapter></rs><rs><gtc_chapter>20</gtc_chapter></rs></root>');
          case 6:
            return upstreamResponse(`<script>location.href='/m/acam_module/SED3/m_sr01.asp';</script>`);
          case 7:
            return upstreamResponse('<a href="m_sr01_view.asp?rfi_code=R101">작문 파일 format.docx</a>');
          default:
            throw new Error(`Unexpected fetch ${calls.length}: ${url}`);
        }
      }),
    );

    const input = new FormData();
    input.set('studentId', 'student');
    input.set('password', 'password');
    input.set('className', '66B2');
    input.set('round', '20');
    input.set('rfiType', 'B');
    input.set('fileName', '작문 파일 format.docx');
    input.set(
      'file',
      new File([new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x01])], 'writing.docx', {
        type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      }),
    );

    const response = await onRequestPost({
      request: new Request('https://eunjaewriting.pages.dev/api/submit', { method: 'POST', body: input }),
      env: {},
    });

    expect(response.status).toBe(200);
    expect(calls[3].url).toBe(
      'https://m10.hakwonsarang.co.kr/LMS/SED3/GetClassGradeTerm.asp?pClCode=8032&pGrade=1020178&pCg1=0000003800000000&pCg2=0000003800000001',
    );
    expect(new Headers(calls[3].init.headers).get('cookie')).toContain('ASPSESSIONIDFRESH=x');
    expect(calls[4].url).toBe(
      'https://m10.hakwonsarang.co.kr/LMS/SED3/GetTermChapter.asp?pGtCode=2544',
    );
    const hydratedMultipart = await multipartText(calls[5]);
    expect(hydratedMultipart).toContain('name="procType"\r\n\r\nI');
    expect(hydratedMultipart).toContain(
      'name="selCaClass"\r\n\r\n8032|C|1020178|C|0000003800000000|C|0000003800000001',
    );
    expect(hydratedMultipart).toContain('name="selGtCode"\r\n\r\n2544');
    expect(hydratedMultipart).toContain('name="sel_gtc_chapter"\r\n\r\n20');
    expect(hydratedMultipart).toContain('name="sel_rfiType"\r\n\r\nB');
    expect(hydratedMultipart).toContain('filename="작문 파일 format.docx"');
    expect(new Headers(calls[5].init.headers).get('user-agent')).toContain('Windows NT 10.0');
  });

  it('does not report success for an unconfirmed HTTP 200 upload response', async () => {
    let call = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        call += 1;
        if (call === 1) return upstreamResponse('<html>login page</html>', { cookies: ['ASPSESSIONIDFRESH=x; Path=/'] });
        if (call === 2) return upstreamResponse('<script>var strMsg=""; var strErrCode="";</script>');
        if (call === 3) {
          return upstreamResponse(`
            <form method="post" enctype="multipart/form-data" action="m_sr01_form_proc.asp">
              <input type="hidden" name="mode" value="write">
              <input type="text" name="subject" value="Writing">
              <input type="file" name="strFile">
            </form>
          `);
        }
        if (call === 4) return upstreamResponse('<html><body>등록 화면으로 돌아갑니다.</body></html>');
        if (call === 5) return upstreamResponse('<html><body>파일 등록 화면</body></html>');
        throw new Error(`Unexpected fetch ${call}`);
      }),
    );

    const input = new FormData();
    input.set('studentId', 'student');
    input.set('password', 'password');
    input.set('fileName', '작문 파일 format.docx');
    input.set(
      'file',
      new File([new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x01])], 'writing.docx', {
        type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      }),
    );
    const response = await onRequestPost({
      request: new Request('https://eunjaewriting.pages.dev/api/submit', { method: 'POST', body: input }),
      env: {},
    });
    expect(response.status).toBe(502);
    expect(await response.json()).toMatchObject({
      ok: false,
      message: expect.stringContaining('실제 등록이 확인되지 않아 성공으로 처리하지 않았습니다'),
      diagnostic: {
        status: 200,
        path: '/m/acam_module/SED3/m_sr01_form_proc.asp',
        responseLength: expect.any(Number),
        fileField: 'strFile',
        fields: ['mode', 'subject'],
        fieldValues: {
          mode: 'write',
          subject: 'Writing',
          strFile: expect.stringContaining('파일 작문 파일 format.docx'),
        },
        responseScript: '',
        responseText: '등록 화면으로 돌아갑니다.',
        listBeforeCodes: [],
        listAfterCodes: [],
      },
    });
  });

  it('returns safe diagnostics for an upstream HTTP 500 response', async () => {
    let call = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        call += 1;
        if (call === 1) return upstreamResponse('<html>login</html>', { cookies: ['ASPSESSIONIDFRESH=x; Path=/'] });
        if (call === 2) return upstreamResponse('<script>var strMsg=""; var strErrCode="";</script>');
        if (call === 3) {
          return upstreamResponse(`
            <form method="post" action="m_sr01_form_proc.asp">
              <input type="hidden" name="procType" value="">
              <input type="file" name="rfi_file">
            </form>
          `);
        }
        if (call === 4) {
          return upstreamResponse('<html><body>ASP 처리 오류</body></html>', { status: 500 });
        }
        throw new Error(`Unexpected fetch ${call}`);
      }),
    );

    const input = new FormData();
    input.set('studentId', 'student');
    input.set('password', 'password');
    input.set(
      'file',
      new File([new Uint8Array([0x50, 0x4b, 0x03, 0x04])], 'writing.docx', {
        type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      }),
    );
    const response = await onRequestPost({
      request: new Request('https://eunjaewriting.pages.dev/api/submit', { method: 'POST', body: input }),
      env: {},
    });
    expect(response.status).toBe(502);
    expect(await response.json()).toMatchObject({
      ok: false,
      message: '제출 서버가 오류를 반환했습니다. (500)',
      diagnostic: {
        status: 500,
        fieldValues: { procType: 'I', rfi_file: expect.stringContaining('[파일') },
        responseText: 'ASP 처리 오류',
      },
    });
  });
});
