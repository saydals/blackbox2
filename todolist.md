home\betaflight\blackbox2
이 디렉토리는 현재 베타플라이트 블랙박스 뷰어이다.

해야할일
현재 안드로이드 앱 빌드와 vite 빌드를 유지하면서
로터플라이트 블랙박스 뷰어 앱으로 개조해야 함.
로터플라이트 앱의 위치는 home\betaflight\rfblackbox

무엇을 해야하는지 부터 계획을 세워야한다.

사용자가 제일 먼저 생각나는것은 파싱 방법
베타플라이트에서 분석하는 항목과 로터플라이트에서 분석하는 항목이 다르다.
베타플라이트 분석 항목을 지우고 로터플라이트 분석항목으로 바꿔야한다.

예를들면 WP 같은 웨이포인트용 항목은 전혀 필요없다.
반면 베타플라이트에 없는 필수 스와시서보 3개 테일서보 1개 같은것이 필요하다.

또 분석방법도 약간 다르다. 항목 이름이 똑 같더라도 기록방식이 달라서 로터플라이트 블랙박스뷰어가 어떻게 계산해서 보여주는지 알아야한다.

이 문서에 어떤식으로 개조할지 순서를 먼저 작성하고 한단계씩 실행한다.

코드 수정 AI는 각 단계별로 어떤 작업을 했고 나중에 어떤 작업을 해야하는지 자세히 이 문서에 적어놔야

다음 작업시에 문제없이 진행할 수 있다.

---

## 개조 계획 (2026-09-15 수립)

전제: `blackbox2`의 Vite 빌드(`npm run build`)와 Android(Capacitor) 빌드(`npm run android:*`)를
깨지 않으면서, 파싱/분석 계층만 Betaflight → Rotorflight로 교체한다.
참조 구현(정답지): `/home/betaflight/rfblackbox/js/` (구 NW.js 로터플라이트 블랙박스).

- [x] 1단계: 현황 인벤토리 + 파싱 차이 매핑 (코드 변경 없음, 본 문서에 기록) ← 이번 턴 실행
- [x] 2단계: 펌웨어 식별 계층 (`FIRMWARE_TYPE_ROTORFLIGHT=5`, `parseFirmwareRevision`에 Rotorflight 정규식, `firmwareToApiVersion` RF 분기)
- [x] 3단계: `flightlog_fielddefs.js` RF 이식 (RF flight modes 4.2/4.3/4.6, `FEATURES_RF_*`, `DEBUG_MODE_RF_*`, `FAST_PROTOCOL_RF*`, `GOVSTATES`/`RESCUE`/`AIRBORNE`, `MAX_MOTOR_NUMBER` 4, servo 8ch)
- [x] 4단계: `flightlog_fields_presenter.js` RF 이식 (RF friendly names + debug 디코드 RF 분기. BF 출력 바이트 동등 계약)
- [ ] 5단계: `flightlog.js`/`flightlog_parser.js` 계산식 이식 (rcCommand 5ch, motor/servo 변환식, RF 전용 헤더, `isFieldDisabled` RF 플래그)
- [ ] 6단계: 그래프·워크스페이스·UI (RF 기본 워크스페이스 6종: Filter/Governor/Yaw/Pitch/Roll/Power, HeaderDialog RF 파라미터, craft 3D 헬기 표시, GPS/WP UI 정리)
- [ ] 7단계: 브랜딩+빌드 검증 (package.json/applicationId/아이콘/타이틀 Rotorflight, `npm run build`+`android:sync`, RF 샘플 로그 파싱 테스트)

## 4단계 상세 기록 (presenter RF 이식, 2026-09-15)

### 목표

- `flightlog_fields_presenter.js`에 RF friendly names(필드·디버그 라벨) + RF 디코드 분기 이식.
- BF 경로는 단 1바이트도 바꾸지 않는다 (BF 출력 바이트 동등 계약). RF 로그일 때만 RF 테이블·스케일 사용.
- `debugModes.js`(공용 BF 테이블)는 untouched — 2단계 결정 유지.

### 참조

- `rfblackbox/js/flightlog_fields_presenter.js:7-163` (RF FRIENDLY_FIELD_NAMES),
  `:165-669` (DEBUG_FRIENDLY_FIELD_NAMES_INITIAL), `:671-701` (adjustDebugDefsList RF 게이트:
  ITERM_RELAX 4.3+, YAW_PRECOMP 4.5+), `:819-985` (decodeFieldToFriendly RF 케이스),
  `:987-1345` (decodeDebugFieldToFriendly), `:1347-1374` (fieldNameToFriendly).
- 참조에는 `ConvertFieldValue`가 presenter에 없음 → 4단계에서 convert 이식 제외 (5단계 인계).

### 정확 변경점 (1/2: 테이블·디코더)

**A. `flightlog_fields_presenter.js:9-13` (import)**
- `FIRMWARE_TYPE_ROTORFLIGHT`, `getRfDebugModeName`, `getRfDebugModeAll`,
  `FLIGHT_LOG_FEATURES_RF` 추가. BF import 삭제·개명 없음.

**B. RF debug 라벨 테이블 `:195-699` + 버전 빌더 `:701-739`**
- `RF_DEBUG_FRIENDLY_FIELD_NAMES_INITIAL` — 참조 `:165-669` 61개 모드 전부 이식
  (따옴표만 `'...'`→`"..."`, prettier 규격). 키·값 문자열은 참조와 1:1.
- 차이: `let DEBUG_FRIENDLY_FIELD_NAMES=null` 전역 갈아끼우기 대신
  `rfDebugFieldNamesFor(firmwareVersion)` 지연 빌드 캐시 (참조 `:673-701`의
  ITERM_RELAX 4.3+ / YAW_PRECOMP 4.5+ override 동일). 이유: 두 로그를 번갈아 열 때
  전역 오염 방지 (3단계 리스크 1의 동일 패턴).

**C. RF 필드 디코더 `:1072-1242`**
- `decodeFieldRfToFriendly(flightLog, fieldName, value)` — 참조 `:819-985` 이식.
- 스케일 계약: `rcCommand[0..3]` /5(%), `[4]` /10(%), `setpoint[0..2]` °/s 그대로,
  `[3]` x0.012(°), `mixer[0..1]` x0.012 / `[2]` x0.024(°) / `[3]` /10(%),
  `axisP/I/D/F/B/O/Sum/PD` getPIDPercentage(%), `axisError` 반올림 °/s,
  `attitude` /10(°), `gyroADC/gyroRAW` raw °/s, `accADC` accRawToGs(g),
  `Vbat` /100(V)+셀, `Vbec/Vbus/EscV/Esc2V` /100(V), `Ibat/EscI/Esc2I` /100(A),
  `Tmcu/Tesc/Tesc2/Tbec` °C, `EscCap/Esc2Cap` mAh, `EscRPM/Esc2RPM` eRpm,
  `EscThr/EscPwm` /10(%), `altitude/vario` /100(m, m/s), `rssi` /1024(%),
  `headspeed/tailspeed` rpm+Hz, `motor[0..3]` **value/10 인라인** (아래 차이 1),
  `servo[0..7]` µs, `debug[0..7]`→RF debug 디코더, `flightModeFlags/stateFlags`
  presentFlags(RF 조정 테이블), `failsafePhase` presentEnum,
  `features`→**`FLIGHT_LOG_FEATURES_RF`** presentEnum (아래 차이 2).

**D. RF debug 디코더 `:1250-1605`**
- `decodeDebugFieldRfToFriendly(flightLog, fieldName, value)` — 참조 `:987-1345` 이식.
- 모드명 조회만 참조와 다름: 참조 `DEBUG_MODE[idx]` → 본 `getRfDebugModeName(idx)`
  (accessor, 아래 E). 나머지 40개 case의 스케일·단위 문자열은 참조와 동일.

**E. `flightlog_fielddefs.js:752-761` (accessor 추가 — 3단계 파일에 4단계가 추기)**
- `getRfDebugModeName(i)` / `getRfDebugModeAll()` 추가. `DEBUG_MODE_RF_ACTIVE`
  `export let` 재할당(live binding)은 ESM 규격상 동작하지만 번들러 차이를 피하고
  하네스에서 증명된 함정(아래 리스크 1)을 피하기 위해 presenter는 accessor로만 읽는다.

<!-- 4STAGE-PART2 -->

### 정확 변경점 (2/2: 분기·호출부·차이·계약)

**F. BF 경로 분기 2곳 (BF 동작 불변의 핵심)**
- `decodeFieldToFriendly:843-846` — 선두 `if (firmwareType===ROTORFLIGHT) return
  decodeFieldRfToFriendly(...)`. BF는 아래 switch untouched. `flightLog=null`
  호출(values_display statusFlightMode)은 RF 분기 스킵.
- `fieldNameToFriendly:1624-1652` — 시그니처를
  `(fieldName, debugMode, apiVersion, firmwareType?, firmwareVersion?)`로 확장.
  RF일 때만 RF 분기, 그 외(기존 3인자 호출·`undefined`)는 기존 BF 경로 그대로.

**G. 호출부 5곳 (friendlyName에 firmware 전달)**
- `graph_config.js:79-80, 99-100`, `values_display.js:61-67, 87-93`,
  `GraphConfigDialog.vue:505-506` — `sysConfig.firmwareType/firmwareVersion` 추가 전달.
  `graph_spectrum_calc.js:410`(axisError, debugMode 없음)은 변경 불필요.

### 의도적 차이 3건

1. `motor[0..3]` % 변환을 `rcMotorRawToPct` 호출이 아니라 `value/10` 인라인.
   참조 `flightlog.js:987-990`은 `value/10.0`이며 본 뷰어 `FlightLog`엔 이 메서드가 없고
   `rcMotorRawToPctPhysical`(min/maxthrottle·DSHOT 보정, `:1594`)만 있음.
   RF 로그의 motor raw는 0-1000‰이므로 참조식 그대로 인라인. 5단계에서
   `FlightLog.prototype.rcMotorRawToPct` 신설 시 이 줄을 호출로 교체 (인계).
2. `features` 디코드에 BF const가 아니라 `FLIGHT_LOG_FEATURES_RF` 뷰 사용.
   3단계 의도적 차이 1의 후속 — BF const를 갈아끼우지 않기로 했으므로 RF 분기에서 RF 뷰 참조.
3. RF friendly names를 `FRIENDLY_FIELD_NAMES`(BF)에 merge하지 않고 RF debug 테이블만 별도.
   일반 필드 라벨은 decode 경로에서 해결되고, BF 테이블에 RF 키를 섞으면
   BF 로그의 graph_config 라벨 오염 위험이 있어 분리 유지.

### 동작 계약 (before → after)

- BF 로그 (`type=3`, 기존 3인자 호출): RF 분기 조건식만 추가 실행되고 분기 내부로 진입 불가 →
  `decodeFieldToFriendly`·`fieldNameToFriendly` 출력 이전과 동일 (switch·테이블 untouched).
- RF 4.6 로그 (`type=5, "4.6.0"`, debug=GOVERNOR idx 31):
  `decodeFieldRfToFriendly(debug[0],2400)`→`"2400rpm"`, `(debug[3],555)`→`"55.5%"`,
  `fieldNameToFriendly(debug[3],31,1.44,5,"4.6.0")`→`"Gov PID sum"`,
  `ITERM_RELAX/debug[0]`→4.6은 `"Setpoint"`, 4.2는 `"Setpoint HPF [roll]"`.
- RF 4.2 미만: `DEBUG_MODE_RF_ACTIVE=[]` → accessor가 undefined 반환 →
  `fieldNameToFriendly`는 참조와 동일하게 `Debug (<idx>)`/NONE 폴백 + 원본 필드명 반환.
  debug 디코더는 `value.toFixed(0)` 폴백 (참조 `:1342` 동일).

<!-- 4STAGE-PART3 -->

### 검증 (명령+결과)

- `npm run build` — 성공 (`✓ built in 1.63s`).
- `npm run lint` (eslint + typecheck) — 성공. 단, 중간에
  `DEBUG_MODE_RF_ACTIVE` 직접 import 미사용 에러 1건 발생 → import에서 제거하고
  accessor만 사용하도록 수정 후 통과.
- 테이블 동등성 (python3 항목별 비교, 참조 `:165-669` vs 본 `:195-699`):
  61개 모드 키·`debug[k]` 키·라벨 문자열 전부 일치, diff 0.
- 런타임 동등성 (`/tmp/rfharness/verify.mjs`, node v25.6.1, 13 케이스 ALL PASS):
  setpoint/mixer/axisP/motor/headspeed/rssi/features + GOVERNOR debug d0/d3 +
  friendly GOV d0/d3 + ITERM_RELAX 버전 게이트 4.6/4.2.
- BF 불변: `FRIENDLY_FIELD_NAMES`·`decodeFieldToFriendly` BF switch·
  `debugModes.js` 전부 무수정 (diff는 추가 블록 + 선두 분기 + 호출부 인자뿐).

### 롤백

- 4단계 커밋 하나만 되돌리면 됨 (`git log`에서 `Stage 4` 커밋 revert).
- 부분 되돌리기: `decodeFieldToFriendly:843-846` 4줄 + `fieldNameToFriendly`
  RF 블록(`:1628-1652`)만 제거하면 BF와 완전 동일 동작으로 복귀
  (RF 테이블·디코더 함수는 미참조 상태로 남아도 무해).
- `fielddefs.js:756-761` accessor는 제거해도 BF에 영향 없음
  (단, 제거 시 presenter의 import에서 2줄도 함께 제거 — lint 에러 방지).

### 리스크·미결 (에러 발생 시 확인할 순서)

1. **`export let` live binding 하네스 함정 (확정·회피済, 재발 주의)**:
   증상 — 하네스에서 `adjustFieldDefsList(5,"4.6.0")` 후에도 RF debug 디코드가
   전부 `value.toFixed(0)` 폴백으로 떨어짐 (`"2400rpm"`이 `"2400"`으로 나옴).
   원인 — 하네스에서 presenter가 import한 `fielddefs_h.js`와 테스트가 import한
   `fielddefs_h.mjs`가 **내용은 같지만 서로 다른 모듈 인스턴스**로 로드됨
   (`.js` vs `.mjs` 확장자 차이 → Node가 별도 모듈로 취급).
   presenter 스코프의 ACTIVE는 길이 0 그대로, 테스트 스코프 것만 길이 85.
   실코드(단일 Vite 번들)에서는 발생하지 않지만, 교훈으로 accessor 경유를 강제함
   (`fielddefs.js:752-755` 주석). **하네스 재현 시 반드시 확장자를 통일**할 것
   (`.mjs`로 rewire 후 13/13 PASS 확인).
2. `ConvertFieldValue`/`ConvertDebugFieldValue` RF 미대응:
   참조 presenter에 convert가 없어 4단계에서 제외. RF 로그의 차트 단위 변환은
   BF switch를 그대로 타므로 `setpoint/mixer/attitude/headspeed/servo/Esc*` 등의
   차트 스케일이 어긋날 수 있음 → 5단계에서 `flightlog.js`와 함께 다룰 것.
3. `isDigitalProtocol`이 BF `FAST_PROTOCOL` 테이블 기준:
   RF 로그의 `fast_pwm_protocol` 인덱스를 BF 테이블로 해석하므로 motor convert 경로에
   영향 가능. decode(표시값)는 RF 분기로 우회하므로 당장 무해, 5단계에서 RF 테이블 참조로 교체.
4. `graph_spectrum_calc.js:410` 미변경: `axisError` 라벨이라 RF 영향 없음. 향후 RF 스펙트럼
   축 라벨이 필요해지면 그때 인자 추가.
5. RF 실로그 E2E 미수행 (샘플 `.bbl` 없음 — 2단계 리스크 4와 동일). 7단계에서 RF 샘플 확보 후
   `decodeFieldRfToFriendly` 전체 케이스 + friendlyName 그래프 표시까지 실로그로 검증.

### 다음 단계 인계 (5단계)

- 범위: `flightlog.js` + `flightlog_parser.js` 계산식. 4단계의 `motor value/10` 인라인을
  `FlightLog.prototype.rcMotorRawToPct` 신설로 교체하고 presenter에서 호출.
- `ConvertFieldValue`/`ConvertDebugFieldValue`에 RF 분기 추가
  (`setpoint/mixer/attitude/headspeed/tailspeed/servo[0..7]/Esc*/Bec*/Tmcu*`).
- `isFieldDisabled`·`isDigitalProtocol`·`estimateNumMotors`에 RF 분기
  (`MAX_MOTOR_NUMBER_RF=4`, `FAST_PROTOCOL_RF_ACTIVE` 사용).
- RF 전용 헤더(`motor_poles`, gov 관련 헤더) 파싱 확인 — 2단계 파서 분기와 연결.

### 용어/경로 메모

- `blackbox2/src/blackbox-viewer/*` ≒ `rfblackbox/js/*` (파일명 거의 1:1 대응).
- BF 디버그 정의는 공용 소스(`src/js/utils/debugModes.js` + `debug_*_table.ts`, `scripts/generate-debug-modes.mjs` 생성)로 이전됨. RF는 `flightlog_fielddefs.js` 안에 `DEBUG_MODE_RF_*` 하드코딩 → 이식 시 공용 테이블 확장 vs fielddefs 내장 중 택1 (2단계에서 결정).
- RF `MAX_MOTOR_NUMBER = 4`, BF = 8. RF servo는 8ch(`servo[0..7]`, 스와시 3+테일 1 포함), BF는 사실상 `servo[5]`(Tail)만 사용.

## 1단계 실행 결과 (현황 인벤토리 + 차이 매핑)

### 1-1. 파일 대응표 (아래 실측치는 `wc -l`/`find` 기준)

| blackbox2 (현행 BF, Vue3+Vite)                                     | rfblackbox (참조 RF, NW.js)                                               | 비고                                                                              |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `src/blackbox-viewer/flightlog_parser.js` (2020줄)                 | `js/flightlog_parser.js` (1886줄)                                         | RF는 `Firmware type=Rotorflight`, `Firmware revision=Rotorflight x.y.z` 분기 보유 |
| `src/blackbox-viewer/flightlog_fielddefs.js` (436줄, debug 분리됨) | `js/flightlog_fielddefs.js` (1076줄, RF 테이블 내장)                      | RF가 약 640줄 많음 = 이식 본체                                                    |
| `src/blackbox-viewer/flightlog.js` (1794줄)                        | `js/flightlog.js` (1145줄)                                                | RF가 짧음(구 BF 4.3 기반). 계산식만 선별 이식                                     |
| `src/blackbox-viewer/flightlog_fields_presenter.js` (770줄)        | `js/flightlog_fields_presenter.js` (1375줄)                               | RF가 약 600줄 많음 = friendly names+debug 라벨 본체                               |
| `src/blackbox-viewer/graph_config.js`                              | `js/graph_config.js`                                                      | motor/servo 기본 커브·스무딩 RF식 확인 필요                                       |
| `src/blackbox-viewer/ws_*.json` (BF 멀티콥터 프리셋)               | `js/default_workspaces.js` (RF 6종: Filter/Governor/Yaw/Pitch/Roll/Power) | 6단계에서 교체                                                                    |
| `src/js/utils/debugModes.js`+`debug_*_table.ts`                    | (없음, fielddefs 내장)                                                    | 아키텍처 차이, 2단계 결정 사항                                                    |
| `capacitor.config.*`+`android/` (`com.betaflight.blackboxviewer`)  | (없음, NW.js)                                                             | 유지 대상. 브랜딩만 7단계에서 변경                                                |

### 1-2. 파싱 핵심 차이 (todolist 본문 질문에 대한 답)

1. 펌웨어 식별: RF 파서는 `Firmware revision: Rotorflight 4.x.y`를 정규식으로 잡아 `FIRMWARE_TYPE_ROTORFLIGHT=5` 부여. BF 파서(`parseFirmwareRevision`)는 Beta/Race/Clean/Base/Butter+INAV만 인식 → Rotorflight 로그가 오면 `0.0.0` 폴백됨. → 2단계 최우선.
2. 제거 대상(BF 전용): WP/웨이포인트·GPS Rescue 계열(`GPSRESCUE`, `gpsCartesianCoords`, `GPS_velned` 일부), `motor[4..7]`(5~8번 모터), 멀티콥터 craft_2d/3d, BF flight modes(`ACROTRAINER`, `LAUNCHCONTROL` 등).
3. 추가 대상(RF 전용): swash servo 3 + tail servo 1 포함 `servo[0..7]` 8ch, `motor[0..3]` 4ch, `rcCommand[3]` collective·`[4]` throttle, `setpoint[3]` collective, `mixer[0..3]` SR/SP/SY/SC, `headspeed`·`tailspeed`, `govP/I/D/F/Sum/Request/Target`, `Vbec/Vbus/Tesc/Tbec/Esc*·Bec*`, `GOVERNOR_STATE(50)`·`RESCUE_STATE(51)`·`AIRBORNE_STATE(52)`·`CUSTOM_DATA(100)` 이벤트, `FLIGHT_LOG_GOVSTATES`·`RESCUE_STATES`·`AIRBORNE_STATES`, RF flight modes (`RESCUE`, `GOV*`, `USER1..4` 등 버전별 3종).
4. 같은 이름·다른 계산: `motor[]` % 변환(RF `rcMotorRawToPct` vs BF `rcMotorRawToPctPhysical`), `servo[]` 스케일(RF 전ch vs BF tail 한정), `eRPM→rpm` 변환의 `motor_poles` 사용법, filter 헤더(`/100` 여부) 분기 조건에 RF 포함 여부. → 5단계에서 함수 단위 diff 후 이식.
5. 빌드 유지 조건: `npm run build`(vite→`dist/`), `npm run android:sync/open/run`(Capacitor). 1단계에서 기준 빌드 상태 확인(아래 1-3).

### 1-3. 기준 빌드 상태 (1단계 검증)

- `npm run build` (2026-09-15, node v25.6.1): 성공 (EXIT 0, `✓ built in 1.72s`, `dist/` 출력 확인).
- Android(Capacitor) 빌드는 코드 미변경 단계이므로 생략, 2단계 이후 변경 시 `android:sync`로 검증.
- 다음(2단계) 착수 조건: 본 계획 승인. 2단계는 파서 1곳만 건드리는 최소 diff로 진행.

## 2단계 실행 결과 (펌웨어 식별 계층, 2026-09-15)

### 2-1. 변경 파일 (최소 diff, BF 기존 동작 유지)

- `src/blackbox-viewer/flightlog_fielddefs.js`: `FIRMWARE_TYPE_ROTORFLIGHT = 5` 추가 (참조 `rfblackbox`와 동일 값).
- `src/blackbox-viewer/flightlog_parser.js`:
  - `FIRMWARE_TYPE_ROTORFLIGHT` import + `firmwareToApiVersion` export (테스트/후속 단계에서 재사용).
  - `parseFirmwareRevision` 정규식에 `Rotor` alternation + `rotorflight` 매핑 추가 → `Rotorflight 4.6.0` → type=5, version=`4.6.0` (이전엔 `0.0.0` 폴백).
  - `HEADER_HANDLERS["Firmware type"]`에 `"Rotorflight"` 분기 추가 (참조와 동일한 3항 분기).
  - `isModernFilterFirmware()` + `accelLimitHandler`에 RF=modern 취급 추가 (참조가 RF를 무조건 modern 분기로 처리).
  - `gyroScaleHandler`에 RF 포함 (RF 로그도 deg/s + `gyro_scale=1.0` 이므로 BF와 동일하게 rad/us 변환 — 참조는 IMU 경로가 없어 변환 자체가 없으나, 본 뷰어 `imu.js`는 rad/us 기준이므로 변환 필요).
  - `firmwareToApiVersion` JSDoc에 RF 결정 기록: RF는 공용 BF 디버그 테이블로 매핑하지 않고 `API_VERSION_1_44` 폴백 유지, 3/4단계에서 fielddefs 내장 `DEBUG_MODE_RF_*` 우선 사용.
- `src/blackbox-viewer/tools.js`: `firmwareGreaterOrEqual()`이 RF면 무조건 `true` (참조가 모든 버전 게이트에서 RF를 modern branch로 처리).
- `src/blackbox-viewer/stores/log.js`: `FIRMWARE_CLASS_MAP`에 `[5]: "isRF"` 추가 (참조 `$('html').addClass('isRF')` 대응, 기존 `isBF/isCF/isINAV/isBaseF` 유지).

### 2-2. RF 디버그 테이블 아키텍처 결정 (용어 메모 질문에 대한 답)

- 택1안 (채택): `flightlog_fielddefs.js` 안에 `DEBUG_MODE_RF_*` 내장 (참조 `rfblackbox` 방식). 이유: RF enum은 BF `debug.h`와 무관하고, 공용 생성기(`scripts/generate-debug-modes.mjs`, betaflight 소스 기준)에 RF 소스를 끼우면 provenance/버전 키(API 버전)가 깨짐.
- 공용 `src/js/utils/debugModes.js` + `debug_*_table.ts`는 BF 전용으로 유지. 4단계 presenter에서 `firmwareType===ROTORFLIGHT`일 때만 fielddefs RF 테이블을 우선 참조하는 분기로 구현 예정.

### 2-3. 검증

- `npm run build`: 성공 (EXIT 0, `✓ built in 1.54s`).
- `npm run typecheck` (`vue-tsc --noEmit`): 성공 (출력 없음 = 에러 없음).
- 정규식 단위 확인: `Rotorflight 4.6.0`/`4.3.1` → `[Rotorflight,4,6/3,x]`, BF 문자열 기존 매칭 유지, `INAV`는 별도 분기 그대로(null).
- 다음(3단계) 착수 조건: 본 보고 승인. 3단계는 `flightlog_fielddefs.js`에 RF 테이블 이식 (BF 테이블 삭제 없음, RF 분기 추가만).

## 문서 기록 규격 (전 단계 공통, 2026-09-15~)

- 각 단계는 `목표 / 참조 / 정확 변경점(파일:줄·함수·이전→이후) / 동작 계약(before→after 예시) / 검증(명령+결과) / 롤백 / 리스크·미결` 7항목으로 기록한다.
- `참조`는 `/home/betaflight/rfblackbox/js/<파일>` 줄번호까지 적는다. 줄번호는 2026-09-15 기준 실측이며 drift 시 `grep -n`으로 재확인.
- `검증`은 반드시 `npm run build` + `npm run typecheck`를 포함하고, 파서 변경 시 정규식/분기 단위 케이스를 별도 기재한다.
- 롤백 단위: git 커밋 (`ad58b4d` = 1·2단계 기준점). 단계별 추가 커밋으로 되돌릴 수 있게 한다.
- 빌드 유지 조건: `npm run build`(vite→`dist/`), `npm run android:sync/open/run`(Capacitor). 본 단계까지 Android 실빌드는 미수행, 7단계에서 수행.

## 1단계 상세 기록 (보강 — 코드 변경 없음)

### 목표

- BF 뷰어(`blackbox2`, Vue3+Vite)와 RF 참조(`rfblackbox`, NW.js)의 파싱/분석 계층 대응표 작성, RF 이식 범위 확정.

### 참조

- `blackbox2/src/blackbox-viewer/*` ≒ `rfblackbox/js/*` (파일명 1:1).
- 실측 (2026-09-15, `wc -l`): `flightlog_parser.js` 2020 vs 1886줄, `flightlog_fielddefs.js` 436 vs 1076줄, `flightlog.js` 1794 vs 1145줄, `flightlog_fields_presenter.js` 770 vs 1375줄.

### 정확 관찰점 (에러 추적용)

1. `blackbox2/.../flightlog_parser.js:823-857 parseFirmwareRevision` — `(Beta|Race|Clean|Base|Butter)flight`만 인식, RF 입력 시 `firmwareVersion="0.0.0"` 폴백.
2. `HEADER_HANDLERS["Firmware type"]:1023-1025` — `Cleanflight` 외 전부 BASEFLIGHT 처리, `Rotorflight` 분기 없음.
3. `isModernFilterFirmware:814-818`, `accelLimitHandler:929-936` — RF를 modern으로 보지 않음 → RF 로그의 `/100`, `/1000` 스케일 오적용 가능.
4. `firmwareToApiVersion:58-87` — BF가 아니면 전부 `API_VERSION_1_44` (RF 디버그 테이블 결정과 연결, 2단계 상세 참조).
5. RF 참조 측 근거: `rfblackbox/js/flightlog_parser.js:622-648` (Firmware type 분기), `:953-1010` (revision 정규식 + ROTORFLIGHT 분기), `:810-844` (RF 무조건 modern branch).

### 동작 계약

- 변경 없음이 계약. `npm run build` 기준선만 확보.

### 검증

- `npm run build` (node v25.6.1): 성공 EXIT 0, `✓ built in 1.72s`, `dist/` 출력.
- Android 빌드는 미수행 (코드 미변경이므로 스킵, 기록만).

### 롤백

- 해당 없음 (코드 변경 없음, 문서만 추가).

### 리스크·미결 → 2단계 이관

## 2단계 상세 기록 (보강 — 펌웨어 식별 계층)

### 목표

- RF 로그가 `type=5 / version=x.y.z`로 식별되고, 이후 단계가 `firmwareType===5` 분기로 RF 테이블·계산식을 탈 수 있게 최소 식별 계층을 만든다. BF 기존 동작은 1비트도 바꾸지 않는다.

### 참조 매핑

| 참조 (`rfblackbox/js/flightlog_parser.js`) | 이식 (`blackbox2/src/blackbox-viewer/flightlog_parser.js`) | 비고                                                   |
| ------------------------------------------ | ---------------------------------------------------------- | ------------------------------------------------------ |
| `:5-10` FIRMWARE 상수 (`ROTORFLIGHT=5`)    | `flightlog_fielddefs.js:19` 동일 값 추가                   | ID 충돌 없음 (기존 0~4 유지)                           |
| `:957-958` revision 정규식                 | `:835-838` alternation에 `Rotor` 추가                      | 참조 `.*flight`는 과매칭 가능 → 명시형 유지, 동작 동등 |
| `:970-977` revision→ROTORFLIGHT            | `:839-845` `rotorflight` 맵 항목                           | 소문자 키, 대소문자 무시 플래그 유지                   |
| `:632-639` Firmware type 분기              | `:1044-1051` 동일 3항 분기                                 | `Rotorflight/Cleanflight/else`                         |
| `:810-844` RF=modern 3곳                   | `:825-830` + `:943-952` 동일 취급                          | filter `/100`·accel `/1000`                            |
| `:949-951` gyroScale 무변환                | `:979-995` RF 포함 변환 (의도적 차이)                      | 아래 리스크 1 참조                                     |
| 없음 (구 뷰어에 apiVersion 개념 없음)      | `:49-55` JSDoc + `:68` export                              | RF는 1.44 폴백 유지 선언                               |

### 정확 변경점 (파일:줄 — 2026-09-15 기준)

- `flightlog_fielddefs.js:19` — `export const FIRMWARE_TYPE_ROTORFLIGHT = 5;` 1줄 추가.
- `flightlog_parser.js:2-10` — import에 `FIRMWARE_TYPE_ROTORFLIGHT` 추가.
- `flightlog_parser.js:49-55` — `firmwareToApiVersion` JSDoc에 RF 결정문 추가 (동작 변경 없음, RF→1.44 폴백 명시).
- `flightlog_parser.js:68` — `function` → `export function firmwareToApiVersion` (후속 단계·테스트 재사용).
- `flightlog_parser.js:825-830` — `isModernFilterFirmware`에 `firmwareType===ROTORFLIGHT ||` 선행 추가.
- `flightlog_parser.js:835-845` — 정규식 `((?:Beta|Race|Clean|Base|Butter|Rotor)flight)` + 맵에 `rotorflight: 5`.
- `flightlog_parser.js:943-952` — `accelLimitHandler`에 `isRf` 추가, `isRf||isBfModern||isCfModern ? /1000 : raw`.
- `flightlog_parser.js:979-995` — `gyroScaleHandler` if문에 `|| FIRMWARE_TYPE_ROTORFLIGHT` + 사유 주석 4줄.
- `flightlog_parser.js:1044-1051` — `Firmware type` 핸들러를 `if (Rotorflight)/else` 분기로 교체.
- `tools.js:2-6` — import에 `FIRMWARE_TYPE_ROTORFLIGHT` 추가.
- `tools.js:395-400` — `firmwareGreaterOrEqual` 선두에 `if (RF) return true;` + 사유 주석.
- `stores/log.js:3-16` — import + `FIRMWARE_CLASS_MAP[5]="isRF"` 추가.

### 동작 계약 (before → after)

#### 2-4. 후속 작업자를 위한 파일별 주의점

- `flightlog_parser.js` — 함수 스코프가 `FlightLogParser(logData)` 클로저 + `this.sysConfig` 공유. `parseFirmwareRevision`은 `HEADER_HANDLERS["Firmware revision"]`에서만 호출(`:1090` 부근). 순서 의존성: `Firmware type` 핸들러가 먼저 와도 `Firmware revision`이 덮어쓰므로 문제없음 (참조도 동일 순서 무관).

- `tools.js:firmwareGreaterOrEqual` — RF 조기 `return true`이므로, RF 전용 하한(4.2)을 걸고 싶으면 이 함수 시그니처를 바꾸지 말고 호출 측에서 `firmwareType` 분기를 추가할 것.

- `stores/log.js` — `FIRMWARE_CLASSES`는 CSS 클래스 바인딩(`isRF`)에만 사용. 실제 스타일 정의는 6단계 UI 작업에서 추가 예정.

- `H Firmware revision: Rotorflight 4.6.0` → before `type=0/UNKNOWN, version=0.0.0` / after `type=5, firmware=4.6, patch=0, version=4.6.0`.

- `H Firmware type: Rotorflight` → before BASEFLIGHT(1) / after ROTORFLIGHT(5).

- `H Firmware revision: Betaflight 4.5.4 (norevision) STM32F405` → 전후 동일 (`type=3, version=4.5.4`).

- `H Firmware revision: INAV 7.0.0` → 전후 동일 (별도 INAV 분기, untouched).

- RF 로그의 `yaw_lpf_hz/gyro_lowpass_hz/...` → before 구분기(raw/100) / after modern(raw 그대로). `rateAccelLimit` → before raw / after /1000.

- `firmwareToApiVersion(5, "4.6.0")` → `"1.44.0"` (폴백 유지, 3/4단계에서 fielddefs RF 테이블 우선으로 커버).

### 검증 (명령+결과, 2026-09-15 재확인)

- `npm run build` — 성공 EXIT 0, `✓ built in 1.54s`.
- `npm run typecheck` (`vue-tsc --noEmit`) — 성공, 출력 없음.
- 정규식 단위 (`/tmp/rf_parse_test.mjs`, node v25.6.1): `Rotorflight 4.6.0→[Rotorflight,4,6,0]`, `4.3.1→[..,3,1]`, BF 문자열 매칭 유지, `INAV`는 본 정규식에서 null(별도 분기 정상).
- 미수행: RF 실로그 파싱 E2E (샘플 `.bbl` 없음 — `configurator/log/*.bbl`, `autopilot/*.bbl` 전부 BF 4.5.4 확인). → 7단계에서 RF 샘플 확보 후 수행.

### 롤백

- 기준 커밋 `ad58b4d "Stage 1-2: inventory + Rotorflight firmware identification layer"`.
- 전체 되돌리기: `git revert ad58b4d` 또는 해당 커밋 이전으로 reset.
- 부분 되돌리기: `gyroScaleHandler` RF 포함만 의심되면 `flightlog_parser.js:984-991`의 `|| FIRMWARE_TYPE_ROTORFLIGHT` 1조건 + 주석 4줄만 제거하면 BF와 완전 동일 동작으로 복귀.

### 리스크·미결 (에러 발생 시 확인할 순서)

1. `gyroScale` 이중변환 의심: RF `gyro_scale=1.0`(deg/s 가정) × 본 뷰어 rad/us 변환이 맞는지 RF 실로그로 미검증. 증상: posture 드리프트, gyro °/s 불일치 → `flightlog_parser.js:979-995` ↔ `imu.js:97-108` ↔ `flightlog.js:1451-1453` 3곳을 함께 볼 것.
2. `firmwareGreaterOrEqual` RF 무조건 true: RF 4.2 미만 로그 존재 시 과modern 판정 가능. RF 테이블 하한이 4.2이므로 실용상 안전하나, 구 RF 로그 발견 시 `semver.gte(version,"4.2.0")`로 강화 (`tools.js:395-400`).
3. `Firmware revision` 과매칭: 참조 `(.*flight)` 대비 명시형이라 변종에 덜 관대. 변종 발견 시 alternation에 추가.
4. 디버그 테이블 미이식 상태: 2단계까지는 RF 로그의 debug 라벨이 BF 1.44 테이블로 표시됨 (오표시 정상). 3단계+4단계 완료 후 해소.

### 다음 단계 인계 (3단계)

- 범위: `flightlog_fielddefs.js`에만 RF 상수·테이블 추가, BF 기존 export 삭제·개명 금지.
- 이식 목록: `FlightLogEvent`에 `GOVERNOR_STATE:50, RESCUE_STATE:51, AIRBORNE_STATE:52, CUSTOM_DATA:100, CUSTOM_STRING:101` 추가(기존 유지), `FLIGHT_LOG_FLIGHT_MODE_NAME_RF_4_2/4_3/4_6`, `FLIGHT_LOG_FEATURES_RF_4_2/4_3`(+BF 별칭 유지), `FAST_PROTOCOL_RF / RF_4_5`, `DEBUG_MODE_RF_4_2/4_3/4_6`, `FLIGHT_LOG_GOVSTATES_RF / RF_4_6`, `FLIGHT_LOG_RESCUE_STATES`, `FLIGHT_LOG_AIRBORNE_STATES`, `RATES_TYPE`에 `ROTORFLIGHT` 추가, `adjustFieldDefsList` 선두에 RF 분기(참조 `:962-1014` 그대로, BF else-if는 현행 2025.12/2026.x 로직 유지).
- 금지: `MAX_MOTOR_NUMBER=8→4` 변경 금지 (3단계에서 `MAX_MOTOR_NUMBER_RF=4` 별도 export 후 5단계에서 사용처 분기. 즉시 4로 바꾸면 `flightlog.js:330 estimateNumMotors`의 BF 8모터 로그 카운트가 깨짐).
- 검증: `npm run build` + `typecheck` + RF 테이블 길이 단언.

## 3단계 상세 기록 (fielddefs RF 이식, 2026-09-15)

### 목표

- `flightlog_fielddefs.js` 단일 파일에만 RF 테이블·상수 추가. BF 기존 export 삭제·개명·재배열 금지. `adjustFieldDefsList`는 RF 분기를 선두에 추가하고 BF 분기는 untouched.

### 참조

- `rfblackbox/js/flightlog_fielddefs.js:14` (MOTOR 4), `:18-37` (Event), `:139-238` (RF flight modes 3종), `:269-335` (FEATURES RF 2종), `:356-381` (FAST_PROTOCOL RF 2종), `:526-769` (DEBUG RF 3종), `:886-925` (GOV/RESCUE/AIRBORNE), `:927-935` (RATES_TYPE+ROTORFLIGHT), `:962-1014` (adjust RF 분기).

### 정확 변경점 (`flightlog_fielddefs.js` 단일 파일)

- 상수: `MAX_MOTOR_NUMBER=8` 유지 + `MAX_MOTOR_NUMBER_RF=4`, `MAX_SERVO_NUMBER_RF=8` 별도 export (즉시 교체 금지 — `flightlog.js:330 estimateNumMotors` 보호).
- `FlightLogEvent`: `GOVERNOR_STATE:50, RESCUE_STATE:51, AIRBORNE_STATE:52, CUSTOM_DATA:100, CUSTOM_STRING:101` 추가. BF 키(`AUTOTUNE_*` 10-12, `GTUNE 20`, `TWITCH 40`) 유지 — `grapher.js:533-600`, `flightlog_parser.js:1687-1729` case 참조 보호.
- `FLIGHT_LOG_FLIGHT_MODE_NAME_RF_4_2/4_3/4_6` 3종 추가.
- `FLIGHT_LOG_FEATURES_BF` 별칭(=기존 const) + `FLIGHT_LOG_FEATURES_RF_4_2/4_3` + mutable `FLIGHT_LOG_FEATURES_RF=[]` 추가. 참조처럼 const 갈아끼우지 않음 — presenter가 직접 import 중이라 const 유지 필수.
- `FAST_PROTOCOL_RF/RF_4_5` + mutable `FAST_PROTOCOL_RF_ACTIVE=[]` 추가 (`FAST_PROTOCOL` const 유지).
- `DEBUG_MODE_RF_4_2/4_3/4_6` + mutable `DEBUG_MODE_RF_ACTIVE=[]` 추가 (공용 `debugModes.js` untouched).
- `FLIGHT_LOG_GOVSTATES_RF/RF_4_6`, `FLIGHT_LOG_RESCUE_STATES`, `FLIGHT_LOG_AIRBORNE_STATES`, mutable `FLIGHT_LOG_GOVSTATES_RF_ACTIVE` 추가.
- `RATES_TYPE`에 `"ROTORFLIGHT"` append (index 5, 참조 `:934` 동일 위치. `graph_config.js:598-599`는 `ACTUAL/QUICK` 매칭이라 영향 없음).
- `adjustFieldDefsList` 선두에 RF 분기 + `return` (참조 게이트 그대로: modes 4.6/4.3/4.2, features 4.3/4.2, debug 4.6/4.3/4.2, gov 4.6/else, fast 4.5/else). RF 4.2 미만은 빈 배열 + 4단계에서 BF 폴백·경고 계약.

### 의도적 차이 2건

1. `FLIGHT_LOG_FEATURES/FAST_PROTOCOL`을 mutable로 갈아끼우지 않고 `*_RF_ACTIVE` 별도 뷰를 둠. 본 뷰어는 `flightlog_fields_presenter.js:4`, `flightlog.js:11`, `HeaderDialog.vue:206`이 const를 직접 import하므로 갈아끼우면 BF 로그까지 오염됨. 4단계에서 RF 로그일 때만 RF 뷰 우선 참조.
2. `FLIGHT_LOG_RESCUE_STATES`/`AIRBORNE`는 `*_RF` 접미 없이 export (참조도 접미 없음 `:913/:922`). BF에 동명 상수 없어 충돌 없음.

### 동작 계약 (before → after)

- BF 로그 (`type=3`): RF 분기 스킵 → 기존 BF 분기 그대로 → modes/features/debug 전부 이전과 동일.
- RF 4.6 (`type=5, "4.6.0"`): modes=RF_4_6 (32항, `[25]=GOVFALLBACK`), `DEBUG_MODE_RF_ACTIVE`=RF_4_6 (85항, `[79]=GOV_MOTOR, [80]=POLAR_RATE`), `FEATURES_RF`=RF_4_3 (31항, `[26]=GOVERNOR`), `GOV_ACTIVE`=RF_4_6 (10항, `[2]=SPOOLUP`), `FAST_RF_ACTIVE`=RF_4_5 (11항, `[9]=CASTLE_LINK, [10]=DISABLED`).
- RF 4.3/4.2: 대응 버전 테이블로 폴백. RF 4.2 미만: 5개 뷰 빈 배열 → 4단계에서 BF 폴백 + 경고.

### 검증 (명령+결과, 2026-09-15)

- `npm run build` — 성공 EXIT 0 (chunk 경고만, 기존과 동일).
- `npm run typecheck` — 성공, 출력 없음.
- `npm run lint` — 성공 (eslint + typecheck).
- 테이블 동등성 (python3 항목별 비교): 12개 테이블 전부 OK — modes 31/29/32항, features 31/31항, debug 68/83/85항, gov 9/10항, fast 10/11항.
- 인덱스 단언: `FEATURES_RF_4_3[26]=GOVERNOR`, `DEBUG_RF_4_6[79]=GOV_MOTOR, [80]=POLAR_RATE, [84]=USER4`, `GOV_RF_4_6[2]=SPOOLUP` vs `GOV_RF[2]=SPOOLING_UP`, `FAST_RF_4_5[9]=CASTLE_LINK, [10]=DISABLED`, `MODES_RF_4_6[25]=GOVFALLBACK, [31]=USER4` — 전부 OK.
- BF 불변: `FLIGHT_LOG_FEATURES` 24항, `FAST_PROTOCOL`에 `DSHOT1200` 유지, `RATES_TYPE` 기존 5개 순서 유지 + `ROTORFLIGHT`만 append.

### 롤백

- 3단계 커밋 하나만 되돌리면 됨. 부분 되돌리기 시 `adjustFieldDefsList` RF 분기 + `return`만 제거하면 BF 경로로 완전 복귀 (추가 const는 미사용 상태로 남아도 무해).

### 리스크·미결

1. `FLIGHT_LOG_FLIGHT_MODE_NAME`이 RF 로그 파싱 시 RF 테이블로 교체되므로, BF→RF 순서로 파일을 열면 잔류 가능. 참조도 동일 구조라 동일 리스크. 증상: 두 번째 로그의 mode 라벨이 이전 것 → `flightlog_parser.js:1829-1830` 호출 여부 확인할 것.
2. `RATES_TYPE` append로 `HeaderDialog.vue:448` select에 새 항목 노출 — 6단계 UI 정리에서 교체 예정, 그 전까지 표시만 됨.
3. `FLIGHT_LOG_FEATURES` const vs RF 뷰 이중화: 4단계 presenter가 RF 분기를 빠뜨리면 RF 로그 feature가 BF 이름으로 표시됨. 4단계 검증에서 RF feature 케이스 필수.

### 다음 단계 인계 (4단계)

- 범위: `flightlog_fields_presenter.js`만. RF friendly names + debug 라벨 RF 우선 분기.

- 계약: BF 로그 presenter 출력은 바이트 단위 동등. RF 로그일 때만 `*_RF_ACTIVE` 뷰 + RF 스케일 사용.

- RF `gyro_scale` 변환 여부: 참조는 변환 없음(IMU 경로 없음)이나 본 뷰어는 `imu.js:97-108`이 rad/us 기준 → 2단계에서 BF 동일 변환으로 포함 결정.

- RF 디버그 테이블 위치: 공용 `debugModes.js` 확장 vs fielddefs 내장 → 2단계에서 후자 채택.
