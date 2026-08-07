import './styles.css';
import { buildDocxBlob } from './docx.js';
import { EMPTY_DRAFT } from './schema.js';
import { hasCompleteCustomName, makeDocxFileName } from './filename.js';

const STORAGE_KEY = 'leeeunjae-writing-draft-v1';

const app = document.querySelector('#app');
app.innerHTML = `
  <header class="topbar">
    <div class="topbar-inner">
      <a class="brand" href="#editor" aria-label="Writing Outline 맨 위로">Writing Outline</a>
      <span class="save-state" id="saveState" aria-live="polite">임시 저장 준비</span>
    </div>
  </header>

  <main id="editor" class="workspace">
    <section class="paper" aria-labelledby="outlineTitle">
      <h1 id="outlineTitle">OUTLINE</h1>
      <table class="outline-table">
        <tbody>
          <tr class="title-row">
            <td colspan="3" class="title-cell">
              <label for="title">Title of your essay :</label>
              <input id="title" data-draft="title" autocomplete="off" />
            </td>
          </tr>
          <tr>
            <td class="section-cell">Introduction</td>
            <td class="prompt-cell">Attention Grabber</td>
            <td class="input-cell" data-label="Introduction · Attention Grabber"><textarea data-draft="attentionGrabber" rows="2"></textarea></td>
          </tr>
          <tr>
            <td class="section-cell blank-cell" rowspan="3"></td>
            <td class="prompt-cell" rowspan="3">Main points of bodies</td>
            <td class="input-cell numbered" data-number="1." data-label="Introduction · Main point 1"><textarea data-draft="introMain1" rows="1"></textarea></td>
          </tr>
          <tr>
            <td class="input-cell numbered" data-number="2." data-label="Introduction · Main point 2"><textarea data-draft="introMain2" rows="1"></textarea></td>
          </tr>
          <tr>
            <td class="input-cell numbered" data-number="3." data-label="Introduction · Main point 3"><textarea data-draft="introMain3" rows="1"></textarea></td>
          </tr>
          <tr>
            <td class="section-cell blank-cell"></td>
            <td class="prompt-cell">Thesis Statement</td>
            <td class="input-cell" data-label="Introduction · Thesis Statement"><textarea data-draft="thesisStatement" rows="2"></textarea></td>
          </tr>
          <tr>
            <td class="section-cell">Body 1</td>
            <td class="prompt-cell">Topic sentence</td>
            <td class="input-cell" data-label="Body 1 · Topic sentence"><textarea data-draft="body1Topic" rows="2"></textarea></td>
          </tr>
          <tr>
            <td class="section-cell blank-cell"></td>
            <td class="prompt-cell">Reason/Explanation 1</td>
            <td class="input-cell" data-label="Body 1 · Reason/Explanation 1"><textarea data-draft="body1Reason1" rows="2"></textarea></td>
          </tr>
          <tr>
            <td class="section-cell blank-cell"></td>
            <td class="prompt-cell">Reason/Explanation 2</td>
            <td class="input-cell" data-label="Body 1 · Reason/Explanation 2"><textarea data-draft="body1Reason2" rows="2"></textarea></td>
          </tr>
          <tr>
            <td class="section-cell">Body 2</td>
            <td class="prompt-cell">Topic sentence</td>
            <td class="input-cell" data-label="Body 2 · Topic sentence"><textarea data-draft="body2Topic" rows="2"></textarea></td>
          </tr>
          <tr>
            <td class="section-cell blank-cell"></td>
            <td class="prompt-cell">Reason/Explanation 1</td>
            <td class="input-cell" data-label="Body 2 · Reason/Explanation 1"><textarea data-draft="body2Reason1" rows="2"></textarea></td>
          </tr>
          <tr>
            <td class="section-cell blank-cell"></td>
            <td class="prompt-cell">Reason/Explanation 2</td>
            <td class="input-cell" data-label="Body 2 · Reason/Explanation 2"><textarea data-draft="body2Reason2" rows="2"></textarea></td>
          </tr>
          <tr>
            <td class="section-cell">Body 3</td>
            <td class="prompt-cell">Topic sentence</td>
            <td class="input-cell" data-label="Body 3 · Topic sentence"><textarea data-draft="body3Topic" rows="2"></textarea></td>
          </tr>
          <tr>
            <td class="section-cell blank-cell"></td>
            <td class="prompt-cell">Reason/Explanation 1</td>
            <td class="input-cell" data-label="Body 3 · Reason/Explanation 1"><textarea data-draft="body3Reason1" rows="2"></textarea></td>
          </tr>
          <tr>
            <td class="section-cell blank-cell"></td>
            <td class="prompt-cell">Reason/Explanation 2</td>
            <td class="input-cell" data-label="Body 3 · Reason/Explanation 2"><textarea data-draft="body3Reason2" rows="2"></textarea></td>
          </tr>
          <tr>
            <td class="section-cell">Conclusion</td>
            <td class="prompt-cell">Paraphrase thesis</td>
            <td class="input-cell" data-label="Conclusion · Paraphrase thesis"><textarea data-draft="conclusionThesis" rows="2"></textarea></td>
          </tr>
          <tr>
            <td class="section-cell blank-cell"></td>
            <td class="prompt-cell" rowspan="3">Remind main points</td>
            <td class="input-cell numbered" data-number="1." data-label="Conclusion · Main point 1"><textarea data-draft="conclusionMain1" rows="1"></textarea></td>
          </tr>
          <tr>
            <td class="section-cell blank-cell"></td>
            <td class="input-cell numbered" data-number="2." data-label="Conclusion · Main point 2"><textarea data-draft="conclusionMain2" rows="1"></textarea></td>
          </tr>
          <tr>
            <td class="section-cell blank-cell"></td>
            <td class="input-cell numbered" data-number="3." data-label="Conclusion · Main point 3"><textarea data-draft="conclusionMain3" rows="1"></textarea></td>
          </tr>
          <tr>
            <td class="section-cell blank-cell"></td>
            <td class="prompt-cell">Application/<br />Generalization of the Thesis</td>
            <td class="input-cell" data-label="Conclusion · Application/Generalization"><textarea data-draft="application" rows="3"></textarea></td>
          </tr>
        </tbody>
      </table>

      <section class="essay-section" aria-labelledby="essayTitle">
        <div class="essay-heading">
          <h2 id="essayTitle">ESSAY</h2>
          <span id="essayCount">0자</span>
        </div>
        <textarea class="essay-input" data-draft="essay" aria-label="전체 essay" placeholder="전체 essay를 입력하세요." spellcheck="true"></textarea>
      </section>
    </section>

    <section class="submit-card" aria-labelledby="submitTitle">
      <div class="section-heading">
        <div>
          <p class="eyebrow">SUBMIT</p>
          <h2 id="submitTitle">자동 제출</h2>
        </div>
        <span class="privacy-note">비밀번호는 저장되지 않습니다</span>
      </div>

      <form id="submitForm">
        <div class="field-grid account-grid">
          <label class="field">
            <span>ID <b>필수</b></span>
            <input name="studentId" autocomplete="username" required />
          </label>
          <label class="field">
            <span>비밀번호 <b>필수</b></span>
            <div class="password-wrap">
              <input name="password" type="password" autocomplete="current-password" required />
              <button class="password-toggle" type="button" aria-label="비밀번호 표시" aria-pressed="false">보기</button>
            </div>
          </label>
        </div>

        <div class="field-grid meta-grid">
          <label class="field">
            <span>이름 <small>선택</small></span>
            <input name="studentName" autocomplete="name" />
          </label>
          <label class="field">
            <span>반 이름 <small>선택</small></span>
            <input name="className" autocomplete="organization-title" />
          </label>
          <label class="field">
            <span>회차 <small>선택</small></span>
            <input name="round" inputmode="text" />
          </label>
        </div>

        <fieldset class="submission-type">
          <legend>제출 유형 <b>필수</b></legend>
          <div class="segmented-control">
            <label>
              <input name="rfiType" type="radio" value="A" checked />
              <span>선행</span>
            </label>
            <label>
              <input name="rfiType" type="radio" value="B" />
              <span>재시</span>
            </label>
          </div>
        </fieldset>

        <label class="filename-option is-disabled" id="filenameOption">
          <input name="useCustomName" type="checkbox" disabled />
          <span class="checkmark" aria-hidden="true"></span>
          <span>
            <strong>입력 정보로 파일 이름 만들기</strong>
            <small id="filenamePreview">작문 파일 format.docx</small>
          </span>
        </label>
      </form>
    </section>
  </main>

  <div class="action-dock">
    <div class="action-inner">
      <button class="secondary-button" id="downloadButton" type="button">DOCX 다운로드</button>
      <button class="primary-button" id="submitButton" type="submit" form="submitForm">서버로 자동 제출</button>
    </div>
  </div>

  <div class="toast" id="toast" role="status" aria-live="polite"></div>
`;

const form = document.querySelector('#submitForm');
const saveState = document.querySelector('#saveState');
const essayCount = document.querySelector('#essayCount');
const filenameOption = document.querySelector('#filenameOption');
const filenamePreview = document.querySelector('#filenamePreview');
const downloadButton = document.querySelector('#downloadButton');
const submitButton = document.querySelector('#submitButton');
const toast = document.querySelector('#toast');

const stored = loadStoredState();
const state = {
  draft: { ...EMPTY_DRAFT, ...stored.draft },
  meta: {
    studentId: stored.meta?.studentId ?? '',
    studentName: stored.meta?.studentName ?? '',
    className: stored.meta?.className ?? '',
    round: stored.meta?.round ?? '',
    rfiType: stored.meta?.rfiType === 'B' ? 'B' : 'A',
    useCustomName: Boolean(stored.meta?.useCustomName),
  },
};

let saveTimer;
let toastTimer;

function loadStoredState() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) ?? {};
  } catch {
    return {};
  }
}

function persistState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  saveState.textContent = '임시 저장됨';
}

function scheduleSave() {
  saveState.textContent = '저장 중…';
  clearTimeout(saveTimer);
  saveTimer = setTimeout(persistState, 450);
}

function getFileMeta() {
  return {
    studentName: form.elements.studentName.value,
    className: form.elements.className.value,
    round: form.elements.round.value,
  };
}

function syncFilenameOption() {
  const meta = getFileMeta();
  const complete = hasCompleteCustomName(meta);
  const checkbox = form.elements.useCustomName;

  if (!complete) checkbox.checked = false;
  checkbox.disabled = !complete;
  filenameOption.classList.toggle('is-disabled', !complete);
  state.meta.useCustomName = checkbox.checked;
  filenamePreview.textContent = makeDocxFileName(meta, checkbox.checked);
}

function populateInputs() {
  document.querySelectorAll('[data-draft]').forEach((input) => {
    input.value = state.draft[input.dataset.draft] ?? '';
  });
  ['studentId', 'studentName', 'className', 'round'].forEach((name) => {
    form.elements[name].value = state.meta[name] ?? '';
  });
  form.elements.rfiType.value = state.meta.rfiType;
  form.elements.useCustomName.checked = state.meta.useCustomName;
  essayCount.textContent = `${state.draft.essay.length.toLocaleString('ko-KR')}자`;
  syncFilenameOption();
  saveState.textContent = stored.draft || stored.meta ? '임시 저장 불러옴' : '자동 임시 저장';
}

function showToast(message, type = 'success', duration = 4200) {
  clearTimeout(toastTimer);
  toast.textContent = message;
  toast.className = `toast is-visible ${type}`;
  toastTimer = setTimeout(() => {
    toast.classList.remove('is-visible');
  }, duration);
}

function formatSubmitDiagnostic(diagnostic) {
  if (!diagnostic) return '';
  const fields = Array.isArray(diagnostic.fields) && diagnostic.fields.length
    ? diagnostic.fields.join(',')
    : '없음';
  const signals = [
    diagnostic.alert && `alert=${diagnostic.alert}`,
    diagnostic.errorCode && `code=${diagnostic.errorCode}`,
    diagnostic.message && `msg=${diagnostic.message}`,
    Array.isArray(diagnostic.locations) && diagnostic.locations.length
      ? `이동=${diagnostic.locations.join(',')}`
      : '',
  ].filter(Boolean).join(' / ') || '응답문구 없음';
  const fieldValues = diagnostic.fieldValues
    ? Object.entries(diagnostic.fieldValues).map(([name, value]) => `${name}=${value}`).join(', ')
    : '없음';
  const listCheck = `목록코드=${(diagnostic.listBeforeCodes || []).join(',') || '없음'}→${(diagnostic.listAfterCodes || []).join(',') || '없음'}`;
  const resultPage = diagnostic.resultPath
    ? `결과=${diagnostic.resultPath}(${diagnostic.resultLength || 0}자)`
    : '결과페이지 없음';
  const responseScript = diagnostic.responseScript || '스크립트 없음';
  const responseText = diagnostic.responseText || '본문 없음';
  const formSelects = diagnostic.formSelects ? JSON.stringify(diagnostic.formSelects) : '없음';
  const formSelectActions = diagnostic.formSelectActions ? JSON.stringify(diagnostic.formSelectActions) : '없음';
  const formRequests = Array.isArray(diagnostic.formRequests) && diagnostic.formRequests.length
    ? diagnostic.formRequests.join(',')
    : '없음';
  const formHydration = diagnostic.formHydration ? JSON.stringify(diagnostic.formHydration) : '없음';
  const formControls = Array.isArray(diagnostic.formControls) && diagnostic.formControls.length
    ? diagnostic.formControls.join(' | ')
    : '없음';
  const formSubmitLogic = diagnostic.formSubmitLogic || '없음';
  const transportFileName = diagnostic.transportFileName || '없음';
  const multipart = diagnostic.multipart ? JSON.stringify(diagnostic.multipart) : '없음';
  const formActions = Array.isArray(diagnostic.formActions) && diagnostic.formActions.length
    ? diagnostic.formActions.join(' | ')
    : '없음';
  const formScript = diagnostic.formScript || '없음';
  return `\n진단: HTTP ${diagnostic.status}; 경로=${diagnostic.path}; 파일필드=${diagnostic.fileField || '없음'}; 전송파일명=${transportFileName}; 멀티파트=${multipart}; 전송필드=${fields}; 전송값=${fieldValues}; 응답길이=${diagnostic.responseLength}; ${signals}; ${listCheck}; ${resultPage}; 처리스크립트=${responseScript}; 응답본문=${responseText}; 폼선택지=${formSelects}; 선택동작=${formSelectActions}; 폼요청=${formRequests}; 자동선택=${formHydration}; 제출요소=${formControls}; 제출동작=${formActions}; 제출스크립트=${formSubmitLogic}; 폼스크립트=${formScript}`;
}

function setBusy(isBusy) {
  submitButton.disabled = isBusy;
  downloadButton.disabled = isBusy;
  submitButton.textContent = isBusy ? '제출 중…' : '서버로 자동 제출';
}

async function createFile() {
  const fileName = makeDocxFileName(getFileMeta(), form.elements.useCustomName.checked);
  const blob = await buildDocxBlob(state.draft);
  return { blob, fileName };
}

document.querySelectorAll('[data-draft]').forEach((input) => {
  input.addEventListener('input', () => {
    state.draft[input.dataset.draft] = input.value;
    if (input.dataset.draft === 'essay') {
      essayCount.textContent = `${input.value.length.toLocaleString('ko-KR')}자`;
    }
    scheduleSave();
  });
});

['studentId', 'studentName', 'className', 'round'].forEach((name) => {
  form.elements[name].addEventListener('input', () => {
    state.meta[name] = form.elements[name].value;
    syncFilenameOption();
    scheduleSave();
  });
});

form.elements.rfiType.forEach((input) => {
  input.addEventListener('change', () => {
    state.meta.rfiType = form.elements.rfiType.value;
    scheduleSave();
  });
});

form.elements.useCustomName.addEventListener('change', () => {
  syncFilenameOption();
  scheduleSave();
});

document.querySelector('.password-toggle').addEventListener('click', (event) => {
  const input = form.elements.password;
  const show = input.type === 'password';
  input.type = show ? 'text' : 'password';
  event.currentTarget.textContent = show ? '숨김' : '보기';
  event.currentTarget.setAttribute('aria-pressed', String(show));
  event.currentTarget.setAttribute('aria-label', show ? '비밀번호 숨기기' : '비밀번호 표시');
});

downloadButton.addEventListener('click', async () => {
  try {
    downloadButton.disabled = true;
    downloadButton.textContent = '파일 만드는 중…';
    persistState();
    const { blob, fileName } = await createFile();
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = fileName;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
    showToast(`${fileName} 다운로드를 시작했습니다.`);
  } catch (error) {
    showToast(error.message || 'DOCX 파일을 만들지 못했습니다.', 'error');
  } finally {
    downloadButton.disabled = false;
    downloadButton.textContent = 'DOCX 다운로드';
  }
});

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!form.reportValidity()) return;

  try {
    setBusy(true);
    persistState();
    const { blob, fileName } = await createFile();
    const payload = new FormData();
    payload.append('file', blob, fileName);
    payload.append('studentId', form.elements.studentId.value.trim());
    payload.append('password', form.elements.password.value);
    payload.append('studentName', form.elements.studentName.value.trim());
    payload.append('className', form.elements.className.value.trim());
    payload.append('round', form.elements.round.value.trim());
    payload.append('rfiType', form.elements.rfiType.value);
    payload.append('fileName', fileName);

    const response = await fetch('/api/submit', { method: 'POST', body: payload });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || !result.ok) {
      const error = new Error(
        `${result.message || '제출하지 못했습니다. 잠시 후 다시 시도해 주세요.'}${formatSubmitDiagnostic(result.diagnostic)}`,
      );
      error.hasDiagnostic = Boolean(result.diagnostic);
      throw error;
    }

    form.elements.password.value = '';
    showToast(result.message || '제출되었습니다.');
  } catch (error) {
    showToast(error.message || '제출하지 못했습니다.', 'error', error.hasDiagnostic ? 20000 : 4200);
  } finally {
    setBusy(false);
  }
});

populateInputs();
