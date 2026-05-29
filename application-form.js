let database = window.scheduleDatabase;
const calendarMonths = [
  { year: 2026, month: 6 },
  { year: 2026, month: 7 },
];
const weekdayTimes = ["14:00", "15:00", "16:00", "17:00", "18:00", "19:00"];
const saturdayTimes = ["11:00", "12:00", "13:00", "14:00", "15:00"];

const state = {
  campusId: "",
  subjectId: "",
  date: "",
  time: "",
  monthIndex: 0,
};

const campusSelect = document.querySelector("#campusSelect");
const subjectSelect = document.querySelector("#subjectSelect");
const calendarDays = document.querySelector("#calendarDays");
const timeList = document.querySelector("#timeList");
const selectedDateText = document.querySelector("#selectedDateText");
const selectedTimeText = document.querySelector("#selectedTimeText");
const monthTitle = document.querySelector("#monthTitle");
const prevMonthButton = document.querySelector("#prevMonthButton");
const nextMonthButton = document.querySelector("#nextMonthButton");
const applicationForm = document.querySelector("#applicationForm");
const submitStatus = document.querySelector("#submitStatus");
const phoneInput = applicationForm.querySelector('input[name="phone"]');
const completeModal = document.querySelector("#completeModal");
const completeCloseButton = document.querySelector("#completeCloseButton");

function getSelectedCampus() {
  return database.campuses.find((campus) => campus.id === state.campusId);
}

function getSelectedSubject() {
  return database.subjects.find((subject) => subject.id === state.subjectId);
}

function getSubjectsByCampus(campusId) {
  return database.subjects.filter((subject) => subject.campusIds.includes(campusId));
}

function loadJsonp(url) {
  return new Promise((resolve, reject) => {
    const callbackName = `campusInfoCallback_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
    const script = document.createElement("script");
    const separator = url.includes("?") ? "&" : "?";

    window[callbackName] = (data) => {
      delete window[callbackName];
      script.remove();
      resolve(data);
    };

    script.onerror = () => {
      delete window[callbackName];
      script.remove();
      reject(new Error("캠퍼스정보를 불러오지 못했습니다."));
    };

    script.src = `${url}${separator}action=campus-options&callback=${callbackName}`;
    document.head.append(script);
  });
}

async function loadRemoteCampusOptions() {
  const gasWebAppUrl = window.appConfig?.gasWebAppUrl;
  if (!gasWebAppUrl) return;

  const result = await loadJsonp(gasWebAppUrl);
  if (result?.ok && result.data?.campuses?.length && result.data?.subjects?.length) {
    database = {
      ...database,
      campuses: result.data.campuses,
      subjects: result.data.subjects,
    };
  }
}

function initCampusOptions() {
  campusSelect.innerHTML = '<option value="">캠퍼스명 선택</option>';
  database.campuses.forEach((campus) => {
    campusSelect.append(new Option(campus.name, campus.id));
  });
}

function updateSubjectOptions() {
  subjectSelect.innerHTML = "";

  if (!state.campusId) {
    subjectSelect.disabled = true;
    subjectSelect.append(new Option("캠퍼스명을 먼저 선택", ""));
    return;
  }

  subjectSelect.disabled = false;
  subjectSelect.append(new Option("전형과목 선택", ""));
  getSubjectsByCampus(state.campusId).forEach((subject) => {
    subjectSelect.append(new Option(subject.name, subject.id));
  });
}

function getCurrentMonth() {
  return calendarMonths[state.monthIndex];
}

function dateKey(year, month, day) {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function parseDateKey(date) {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function isSaturdayBlocked(date) {
  const subject = getSelectedSubject();
  const blockedCampusIds = subject?.unavailableSaturdayCampusIds || [];
  return parseDateKey(date).getDay() === 6 && blockedCampusIds.includes(state.campusId);
}

function getTimesForDate(date) {
  if (!state.campusId || !state.subjectId) {
    return [];
  }

  const dayOfWeek = parseDateKey(date).getDay();

  if (dayOfWeek === 0) {
    return [];
  }

  if (isSaturdayBlocked(date)) {
    return [];
  }

  if (dayOfWeek === 6) {
    return saturdayTimes;
  }

  return weekdayTimes;
}

function updateMonthControls() {
  const { year, month } = getCurrentMonth();
  monthTitle.textContent = `${year}.${month}`;
  prevMonthButton.disabled = state.monthIndex === 0;
  nextMonthButton.disabled = state.monthIndex === calendarMonths.length - 1;
}

function renderCalendar() {
  const { year, month } = getCurrentMonth();
  const firstWeekday = new Date(year, month - 1, 1).getDay();
  const lastDay = new Date(year, month, 0).getDate();

  updateMonthControls();
  calendarDays.innerHTML = "";

  for (let blank = 0; blank < firstWeekday; blank += 1) {
    calendarDays.append(document.createElement("span"));
  }

  for (let day = 1; day <= lastDay; day += 1) {
    const key = dateKey(year, month, day);
    const times = getTimesForDate(key);
    const button = document.createElement("button");
    button.type = "button";
    button.className = "cal-day mx-auto flex flex-col items-center justify-center rounded-full text-sm text-slate-800";
    button.textContent = day;

    if (times.length > 0) {
      button.className = "cal-day mx-auto flex flex-col items-center justify-center rounded-full bg-cyan-50 text-sm font-black text-cyan-700";
      button.innerHTML = `${day}<small class="text-[9px] leading-none">응시</small>`;
      button.addEventListener("click", () => selectDate(key));
    }

    if (state.date === key) {
      button.className = "cal-day mx-auto flex flex-col items-center justify-center rounded-full bg-cyan-500 text-sm font-black text-white";
      button.innerHTML = `${day}<small class="text-[9px] leading-none">응시</small>`;
    }

    calendarDays.append(button);
  }
}

function selectDate(date) {
  state.date = date;
  state.time = "";
  renderCalendar();
  renderTimes();
  updateSummary();
}

function renderTimes() {
  timeList.innerHTML = "";

  if (!state.campusId || !state.subjectId || !state.date) {
    const empty = document.createElement("p");
    empty.className = "text-sm text-slate-500";
    empty.textContent = "캠퍼스명, 전형과목, 희망날짜를 선택하면 희망시가 표시됩니다.";
    timeList.append(empty);
    return;
  }

  const times = getTimesForDate(state.date);

  if (times.length === 0) {
    const empty = document.createElement("p");
    empty.className = "text-sm text-slate-500";
    empty.textContent = "선택 가능한 희망시가 없습니다.";
    timeList.append(empty);
    return;
  }

  times.forEach((time) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "h-11 rounded-2xl border border-slate-200 bg-white px-5 text-sm font-black text-slate-800";
    button.textContent = time;

    if (state.time === time) {
      button.className = "h-11 rounded-2xl border border-cyan-500 bg-white px-5 text-sm font-black text-cyan-700";
    }

    button.addEventListener("click", () => {
      state.time = time;
      renderTimes();
      updateSummary();
    });

    timeList.append(button);
  });
}

function updateSummary() {
  selectedDateText.textContent = state.date || "날짜 선택 전";
  selectedTimeText.textContent = state.time || "시간 선택 전";
}

function showCompletionModal() {
  if (!completeModal) return;
  completeModal.hidden = false;
  document.body.style.overflow = "hidden";
  completeCloseButton?.focus();
}

function closeCompletionModal() {
  if (!completeModal) return;
  completeModal.hidden = true;
  document.body.style.overflow = "";
}

function buildPayload(form) {
  const formData = new FormData(form);
  const campus = getSelectedCampus();
  const subject = getSelectedSubject();

  return {
    studentName: formData.get("studentName"),
    region: formData.get("region"),
    campusId: state.campusId,
    campusName: campus?.olympiadName || campus?.name || "",
    campusLocation: campus?.location || "",
    school: formData.get("school"),
    grade: formData.get("grade"),
    phone: formData.get("phone"),
    preferredDate: state.date,
    preferredTime: state.time,
    subjectId: state.subjectId,
    subjectName: subject?.olympiadName || subject?.name || "",
    referralSource: formData.get("referralSource") || "기타",
    referralDetail: formData.get("referralDetail") || "랜딩",
  };
}

function formatPhoneNumber(value) {
  const digits = value.replace(/\D/g, "").slice(0, 11);

  if (digits.length <= 3) {
    return digits;
  }

  if (digits.length <= 7) {
    return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  }

  return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
}

async function submitApplication(payload) {
  const gasWebAppUrl = window.appConfig?.gasWebAppUrl;

  if (!gasWebAppUrl) {
    throw new Error("config.js에 GAS 웹앱 URL을 입력해 주세요.");
  }

  await fetch(gasWebAppUrl, {
    method: "POST",
    mode: "no-cors",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify(payload),
  });

  return "신청 정보가 전송되었습니다.";
}

campusSelect.addEventListener("change", (event) => {
  state.campusId = event.target.value;
  state.subjectId = "";
  state.date = "";
  state.time = "";
  updateSubjectOptions();
  renderCalendar();
  renderTimes();
  updateSummary();
});

subjectSelect.addEventListener("change", (event) => {
  state.subjectId = event.target.value;
  state.date = "";
  state.time = "";
  renderCalendar();
  renderTimes();
  updateSummary();
});

prevMonthButton.addEventListener("click", () => {
  state.monthIndex = Math.max(0, state.monthIndex - 1);
  renderCalendar();
});

nextMonthButton.addEventListener("click", () => {
  state.monthIndex = Math.min(calendarMonths.length - 1, state.monthIndex + 1);
  renderCalendar();
});

phoneInput.addEventListener("input", (event) => {
  event.target.value = formatPhoneNumber(event.target.value);
});

applicationForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  if (!state.date || !state.time) {
    submitStatus.textContent = "희망날짜와 희망시를 선택해 주세요.";
    return;
  }

  submitStatus.textContent = "신청 정보를 전송하고 있습니다.";

  try {
    submitStatus.textContent = await submitApplication(buildPayload(applicationForm));
    showCompletionModal();
    applicationForm.reset();
    state.campusId = "";
    state.subjectId = "";
    state.date = "";
    state.time = "";
    updateSubjectOptions();
    renderCalendar();
    renderTimes();
    updateSummary();
  } catch (error) {
    submitStatus.textContent = error.message;
  }
});

completeCloseButton?.addEventListener("click", closeCompletionModal);
completeModal?.addEventListener("click", (event) => {
  if (event.target === completeModal) {
    closeCompletionModal();
  }
});

async function boot() {
  try {
    await loadRemoteCampusOptions();
  } catch (error) {
    submitStatus.textContent = "";
  }

  initCampusOptions();
  updateSubjectOptions();
  renderCalendar();
  renderTimes();
  updateSummary();
}

boot();
