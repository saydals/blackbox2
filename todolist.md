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

---
## 개조 계획 (2026-09-15 수립)

전제: `blackbox2`의 Vite 빌드(`npm run build`)와 Android(Capacitor) 빌드(`npm run android:*`)를
깨지 않으면서, 파싱/분석 계층만 Betaflight → Rotorflight로 교체한다.
참조 구현(정답지): `/home/betaflight/rfblackbox/js/` (구 NW.js 로터플라이트 블랙박스).

- [x] 1단계: 현황 인벤토리 + 파싱 차이 매핑 (코드 변경 없음, 본 문서에 기록) ← 이번 턴 실행
- [x] 2단계: 펌웨어 식별 계층 (`FIRMWARE_TYPE_ROTORFLIGHT=5`, `parseFirmwareRevision`에 Rotorflight 정규식, `firmwareToApiVersion` RF 분기)
- [ ] 3단계: `flightlog_fielddefs.js` RF 이식 (RF flight modes 4.2/4.3/4.6, `FEATURES_RF_*`, `DEBUG_MODE_RF_*`, `FAST_PROTOCOL_RF*`, `GOVSTATES`/`RESCUE`/`AIRBORNE`, `MAX_MOTOR_NUMBER` 4, servo 8ch)
- [ ] 4단계: `flightlog_fields_presenter.js` RF 이식 (collective/mixer SC/headspeed·tailspeed/gov/BEC·ESC2 friendly names, servo[0..7]·motor 4ch 스케일, WP/웨이포인트·불필요 GPS 항목 제거, debug 라벨 RF 테이블)
- [ ] 5단계: `flightlog.js`/`flightlog_parser.js` 계산식 이식 (rcCommand 5ch, motor/servo 변환식, RF 전용 헤더, `isFieldDisabled` RF 플래그)
- [ ] 6단계: 그래프·워크스페이스·UI (RF 기본 워크스페이스 6종: Filter/Governor/Yaw/Pitch/Roll/Power, HeaderDialog RF 파라미터, craft 3D 헬기 표시, GPS/WP UI 정리)
- [ ] 7단계: 브랜딩+빌드 검증 (package.json/applicationId/아이콘/타이틀 Rotorflight, `npm run build`+`android:sync`, RF 샘플 로그 파싱 테스트)

### 용어/경로 메모
- `blackbox2/src/blackbox-viewer/*` ≒ `rfblackbox/js/*` (파일명 거의 1:1 대응).
- BF 디버그 정의는 공용 소스(`src/js/utils/debugModes.js` + `debug_*_table.ts`, `scripts/generate-debug-modes.mjs` 생성)로 이전됨. RF는 `flightlog_fielddefs.js` 안에 `DEBUG_MODE_RF_*` 하드코딩 → 이식 시 공용 테이블 확장 vs fielddefs 내장 중 택1 (2단계에서 결정).
- RF `MAX_MOTOR_NUMBER = 4`, BF = 8. RF servo는 8ch(`servo[0..7]`, 스와시 3+테일 1 포함), BF는 사실상 `servo[5]`(Tail)만 사용.

## 1단계 실행 결과 (현황 인벤토리 + 차이 매핑)
### 1-1. 파일 대응표 (아래 실측치는 `wc -l`/`find` 기준)
| blackbox2 (현행 BF, Vue3+Vite) | rfblackbox (참조 RF, NW.js) | 비고 |
|---|---|---|
| `src/blackbox-viewer/flightlog_parser.js` (2020줄) | `js/flightlog_parser.js` (1886줄) | RF는 `Firmware type=Rotorflight`, `Firmware revision=Rotorflight x.y.z` 분기 보유 |
| `src/blackbox-viewer/flightlog_fielddefs.js` (436줄, debug 분리됨) | `js/flightlog_fielddefs.js` (1076줄, RF 테이블 내장) | RF가 약 640줄 많음 = 이식 본체 |
| `src/blackbox-viewer/flightlog.js` (1794줄) | `js/flightlog.js` (1145줄) | RF가 짧음(구 BF 4.3 기반). 계산식만 선별 이식 |
| `src/blackbox-viewer/flightlog_fields_presenter.js` (770줄) | `js/flightlog_fields_presenter.js` (1375줄) | RF가 약 600줄 많음 = friendly names+debug 라벨 본체 |
| `src/blackbox-viewer/graph_config.js` | `js/graph_config.js` | motor/servo 기본 커브·스무딩 RF식 확인 필요 |
| `src/blackbox-viewer/ws_*.json` (BF 멀티콥터 프리셋) | `js/default_workspaces.js` (RF 6종: Filter/Governor/Yaw/Pitch/Roll/Power) | 6단계에서 교체 |
| `src/js/utils/debugModes.js`+`debug_*_table.ts` | (없음, fielddefs 내장) | 아키텍처 차이, 2단계 결정 사항 |
| `capacitor.config.*`+`android/` (`com.betaflight.blackboxviewer`) | (없음, NW.js) | 유지 대상. 브랜딩만 7단계에서 변경 |

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
| 참조 (`rfblackbox/js/flightlog_parser.js`) | 이식 (`blackbox2/src/blackbox-viewer/flightlog_parser.js`) | 비고 |
|---|---|---|
| `:5-10` FIRMWARE 상수 (`ROTORFLIGHT=5`) | `flightlog_fielddefs.js:19` 동일 값 추가 | ID 충돌 없음 (기존 0~4 유지) |
| `:957-958` revision 정규식 | `:835-838` alternation에 `Rotor` 추가 | 참조 `.*flight`는 과매칭 가능 → 명시형 유지, 동작 동등 |
| `:970-977` revision→ROTORFLIGHT | `:839-845` `rotorflight` 맵 항목 | 소문자 키, 대소문자 무시 플래그 유지 |
| `:632-639` Firmware type 분기 | `:1044-1051` 동일 3항 분기 | `Rotorflight/Cleanflight/else` |
| `:810-844` RF=modern 3곳 | `:825-830` + `:943-952` 동일 취급 | filter `/100`·accel `/1000` |
| `:949-951` gyroScale 무변환 | `:979-995` RF 포함 변환 (의도적 차이) | 아래 리스크 1 참조 |
| 없음 (구 뷰어에 apiVersion 개념 없음) | `:49-55` JSDoc + `:68` export | RF는 1.44 폴백 유지 선언 |
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

- RF `gyro_scale` 변환 여부: 참조는 변환 없음(IMU 경로 없음)이나 본 뷰어는 `imu.js:97-108`이 rad/us 기준 → 2단계에서 BF 동일 변환으로 포함 결정.
- RF 디버그 테이블 위치: 공용 `debugModes.js` 확장 vs fielddefs 내장 → 2단계에서 후자 채택.

