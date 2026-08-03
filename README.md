# Writing Outline

원본 영어 작문 아웃라인 DOCX를 모바일과 PC에서 작성하고, DOCX 다운로드 또는 학원 서버 제출을 할 수 있는 Cloudflare Pages 사이트입니다.

## 기능

- 원본 20개 아웃라인 칸 편집
- 아웃라인 아래 전체 ESSAY 편집 영역
- 브라우저 임시 저장(비밀번호 제외)
- 원본 DOCX 구조를 유지한 파일 생성
- ID/비밀번호 로그인 후 서버 제출
- `m10` 로그인부터 파일 올리기까지 같은 세션 유지
- 이름·반·회차가 모두 있을 때만 사용자 지정 파일명 사용

## Cloudflare Pages 배포

- Framework preset: `Vite`
- Cloudflare project name: `eunjaewriting`
- Build command: `npm run build`
- Build output directory: `dist`
- Deploy command: `npm run deploy`
- Root directory: `/`

`functions/api/submit.js`는 Pages Function으로 자동 배포됩니다.

배포 명령에는 Workers용 `npx wrangler deploy`를 사용하지 않습니다. Pages 전용 명령인 `wrangler pages deploy dist`를 사용해야 합니다.

## 쿠키 설정

`functions/api/submit.js` 맨 위의 값을 변경합니다.

```js
const SEND_CONFIGURED_COOKIES = 1;
```

- `1`: 지정된 SED3/EIS/ID/비밀번호 보조 쿠키를 함께 전송
- `0`: 보조 쿠키를 전송하지 않음

제공된 전체 쿠키 배열은 Cloudflare Pages의 암호화 환경변수 `ACADEMY_CONFIGURED_COOKIES_JSON`에 저장합니다. 코드나 GitHub에는 값을 넣지 않습니다. 배열 안의 `입력했던ID`/`{{ID}}`, `입력했던비밀번호`/`{{PASSWORD}}`는 제출할 때 입력값으로 바뀝니다.

서버는 먼저 `https://m10.hakwonsarang.co.kr/m/m_login.asp`를 열어 `H2`와 ASP 세션 쿠키를 새로 발급받은 뒤 로그인합니다. 로그인 응답의 쿠키는 같은 `m10.hakwonsarang.co.kr` 파일 올리기 화면과 제출 요청까지 같은 서버 내부 쿠키 저장소로 전달됩니다.

환경변수에 들어 있는 고정 `H2` 또는 `ASPSESSIONID...` 값은 만료되거나 다른 세션에 묶일 수 있으므로 사용하지 않습니다. `SEND_CONFIGURED_COOKIES`가 `1`이면 나머지 SED3/EIS/ID/비밀번호 보조 쿠키만 새 세션에 병합합니다.

## 로컬 확인

```bash
npm install
npm test
npm run build
```

Cloudflare Pages Function까지 로컬에서 확인하려면 Wrangler로 빌드 결과를 실행합니다.

```bash
npx wrangler pages dev dist
```
