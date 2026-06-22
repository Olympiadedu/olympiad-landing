var APPLICATION_SHEET_NAME = '신청내역';
var CAMPUS_SHEET_NAME = '캠퍼스정보';
var SUBMISSION_LOG_SHEET_NAME = '전송테스트로그';

function setupSheets() {
  var applicationSheet = getOrCreateApplicationSheet_();
  ensureHeader_(applicationSheet, getApplicationHeaders_());

  var submissionLogSheet = getOrCreateApplicationNamedSheet_(SUBMISSION_LOG_SHEET_NAME);
  ensureHeader_(submissionLogSheet, getSubmissionLogHeaders_());

  var campusSheet = getOrCreateCampusSheet_();
  ensureHeader_(campusSheet, getCampusHeaders_());
}

function testSampleApplication() {
  var sample = {
    studentName: '테스트학생',
    region: '서울특별시',
    campusId: 'gwangjin',
    campusName: '광진캠퍼스',
    campusLocation: '서울특별시 광진구',
    school: '테스트중학교',
    grade: '중1',
    phone: '010-0000-0000',
    preferredDate: '2026-06-12',
    preferredTime: '14:00',
    subjectId: 'math',
    subjectName: '수학',
    referralSource: '기타',
    referralDetail: '랜딩'
  };

  var route = findCampusRoute_(sample);
  var row = appendApplication_(sample, route);
  var submission = processSiteSubmission_(sample, route, row);
  updateApplicationSubmissionStatus_(row, submission);
  return submission;
}

function doGet(e) {
  var action = e && e.parameter && e.parameter.action ? e.parameter.action : '';
  if (action === 'campus-options') {
    return campusOptionsResponse_(e);
  }

  return json_({
    ok: false,
    message: '지원하지 않는 요청입니다.'
  });
}

function doPost(e) {
  var lock = LockService.getScriptLock();

  try {
    lock.waitLock(10000);

    var payload = parsePayload_(e);
    var route = findCampusRoute_(payload);
    var row = appendApplication_(payload, route);
    var submission = processSiteSubmission_(payload, route, row);
    updateApplicationSubmissionStatus_(row, submission);

    return json_({
      ok: true,
      row: row,
      submission: submission,
      message: '신청내역 저장 완료'
    });
  } catch (err) {
    return json_({
      ok: false,
      message: err && err.message ? err.message : String(err)
    });
  } finally {
    try {
      lock.releaseLock();
    } catch (err) {
      // Lock may not have been acquired if parsing failed early.
    }
  }
}

function parsePayload_(e) {
  var raw = e && e.postData && e.postData.contents ? e.postData.contents : '{}';
  var payload = JSON.parse(raw);

  requireField_(payload, 'studentName', '학생명');
  requireField_(payload, 'region', '지역');
  requireField_(payload, 'campusName', '캠퍼스명');
  requireField_(payload, 'school', '학교명');
  requireField_(payload, 'grade', '학년');
  requireField_(payload, 'phone', '연락처');
  requireField_(payload, 'preferredDate', '희망날짜');
  requireField_(payload, 'preferredTime', '희망시');
  requireField_(payload, 'subjectName', '전형과목');

  payload.referralSource = payload.referralSource || '기타';
  payload.referralDetail = payload.referralDetail || '랜딩';
  return payload;
}

function campusOptionsResponse_(e) {
  var result = {
    ok: true,
    data: readCampusOptions_()
  };

  var callback = e && e.parameter && e.parameter.callback ? e.parameter.callback : '';
  if (callback) {
    callback = String(callback).replace(/[^\w.$]/g, '');
    return ContentService
      .createTextOutput(callback + '(' + JSON.stringify(result) + ');')
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }

  return json_(result);
}

function readCampusOptions_() {
  var sheet = getOrCreateCampusSheet_();
  var values = sheet.getDataRange().getValues();
  if (values.length < 2) {
    return {
      campuses: [],
      subjects: []
    };
  }

  var headers = values[0].map(function (header) {
    return String(header || '').trim();
  });
  var campusIdCol = findHeaderIndex_(headers, 'campusId');
  var divisionCol = findHeaderIndex_(headers, '구분');
  var regionCol = findHeaderIndex_(headers, '지역');
  var campusNameCol = findHeaderIndex_(headers, '캠퍼스명');
  var saturdayBlockedCol = findHeaderIndex_(headers, '토요일선택불가');
  var subjectCols = findAllHeaderIndexes_(headers, '전형과목');

  var campusesById = {};
  var subjectsById = {};

  values.slice(1).forEach(function (row) {
    var campusName = cellText_(row[campusNameCol]);
    if (!campusName) return;

    var campusId = cellText_(row[campusIdCol]) || makeCampusId_(campusName);
    var region = cellText_(row[regionCol]);

    if (!campusesById[campusId]) {
      campusesById[campusId] = {
        id: campusId,
        name: campusName,
        olympiadName: campusName,
        location: region,
        region: region
      };
    }

    var subjectNames = [cellText_(row[divisionCol])];
    subjectCols.forEach(function (col) {
      subjectNames.push(cellText_(row[col]));
    });

    subjectNames.forEach(function (subjectName) {
      splitSubjectNames_(subjectName).forEach(function (name) {
        var subjectId = makeSubjectId_(name);
        if (!subjectId) return;

        if (!subjectsById[subjectId]) {
          subjectsById[subjectId] = {
            id: subjectId,
            name: name,
            olympiadName: name,
            campusIds: [],
            unavailableSaturdayCampusIds: []
          };
        }

        if (subjectsById[subjectId].campusIds.indexOf(campusId) === -1) {
          subjectsById[subjectId].campusIds.push(campusId);
        }

        if (
          saturdayBlockedCol >= 0 &&
          String(row[saturdayBlockedCol]).toUpperCase() === 'Y' &&
          subjectsById[subjectId].unavailableSaturdayCampusIds.indexOf(campusId) === -1
        ) {
          subjectsById[subjectId].unavailableSaturdayCampusIds.push(campusId);
        }
      });
    });
  });

  return {
    campuses: Object.keys(campusesById).map(function (id) { return campusesById[id]; }),
    subjects: Object.keys(subjectsById).map(function (id) { return subjectsById[id]; })
  };
}

function appendApplication_(payload, route) {
  var sheet = getOrCreateApplicationSheet_();
  ensureHeader_(sheet, getApplicationHeaders_());

  if (isDuplicateApplication_(sheet, payload)) {
    throw new Error('이미 접수된 신청입니다.');
  }

  sheet.appendRow([
    Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyy-MM-dd HH:mm:ss'),
    payload.studentName,
    payload.region,
    payload.campusName,
    payload.campusLocation || '',
    payload.school,
    payload.grade,
    payload.phone,
    payload.preferredDate,
    payload.preferredTime,
    payload.subjectName,
    payload.referralSource,
    payload.referralDetail,
    payload.campusId || '',
    payload.subjectId || '',
    route.inputSite || '',
    route.note || '',
    '전송대기',
    '접수'
  ]);

  return sheet.getLastRow();
}

function updateApplicationSubmissionStatus_(row, submission) {
  var sheet = getOrCreateApplicationSheet_();
  var headers = getApplicationHeaders_();
  var siteStatusCol = headers.indexOf('사이트전송상태') + 1;
  var processStatusCol = headers.indexOf('처리상태') + 1;

  if (siteStatusCol > 0) {
    sheet.getRange(row, siteStatusCol).setValue(buildApplicationStatusText_(submission));
  }

  if (processStatusCol > 0) {
    sheet
      .getRange(row, processStatusCol)
      .setValue(submission && submission.mode === 'LIVE' ? '접수/전송처리' : '접수/전송테스트');
  }
}

function buildApplicationStatusText_(submission) {
  if (!submission) return '전송결과없음';
  if (submission.mode === 'LIVE') {
    return submission.status + (submission.httpStatus ? ' (' + submission.httpStatus + ')' : '');
  }
  return 'DRY_RUN';
}

function findCampusRoute_(payload) {
  var sheet = getOrCreateCampusSheet_();
  var values = sheet.getDataRange().getValues();
  if (values.length < 2) {
    return { inputSite: '', note: '', matched: false };
  }

  var headers = values[0].map(function (header) {
    return String(header || '').trim();
  });
  var campusIdCol = findHeaderIndex_(headers, 'campusId');
  var campusNameCol = findHeaderIndex_(headers, '캠퍼스명');
  var inputSiteCol = findHeaderIndex_(headers, '입력사이트');
  var noteCol = findHeaderIndex_(headers, '특이사항');
  var siteCol = findHeaderIndex_(headers, 'SITE');
  var consultingIdxCol = findHeaderIndex_(headers, 'CONSULTING_IDX');
  var acadIdCol = findHeaderIndex_(headers, 'ACAD_ID');
  var areaIdCol = findHeaderIndex_(headers, 'AREA_ID');
  var areaNameCol = findHeaderIndex_(headers, 'AREA_NAME');
  var acadNameCol = findHeaderIndex_(headers, 'ACAD_NAME');
  var subjectCols = findAllHeaderIndexes_(headers, '전형과목');

  var payloadCampusId = cellText_(payload.campusId);
  var payloadCampusName = normalizeText_(payload.campusName);
  var payloadSubjectName = normalizeText_(payload.subjectName);

  for (var i = 1; i < values.length; i++) {
    var row = values[i];
    var rowCampusId = cellText_(row[campusIdCol]);
    var rowCampusName = normalizeText_(row[campusNameCol]);
    var campusMatched = payloadCampusId
      ? rowCampusId === payloadCampusId
      : rowCampusName === payloadCampusName;

    if (!campusMatched) continue;

    for (var s = 0; s < subjectCols.length; s++) {
      if (normalizeText_(row[subjectCols[s]]) === payloadSubjectName) {
        return {
          inputSite: cellText_(row[inputSiteCol]),
          note: cellText_(row[noteCol]),
          site: cellText_(row[siteCol]),
          consultingIdx: cellText_(row[consultingIdxCol]),
          acadId: cellText_(row[acadIdCol]),
          areaId: cellText_(row[areaIdCol]),
          areaName: cellText_(row[areaNameCol]),
          acadName: cellText_(row[acadNameCol]),
          matched: true
        };
      }
    }
  }

  return { inputSite: '', note: '', matched: false };
}

function processSiteSubmission_(payload, route, applicationRow) {
  var mode = getScriptProperty_('SITE_SUBMIT_MODE') || 'DRY_RUN';
  var targetPayload = buildTargetSitePayload_(payload, route);
  var result = {
    mode: mode,
    inputSite: route.inputSite || '',
    routeMatched: !!route.matched,
    status: 'DRY_RUN'
  };

  if (mode !== 'LIVE') {
    logSubmissionAttempt_(payload, route, applicationRow, result.status, targetPayload, '');
    return result;
  }

  if (!isLiveSupportedSite_(route.inputSite)) {
    result.status = 'LIVE_UNSUPPORTED_SITE';
    result.message = '현재 LIVE 전송은 math.olympiad.ac, www.glec.co.kr, www.u2math.co.kr만 준비되어 있습니다.';
    logSubmissionAttempt_(payload, route, applicationRow, result.status, targetPayload, result.message);
    return result;
  }

  result = submitProcApply_(route.inputSite, targetPayload);
  logSubmissionAttempt_(payload, route, applicationRow, result.status, targetPayload, result.message || '');
  return result;
}

function buildTargetSitePayload_(payload, route) {
  var inputSite = route.inputSite || '';
  var routeConfig = getRouteSiteConfig_(route);

  if (inputSite.indexOf('math.olympiad.ac') >= 0) {
    return buildProcApplyPayload_(payload, routeConfig || getSiteConfig_('math'));
  }

  if (inputSite.indexOf('glec.co.kr') >= 0) {
    return buildProcApplyPayload_(payload, routeConfig || getSiteConfig_('glec'));
  }

  if (inputSite.indexOf('u2math.co.kr') >= 0) {
    return buildProcApplyPayload_(payload, routeConfig || getSiteConfig_('u2m'));
  }

  return buildUnknownSitePayload_(payload, inputSite);
}

function buildProcApplyPayload_(payload, siteConfig) {
  return {
    CONSULTING_IDX: siteConfig.consultingIdx,
    SITE: siteConfig.site,
    ACAD_ID: siteConfig.acadId,
    AREA_ID: siteConfig.areaId,
    AREA_NAME: siteConfig.areaName || '',
    ACAD_NAME: siteConfig.acadName || payload.campusName || '',
    RESERVED_DATE: payload.preferredDate + ' ' + payload.preferredTime,
    CHILD_NAME: payload.studentName,
    CHILD_GRADE: payload.grade,
    CHILD_SCHOOL: payload.school,
    PARENT_PHONE: onlyDigits_(payload.phone),
    KNOWLEDGE_SELECT: '기타-' + (payload.referralDetail || '랜딩'),
    CONTENTS: '',
    APPLY_YN: 'N',
    PASS_YN: 'N',
    ENROLLMENT_YN: 'N',
    STATUS: 'N',
    TYPE_SUBJECT: payload.subjectName
  };
}

function getRouteSiteConfig_(route) {
  if (!route) return null;

  var inputSite = route.inputSite || '';
  var fallbackSite = '';

  if (inputSite.indexOf('math.olympiad.ac') >= 0) fallbackSite = 'math';
  if (inputSite.indexOf('glec.co.kr') >= 0) fallbackSite = 'glec';
  if (inputSite.indexOf('u2math.co.kr') >= 0) fallbackSite = 'u2m';

  var site = route.site || fallbackSite;
  var fallbackConfig = site ? getSiteConfig_(site) : null;

  if (!route.acadId && !route.areaId && !route.consultingIdx && !route.site) {
    return null;
  }

  return {
    site: site || (fallbackConfig && fallbackConfig.site) || '',
    consultingIdx: route.consultingIdx || (fallbackConfig && fallbackConfig.consultingIdx) || '844',
    acadId: route.acadId || (fallbackConfig && fallbackConfig.acadId) || '',
    areaId: route.areaId || (fallbackConfig && fallbackConfig.areaId) || '',
    areaName: route.areaName || '',
    acadName: route.acadName || ''
  };
}

function getSiteConfig_(site) {
  var configs = {
    math: {
      site: 'math',
      consultingIdx: getScriptProperty_('MATH_CONSULTING_IDX') || '844',
      acadId: getScriptProperty_('MATH_ACAD_ID') || '4',
      areaId: getScriptProperty_('MATH_AREA_ID') || '105A'
    },
    glec: {
      site: 'glec',
      consultingIdx: getScriptProperty_('GLEC_CONSULTING_IDX') || '844',
      acadId: getScriptProperty_('GLEC_ACAD_ID') || '4',
      areaId: getScriptProperty_('GLEC_AREA_ID') || '105A'
    },
    u2m: {
      site: 'u2m',
      consultingIdx: getScriptProperty_('U2M_CONSULTING_IDX') || '844',
      acadId: getScriptProperty_('U2M_ACAD_ID') || '20',
      areaId: getScriptProperty_('U2M_AREA_ID') || '105O'
    }
  };

  return configs[site];
}

function buildUnknownSitePayload_(payload, inputSite) {
  return {
    NOTICE: '이 사이트는 아직 실제 POST 필드명이 확인되지 않았습니다. Network Payload가 필요합니다.',
    INPUT_SITE: inputSite,
    학생명: payload.studentName,
    지역: payload.region,
    캠퍼스명: payload.campusName,
    학교명: payload.school,
    학년: payload.grade,
    연락처: onlyDigits_(payload.phone),
    희망날짜: payload.preferredDate,
    희망시: payload.preferredTime,
    전형과목: payload.subjectName,
    알게된경로: payload.referralSource || '기타',
    알게된경로내용: payload.referralDetail || '랜딩'
  };
}

function submitProcApply_(inputSite, targetPayload) {
  var origin = getOrigin_(inputSite);
  var procApplyUrl = origin + '/Exam/ProcApply';
  var writeResponse = UrlFetchApp.fetch(inputSite, {
    method: 'get',
    muteHttpExceptions: true,
    followRedirects: true
  });
  var cookies = collectCookies_(writeResponse);
  var response = UrlFetchApp.fetch(procApplyUrl, {
    method: 'post',
    payload: targetPayload,
    muteHttpExceptions: true,
    followRedirects: false,
    headers: {
      Cookie: cookies,
      Origin: origin,
      Referer: inputSite,
      'X-Requested-With': 'XMLHttpRequest'
    }
  });

  return {
    mode: 'LIVE',
    inputSite: inputSite,
    procApplyUrl: procApplyUrl,
    status: response.getResponseCode() >= 200 && response.getResponseCode() < 300 ? 'LIVE_SENT' : 'LIVE_FAILED',
    httpStatus: response.getResponseCode(),
    message: response.getContentText('UTF-8').substring(0, 500)
  };
}

function isLiveSupportedSite_(inputSite) {
  inputSite = String(inputSite || '');
  return inputSite.indexOf('math.olympiad.ac') >= 0
    || inputSite.indexOf('glec.co.kr') >= 0
    || inputSite.indexOf('u2math.co.kr') >= 0;
}

function collectCookies_(response) {
  var headers = response.getAllHeaders();
  var setCookie = headers['Set-Cookie'] || headers['set-cookie'] || [];
  if (!Array.isArray(setCookie)) setCookie = [setCookie];
  return setCookie
    .map(function (cookie) { return String(cookie).split(';')[0]; })
    .filter(function (cookie) { return cookie; })
    .join('; ');
}

function logSubmissionAttempt_(payload, route, applicationRow, status, targetPayload, message) {
  var sheet = getOrCreateApplicationNamedSheet_(SUBMISSION_LOG_SHEET_NAME);
  ensureHeader_(sheet, getSubmissionLogHeaders_());

  sheet.appendRow([
    Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyy-MM-dd HH:mm:ss'),
    applicationRow,
    status,
    payload.campusName,
    payload.subjectName,
    route.inputSite || '',
    route.note || '',
    JSON.stringify(targetPayload),
    message || ''
  ]);
}

function isDuplicateApplication_(sheet, payload) {
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return false;

  var rows = sheet.getRange(2, 1, lastRow - 1, 16).getValues();
  var phone = normalizeText_(payload.phone);
  var campusName = normalizeText_(payload.campusName);
  var preferredDate = normalizeText_(payload.preferredDate);
  var preferredTime = normalizeText_(payload.preferredTime);

  for (var i = 0; i < rows.length; i++) {
    var rowPhone = normalizeText_(rows[i][7]);
    var rowCampusName = normalizeText_(rows[i][3]);
    var rowDate = normalizeText_(rows[i][8]);
    var rowTime = normalizeText_(rows[i][9]);

    if (
      rowPhone === phone &&
      rowCampusName === campusName &&
      rowDate === preferredDate &&
      rowTime === preferredTime
    ) {
      return true;
    }
  }

  return false;
}

function getApplicationHeaders_() {
  return [
    '접수일시',
    '학생명',
    '지역',
    '캠퍼스명',
    '캠퍼스 위치',
    '학교명',
    '학년',
    '연락처',
    '희망날짜',
    '희망시',
    '전형과목',
    '알게된 경로',
    '알게된 경로 내용',
    'campusId',
    'subjectId',
    '입력사이트',
    '특이사항',
    '사이트전송상태',
    '처리상태'
  ];
}

function getSubmissionLogHeaders_() {
  return [
    '기록일시',
    '신청내역 행',
    '전송상태',
    '캠퍼스명',
    '전형과목',
    '입력사이트',
    '특이사항',
    '전송예정데이터',
    '메시지'
  ];
}

function getCampusHeaders_() {
  return [
    'campusId',
    '노출순서',
    '구분',
    '지역',
    '캠퍼스명',
    '전형과목',
    '입력사이트',
    'SITE',
    'CONSULTING_IDX',
    'ACAD_ID',
    'AREA_ID',
    'AREA_NAME',
    'ACAD_NAME',
    '특이사항',
    '토요일선택불가'
  ];
}

function getCampusSpreadsheet_() {
  var spreadsheetId = getScriptProperty_('CAMPUS_SPREADSHEET_ID');
  if (spreadsheetId) {
    return SpreadsheetApp.openById(spreadsheetId);
  }
  return SpreadsheetApp.getActiveSpreadsheet();
}

function getApplicationSpreadsheet_() {
  var spreadsheetId = getScriptProperty_('APPLICATION_SPREADSHEET_ID');
  if (spreadsheetId) {
    return SpreadsheetApp.openById(spreadsheetId);
  }
  return SpreadsheetApp.getActiveSpreadsheet();
}

function getScriptProperty_(key) {
  return String(PropertiesService.getScriptProperties().getProperty(key) || '').trim();
}

function getOrCreateCampusSheet_() {
  return getOrCreateSheet_(getCampusSpreadsheet_(), CAMPUS_SHEET_NAME);
}

function getOrCreateApplicationSheet_() {
  return getOrCreateSheet_(getApplicationSpreadsheet_(), APPLICATION_SHEET_NAME);
}

function getOrCreateApplicationNamedSheet_(name) {
  return getOrCreateSheet_(getApplicationSpreadsheet_(), name);
}

function getOrCreateSheet_(ss, name) {
  var sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
  }
  return sheet;
}

function ensureHeader_(sheet, headers) {
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(headers);
    return;
  }

  var current = sheet.getRange(1, 1, 1, headers.length).getValues()[0];
  if (current.join('') === '') {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  }
}

function requireField_(payload, key, label) {
  if (!payload[key]) {
    throw new Error(label + ' 값이 없습니다.');
  }
}

function normalizeText_(value) {
  return String(value == null ? '' : value).replace(/\s+/g, '').trim();
}

function onlyDigits_(value) {
  return String(value == null ? '' : value).replace(/\D/g, '');
}

function getOrigin_(url) {
  var match = String(url || '').match(/^(https?:\/\/[^\/]+)/i);
  return match ? match[1] : '';
}

function cellText_(value) {
  return String(value == null ? '' : value).trim();
}

function findHeaderIndex_(headers, name) {
  var index = headers.indexOf(name);
  return index >= 0 ? index : -1;
}

function findAllHeaderIndexes_(headers, name) {
  var indexes = [];
  for (var i = 0; i < headers.length; i++) {
    if (headers[i] === name) indexes.push(i);
  }
  return indexes;
}

function splitSubjectNames_(value) {
  var text = cellText_(value).replace(/\s+/g, '');
  if (!text) return [];

  if (text === '수학+영어' || text === '영어+수학') {
    return ['수학+영어'];
  }

  return text
    .split(/[,/·ㆍ]+/g)
    .map(function (name) { return name.trim(); })
    .filter(function (name) { return name === '수학' || name === '영어' || name === '수학+영어'; });
}

function makeSubjectId_(name) {
  if (name === '수학') return 'math';
  if (name === '영어') return 'english';
  if (name === '수학+영어') return 'math_english';
  return '';
}

function makeCampusId_(name) {
  var clean = cellText_(name).replace(/\s+/g, '');
  if (clean.indexOf('광진') >= 0) return 'gwangjin';
  if (clean.indexOf('성동') >= 0) return 'seongdong';
  if (clean.indexOf('중랑') >= 0) return 'jungnang';
  if (clean.indexOf('동대문') >= 0) return 'dongdaemun';
  if (clean.indexOf('송파') >= 0) return 'songpa';
  if (clean.indexOf('중계') >= 0) return 'junggye';
  if (clean.indexOf('하남') >= 0 || clean.indexOf('미사') >= 0) return 'hanam_misa';
  return encodeURIComponent(clean).replace(/%/g, '').toLowerCase();
}

function json_(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}
