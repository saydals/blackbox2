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
