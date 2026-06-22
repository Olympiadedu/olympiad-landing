# GAS 연결 순서

## 시트 구성

Google Sheets는 2개로 나누는 것을 권장합니다.

- 캠퍼스정보 시트: 캠퍼스, 과목, 입력사이트, 실제 사이트 전송 코드 관리
- 신청내역 시트: 랜딩페이지 신청 누적 저장

캠퍼스정보 시트에는 아래 컬럼이 필요합니다.

```text
campusId
노출순서
구분
지역
캠퍼스명
전형과목
입력사이트
SITE
CONSULTING_IDX
ACAD_ID
AREA_ID
AREA_NAME
ACAD_NAME
특이사항
토요일선택불가
```

`campus-info-template.html`을 브라우저로 열고 표 전체를 복사해서 Google Sheets의 `캠퍼스정보` 시트 A1 위치에 붙여넣으면 됩니다.

## 스크립트 속성

Apps Script의 `프로젝트 설정 > 스크립트 속성`에 아래 값을 입력합니다.

| 속성 | 값 |
|---|---|
| `CAMPUS_SPREADSHEET_ID` | 캠퍼스정보 구글시트 ID |
| `APPLICATION_SPREADSHEET_ID` | 신청내역 구글시트 ID |
| `SITE_SUBMIT_MODE` | 테스트는 `DRY_RUN`, 실제 전송은 `LIVE` |

아래 값들은 캠퍼스정보 시트에 코드가 없을 때만 쓰는 fallback입니다.

| 속성 | 기본값 |
|---|---|
| `MATH_CONSULTING_IDX` | `844` |
| `MATH_ACAD_ID` | `4` |
| `MATH_AREA_ID` | `105A` |
| `GLEC_CONSULTING_IDX` | `844` |
| `GLEC_ACAD_ID` | `4` |
| `GLEC_AREA_ID` | `105A` |
| `U2M_CONSULTING_IDX` | `844` |
| `U2M_ACAD_ID` | `20` |
| `U2M_AREA_ID` | `105O` |

## 동작 방식

- 랜딩페이지는 GAS 웹앱 URL로 신청 데이터를 보냅니다.
- GAS는 신청내역 시트에 먼저 저장합니다.
- GAS는 캠퍼스정보 시트에서 `campusId + 전형과목`에 맞는 행을 찾습니다.
- 실제 사이트 전송 시 해당 행의 `SITE`, `CONSULTING_IDX`, `ACAD_ID`, `AREA_ID` 값을 우선 사용합니다.
- 해당 컬럼 값이 비어 있으면 기존 스크립트 속성 fallback 값을 사용합니다.

## 배포

1. Apps Script에 `Code.gs` 내용을 붙여넣습니다.
2. `setupSheets()`를 한 번 실행합니다.
3. 웹앱으로 배포합니다.
4. 발급된 웹앱 URL을 랜딩페이지 `config.js`의 `gasWebAppUrl`에 입력합니다.

```js
window.appConfig = {
  gasWebAppUrl: "여기에 GAS 웹앱 URL",
};
```

코드를 수정한 뒤에는 Apps Script에서 새 배포가 필요합니다.
