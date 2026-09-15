개요. 

로터플라이트 앱의 위치는 home\betaflight\rfblackbox ( 또는 저장소에 따라 root\rfblackbox )

브랜치는 2.3.x 를 사용한다. ( 공식저장소 위치와 동일하다 https://github.com/rotorflight/rotorflight-blackbox/tree/RF-2.3.x )

중요 : 로터플라이트 앱을 안드로이드 apk , Vite 빌드를 위해 개조하는것이 목적이다.

개조의 편의성을 위해 이미 빌드가 완성된 BF의 골격을 사용해 내용을 바꿔 RF 전용

블랙박스 뷰어를 만들고 있는 중이다.

home\betaflight\blackbox2 ( 또는 저장소에 따라 root\blackbox2   )

이 디렉토리는 현재 베타플라이트 블랙박스 뷰어이다.

해야할일
현재 안드로이드 앱 빌드와 vite 빌드를 유지하면서 

로터플라이트 블랙박스 뷰어 앱으로 개조해야 함.

로터플라이트 앱의 위치는 home\betaflight\rfblackbox ( 또는 저장소에 따라 root\rfblackbox )

중요 1 : 아래 내용은 다양한 AI 가  작업목표를 위해 여러 방법으로 구현한 기록이다.

방법이 틀릴수 있으므로 틀리다는 증거가 있으면 수정한다.

수정한 내용은 문서 아래에 기록하여 나중에 오류 발견시 수정할 수 있게 한다.

중요 2 : 원래의 구조는 BF 였지만 완전히 RF 로 변환하는것이 목표이다.

수정의 편의를 위해 일부 BF 구조를 유지 할수 있지만  최종 목표는 BF는 버리고 RF만 지원하는것이다.

---

## 개조 계획 (2026-09-15 수립)

전제: `blackbox2`의 Vite 빌드(`npm run build`)와 Android(Capacitor) 빌드(`npm run android:*`)를
깨지 않으면서, 파싱/분석 계층만 Betaflight → Rotorflight로 교체한다.
참조 구현(정답지): `/home/betaflight/rfblackbox/js/` (구 NW.js 로터플라이트 블랙박스).

- [x] 1단계: 현황 인벤토리 + 파싱 차이 매핑 (코드 변경 없음, 본 문서에 기록) ← 이번 턴 실행
- [x] 2단계: 펌웨어 식별 계층 (`FIRMWARE_TYPE_ROTORFLIGHT=5`, `parseFirmwareRevision`에 Rotorflight 정규식, `firmwareToApiVersion` RF 분기)
- [x] 3단계: `flightlog_fielddefs.js` RF 이식 (RF flight modes 4.2/4.3/4.6, `FEATURES_RF_*`, `DEBUG_MODE_RF_*`, `FAST_PROTOCOL_RF*`, `GOVSTATES`/`RESCUE`/`AIRBORNE`, `MAX_MOTOR_NUMBER` 4, servo 8ch)
- [x] 4단계: `flightlog_fields_presenter.js` RF 이식 (RF friendly names + debug 디코드 RF 분기. BF 출력 바이트 동등 계약)
- [x] 5단계: `flightlog.js`/`flightlog_parser.js` 계산식 이식 (rcMotorRawToPct 신설, convert RF 분기, isFieldDisabled·isDigitalProtocol·estimateNumMotors RF 분기, fields_mask 파싱)
- [x] 6단계: 그래프·헤더·이벤트 UI (RF 기본 그래프셋 + HeaderDialog RF 파라미터 + RF 이벤트 렌더. BF 경로 untouched)
- [x] 7단계: 브랜딩+빌드 검증 (Rotorflight 별도 앱 ID, `npm run build`+`cap sync`, RF 실로그 E2E `tests/rf_sample_e2e.test.js`)

## 7단계 상세 기록 (브랜딩 + 빌드 검증 + RF 실로그 E2E, 2026-09-15)

### 목표

- 별도 앱으로 분리하는 전면 브랜딩 (사용자 선택: 앱ID까지 변경).
- RF 실로그(`sample.bbl`, Rotorflight 4.6.0 실측 로그)로 전 단계 E2E 검증.
- `npm run build` + `lint` + `cap sync` + vitest 전부 통과.

### 참조

- `sample.bbl` (930KB, `H Firmware type:Rotorflight`,
  `H Firmware revision:Rotorflight 4.6.0 (norevision) MATEKF405TE`,
  I프레임: setpoint/axisP·I·D·F/attitude/gyroRAW/gyroADC/accADC/motor[0]/
  servo[0..3]/debug[0..7], S프레임: flightModeFlags/stateFlags/failsafePhase/...,
  `H fields_mask:50426`, `H debug_mode:14`, `H motor_pwm_protocol:0`,
  `H gyro_scale:0x3f800000`, `H acc_1G:2048`, `H motor_poles:1`).

### 정확 변경점 (브랜딩 4파일)

- `package.json`: name→`rotorflight-blackbox-viewer`,
  productName/displayName/title→Rotorflight, description에 `(Rotorflight)` 표기.
- `capacitor.config.base.json`: appName→`Rotorflight Blackbox Viewer`,
  appId→`com.rotorflight.blackboxviewer` (별도 앱 분리).
- `android/app/build.gradle:16`: applicationId 동일 변경
  (namespace `betaflight.app`는 Java 소스 경로라 유지 — 파일 내 주석과 일치).
- `index.html:5-6`: title + meta description.
- 미변경: 아이콘(`images/bf_icon_128.png`, RF 아이콘 자산 없음 — 추후 교체),
  repository/author (출처 표기 유지).

### E2E 검증 — `tests/rf_sample_e2e.test.js` 신설 (8 테스트, 전부 통과)

1. 펌웨어 식별: `type=5`, `version=4.6.0`.
2. 헤더 파싱: `fields_mask=50426`, `motor_poles=1`, `debug_mode=14`,
   `gyroScale=(π/180)×1e-6` (2단계 rad/us 변환), `acc_1G=2048`.
3. RF 테이블 선택: `DEBUG_MODE_RF_ACTIVE` 85항, `FEATURES_RF` 31항(`[26]=GOVERNOR`),
   `GOVSTATES_RF_ACTIVE` 10항.
4. `isFieldDisabled(50426)`: SETPOINT/PID/GYROUNFILT/GYRO/ACC/BATTERY/MOTORS/SERVO=false,
   RC_COMMANDS/MAGNETOMETER/RSSI/GPS/RPM=true.
5. 프레임 디코드: `setpoint[0]` °/s, `motor[0]` %, `servo[0]` µs 접미사 확인 +
   `motor[4]` 부재 확인.
6. debug 라벨: `debug_mode=14` → RF 테이블명 (원본 `debug[0]` 아님).
7. 예시 그래프: RF 목록 생성, BF 전용(`Motors (Legacy)`, `GPS Cartesian coords`) 제외,
   RC_COMMANDS disabled이므로 `RC Command` 제외.
8. BF 회귀: `configurator/log/log0001.bbl` → `type=3` 유지.

### 검증 (명령+결과)

- `npm run build` — 성공. `npm run lint` — 성공.
- `npx vitest run tests/rf_sample_e2e.test.js` — 8/8 통과.
- `node capacitor.config.generator.mjs` + `npx cap sync android` — 성공
  (`cap sync` 단독은 `capacitor.config.json` 미생성 상태에서 실패하므로
  generator를 먼저 실행해야 함 — 아래 리스크 2).
- 주의: 테스트 실행 시 BF `gps_rescue_*` 미지원 헤더 로그가 콘솔에 다량 출력됨
  (정상 — unknownHeaders 수집 경로).

### 테스트 작성 중 발견·수정 (에러 기록)

- `new FlightLog(data)`만으로는 `getSysConfig()`가 기본값 그대로
  (`firmwareType=0`, `fields_mask=null`, 필드명 `[]`)라 8개 전부 실패.
  원인: 생성자는 파싱을 안 하고 `openLog(0)`이 `parseHeader+buildFieldNames+estimate`
  수행 (`flightlog.js:1349-1369`, `main.js` selectLog 경로).
  수정: 하네스에 `openLog(0)` 호출 추가 후 8/8 통과.
  → 후속 작업자 주의: FlightLog 단위 테스트는 반드시 `openLog()` 경유.

### 롤백

- 브랜딩 4파일 revert (기능 코드와 무관). E2E 테스트 파일은 삭제해도 무해.
- 앱ID를 되돌리면 기존 BF 앱과 동일 ID로 복귀 (설치 충돌 주의).

### 리스크·미결

1. 아이콘 미교체 (`bf_icon_128.png` 그대로). RF 아이콘 자산 확보 후 교체.
2. `cap sync`는 `capacitor.config.json`(gitignore, generator 산출물)이 있어야 성공.
   CI에서 `android:sync` 스크립트 사용 시 generator가 선행되므로 문제없음.
3. RF 실로그 1종(4.6.0, debug_mode=14)으로만 E2E. 4.2/4.3 로그·GovState 이벤트·
   servo 전ch 로그는 샘플 확보 시 테스트 추가.
4. craft 3D 헬기 모델·Governor 기본 그래프 편입은 6단계에서 7단계로 인계된 상태로
   남음 (실로그에 gov* 필드 없음 확인 — 해당 로그 기준 판단 보류).

## 전체 완료 요약 (1-7단계)

- 1단계: 인벤토리·대응표 (코드 변경 없음).
- 2단계: 펌웨어 식별 (`FIRMWARE_TYPE_ROTORFLIGHT=5`, 정규식·type 분기·gyroScale·isRF).
- 3단계: fielddefs RF 테이블 (modes/features/fast/debug/gov/rescue/airborne).
- 4단계: presenter RF 라벨·디코드 (61 모드 테이블 + RF 디코더 2종).
- 5단계: 계산식 (rcMotorRawToPct·convert·isFieldDisabled·isDigital·estimate·fields_mask).
- 6단계: 그래프·헤더·이벤트 UI (RF 예시셋·HeaderDialog 4곳·RF 이벤트 렌더).
- 7단계: 브랜딩 (별도 앱 ID) + E2E 테스트 8/8 + build/lint/sync 전부 통과.
- 전 단계 BF 불변 계약 유지, 단계별 커밋으로 롤백 가능.

## 8단계 (추가): craft 헬기 3D 모델 (2026-09-15)

### 목표

- RF 로그의 craft 표시를 멀티콥터 prop 렌더에서 Bell 헬기 GLTF 모델로 교체.
- BF 로그는 기존 Craft3D 그대로.

### 참조

- `rfblackbox/js/craft_3d.js:1-68` (68줄, GLTF 로드 + `rotateTo(x,y,z)`),
  `rfblackbox/resources/models/bell_cw.{gltf,bin,png}` (Blender 산출, 메시 8·노드 21).

### 정확 변경점

- `src/blackbox-viewer/models/bell_cw.{gltf,bin,png}` 복사 (참조 원본 그대로).
- `src/blackbox-viewer/craft_heli_3d.js` 신설: 참조를 ESM으로 포팅
  (`three` + `three/examples/jsm/loaders/GLTFLoader.js` import,
  `?url` 에셋 import, `render(frame, fieldIndexes)` 시그니처는 Craft3D와 동일).
  - 자세 매핑: `attitude[0..2]` decideg → rad (`×π/1800`),
    `rotateTo(roll, yaw, pitch)` — 참조의 `(x, wrapper.y, z)` 축 분리 답습.
    attitude 미로깅 시 마지막 자세 유지 (참조 `if (!this.model) return` 대응).
  - GLTF 해시 에셋 함정: Vite가 `.gltf`만 해시 복사하고 내부 `bell_cw.bin/png`
    상대 URI는 깨짐 → JSON을 fetch→URI를 `?url` 번들 URL로 교체→Blob objectURL로
    로드하는 `loadBellCw()`로 해결. `dist/assets/bell_cw-*.{gltf,bin,png}` 3종 출력 확인.
- `grapher.js`: import + `craftHeli3D` 변수 + 생성 분기
  (`firmwareType===5`면 `CraftHeli3D`, else 기존 `Craft3D`) + render/resize 분기
  (null 가드 — 모델 비동기 로드 전·WebGL 실패 시에도 BF 렌더 경로 보호).

### 검증

- `npm run build` 성공, `npm run lint` 성공.
- `tests/craft_heli.test.js` 2 테스트 통과 (decideg→rad 변환값, 모델 파일 존재).
- 전체 `npx vitest run` 10/10 통과 (E2E 8 + heli 2).
- `npx cap sync android` 성공 (dist 에셋 포함).

### 롤백

- `craft_heli_3d.js` + `models/` 삭제 후 grapher.js 4곳 분기를 원복하면 BF 완전 복귀.

### 리스크·미결

1. 모델 스케일·카메라 거리(참조값 `z=200` 그대로)는 실화면에서 크기 확인 필요.
   http://localhost:8080/ 에서 sample.bblを開いて craft 표시 확인 요망.
2. yaw 매핑: RF attitude[2]가 heading 기준인지 compass 기준인지 실화면 회전 방향으로
   확인할 것. 반대면 `craft_heli_3d.js`의 `rotateTo` 인자 순서만 교체.
3. 로터 스핀 애니메이션 없음 (참조도 없음 — 정적 자세 모델).

## 6단계 상세 기록 (그래프·헤더·이벤트 UI, 2026-09-15)

### 목표

- RF 로그 열 때 RF 기본 그래프셋·RF 헤더 파라미터·RF 이벤트 라벨이 표시되게.
- BF 로그의 그래프·헤더·이벤트 출력은 변경 없음.

### 참조

- `rfblackbox/js/graph_config.js:640-711` (RF EXAMPLE_GRAPHS),
  `:709-711` (debug NONE 게이트), `:194-208` (maxDegreesSecond RF 폴백 500),
  `header_dialog.js:392` (fields_mask 표시), `:965` (debug_mode select),
  `grapher.js:544-563` (GOVERNOR/RESCUE/AIRBORNE/CUSTOM_DATA 이벤트),
  `main.js:857` (초기 그래프 Motors+Gyros).

### 정확 변경점

**A. `graph_config.js:6` (import)** — `FIRMWARE_TYPE_ROTORFLIGHT`,
`getRfDebugModeName` 추가.

**B. `graph_config.js:getExampleGraphConfigs` RF 분기 (early return)** —
RF면 fields_mask 게이트로 RF 15종 그래프 구성 후 `buildExampleResult`로 반환,
BF는 기존 분기 그대로. RF 목록: Gyros / Gyros (pre-filter, gyroRAW) / Setpoints /
RC Command / Controls(mixer presence 게이트) / PID roll·pitch·yaw (axisO 포함,
axisB/PD 제외 — RF 로그에 axisB 없음) / Rotor Speeds(headspeed presence 게이트) /
Motors(motor[all], **servo[5] 미포함** — RF servo는 별도 그래프) / Servos /
Battery(Vbat+Ibat) / RSSI / Altitude(altitude+vario) / Accelerometer(accADC) /
Debug(debug NONE 게이트, RF accessor).
참조 대비 제외: Governor(govP/I/D/F/Sum/Request/Target — 본 뷰어 frame defs에
gov* 필드 파싱이 없어 빈 그래프가 되므로 제외, 7단계 실로그 확인 후 추가),
Voltages(Vbec/Vbus)·Temperatures·ESC/ESC2/BEC Telemetries (frame defs 존재는 하나
기본 그래프셋 과다 노출 방지 — GraphConfigDialog 예시 목록에서는 선택 가능),
Attitude(attitude[all] — computed attitude 파이프라인이 BF heading 기준이라
RF attitude 직접 매핑 미검증, 7단계에서 확인 후 추가).

**C. `graph_config.js:buildExampleResult` 신설** — RF/BF 동일 destGraph shape
(label/fields/color -1/height + graphNames 필터) 보장용 공용 빌더. BF 기존 인라인
루프는 untouched (중복 허용, BF 동작 불변 우선).

**D. `main.js:279,318` untouched** — 초기 그래프 `["Motors","Gyros"]`는 RF 목록에도
동명 존재하므로 RF 로그도 동일 호출로 Motors+Gyros가 뜸. 변경 불필요.

**E. `HeaderDialog.vue`** — import에 `FIRMWARE_TYPE_ROTORFLIGHT`,
`FAST_PROTOCOL_RF_ACTIVE`, `FLIGHT_LOG_FEATURES_RF`, `getRfDebugModeName` 추가.
`isRF` computed 신설. 변경 4곳 (전부 `isRF` 게이트, BF 경로 untouched):
E1. Parameters > Debug Mode — RF면 RF accessor, BF면 기존 apiVersion 테이블.
E2. Motor / ESC > Fast PWM Protocol — RF면 RF 테이블(DISABLED·CASTLE_LINK 정상 표시).
E3. Features — RF면 `FLIGHT_LOG_FEATURES_RF` 비트맵(31비트)으로 표시.
E4. Disabled Fields — RF면 `fields_mask` ENABLE 비트맵 23개 이름
(RC Command…Governor, 참조 `:1118-1145` 순서 대응)으로 표시.

**F. `grapher.js` RF 이벤트 4종 + `flightlog_parser.js` 파싱 5종** —
파서 `parseEventFrame`에 GOVERNOR_STATE/RESCUE_STATE/AIRBORNE_STATE/CUSTOM_DATA/
CUSTOM_STRING 추가 (참조 `:1540-1583` 그대로). grapher `drawEvent`에
GovState/RescueState/Airborne/DATA 렌더 추가 (참조 `:544-563` 색상·문구 동일,
단 FLIGHT_LOG_GOVSTATES→`FLIGHT_LOG_GOVSTATES_RF_ACTIVE`로 교체).
이벤트 코드 50/51/52/100/101은 BF와 불충돌이라 BF 로그 영향 없음.

**G. craft 3D 헬기 표시 — 미변경 (결정)** — `craft_3d.js`는 propColors 수 기반
멀티콥터 렌더라 RF 단일로터+테일로터 형상과 다름. 임의 개조보다 7단계 실로그 확인 후
별도 헬기 모델 추가가 안전하다고 판단. RF 로그도 기존 쿼드 렌더로 동작은 함.

### 동작 계약 (before → after)

- BF 로그: RF 분기 진입 불가 → 예시 그래프·헤더·이벤트 이전과 동일.
- RF 로그 (fields_mask 전부 ON, debug NONE): 15종 그래프
  (Gyros…Accelerometer, Debug 제외). debug=GOVERNOR면 Debug 추가.
  HeaderDialog에 Debug Mode=GOVERNOR, Fast PWM=RF 테이블명, Features=RF 비트맵,
  Disabled Fields=ENABLE 목록 표시. GovState 등 이벤트発生 시 라벨 렌더.

### 검증 (명령+결과)

- `npm run build` — 성공. `npm run lint` — 성공.
- 하네스 `/tmp/rfharness/verify6.mjs`: RF 15종 중 Altitude 제외 14종 PASS
  (Altitude는 fake mask에 b9 누락 — 하네스 입력 실수, 코드 정상.
  `!disabled.ALTITUDE` 분기는 코드에 존재), Debug NONE 제외 PASS,
  GOVERNOR Debug 포함 PASS, BF Motors+Gyros PASS.

### 롤백

- 6단계 커밋 revert 하나. 부분 되돌리기: graph_config RF 블록 +
  `buildExampleResult` (RF에서만 참조), HeaderDialog `isRF` 4곳,
  grapher/parser RF case 제거하면 BF 완전 복귀.

### 리스크·미결

1. RF Governor/Voltages/ESC 텔레메트리 기본 그래프 제외 — 7단계 실로그에서
   gov*/Vbec/Esc* 필드 존재 확인 후 기본셋에 추가 검토.
2. RF Attitude 그래프 제외 — computed attitude가 BF heading 파이프라인 기준.
   RF `attitude[0..2]` 직접 그래프는 4단계 decode/convert済이므로 예시 목록에는
   GraphConfigDialog에서 수동 선택 가능. 기본셋 편입은 7단계 실로그 확인 후.
3. craft 3D 헬기 모델 미구현 — 7단계 별도 작업으로 분리.
4. RF 실로그 E2E 미수행 (샘플 `.bbl` 없음). 7단계에서 RF 실로그로
   예시 그래프 생성→렌더까지 E2E 검증.

### 다음 단계 인계 (7단계)

- 범위: 브랜딩 + 빌드 검증 + RF 실로그 E2E ( governor/attitude 기본셋 편입 판단,
  craft 헬기 모델, `android:sync`, RF 샘플 파싱 테스트).

## 5단계 상세 기록 (flightlog 계산식 + 파서 헤더, 2026-09-15)

### 목표

- `flightlog.js`에 RF 계산식 분기, `flightlog_parser.js`에 RF 전용 헤더 파싱,
  presenter에 RF convert 분기. BF 계산 결과는 변경 없음.

### 참조

- `rfblackbox/js/flightlog.js:239-249` (estimateNumMotors, MAX 4),
  `:978-985` (accRawToGs 동일 / rcCommandRawToThrottle 동일),
  `:987-990` (rcMotorRawToPct = value/10),
  `:992-1012` (isDigitalProtocol — BF 테이블과 case 동일, RF 테이블 인덱싱),
  `:1014-1017` (getPIDPercentage 동일),
  `:1020-1031` (getReferenceVoltageMillivolts — RF는 BF 4.0+와 동일 `vbatref*10`),
  `:1118-1145` (isFieldEnabled — fields_mask ENABLE 비트맵 23비트).
- `rfblackbox/js/flightlog_parser.js:347` (sysConfig.fields_mask),
  `:759` (`H fields_mask` int 파싱), `:788` (`H motor_poles` int 파싱).
- 참조 presenter에는 `ConvertFieldValue`가 없음 → convert는 decode 스케일에서 역산.

### 정확 변경점 (1/2: flightlog.js + parser)

**A. `flightlog.js:6-17` (import)** — `MAX_MOTOR_NUMBER_RF`,
`FAST_PROTOCOL_RF_ACTIVE`, `FIRMWARE_TYPE_ROTORFLIGHT` 추가. 기존 import 유지.

**B. `flightlog.js:estimateNumMotors` (RF 상한 4)** — RF면 `MAX_MOTOR_NUMBER_RF=4`,
BF면 기존 `MAX_MOTOR_NUMBER=8`. 참조는 단일 상수 4지만 본 뷰어는 BF 8모터 보호를 위해 분기.

**C. `flightlog.js:rcMotorRawToPct` 신설** — 참조 `:987-990` 그대로 `value/10.0`.
BF의 `rcMotorRawToPctPhysical`(DSHOT/min-max 보정)은 untouched.
4단계 presenter의 `value/10` 인라인을 `flightLog.rcMotorRawToPct(value)` 호출로 교체 (인계 완료).

**D. `flightlog.js:isDigitalProtocol` RF 테이블 분기** — RF면
`FAST_PROTOCOL_RF_ACTIVE[fast_pwm_protocol]` 조회. RF 테이블에 `DISABLED`(4.2+)·
`CASTLE_LINK`(4.5+)가 있어 analog case에 2개 추가. BF 테이블·case 순서 untouched.

**E. `flightlog.js:getReferenceVoltageMillivolts` RF 조건 추가** —
참조 `:1021-1023`대로 RF는 BF 4.0+와 동일하게 `vbatref*10`. BF 조건식 untouched.

**F. `flightlog.js:isFieldDisabled` RF 분기 (선두 return)** — 참조 `:1118-1145`의
ENABLE 비트맵을 본 뷰어의 DISABLE 플래그 형태로 반전 매핑:
RC_COMMAND←b0, SETPOINT←b1, MIXER(미소비)←b2, PID←b3, ATTITUDE(미소비)←b4,
GYROUNFILT←b5, GYRO←b6, ACC←b7, MAGNETOMETER←b8, ALTITUDE←b9, BATTERY←b10,
RSSI←b11, GPS←b12, RPM←b13, MOTORS←b14, SERVO←b15. DEBUG는 mask에 비트가 없어
`false`(enabled)로 두고 frame defs presence에 맡김. BF 분기 untouched.

**G. `flightlog_parser.js:fields_mask` 파싱 2줄** — sysConfig 기본값 `null` + 
`PARSE_INT_FIELDS`에 `"fields_mask"` 추가. `motor_poles`는 이미 양쪽 모두 int 파싱 존재
(참조 `:788` = 본 `:747`), 추가 없음.

<!-- 5STAGE-PART2 -->

### 정확 변경점 (2/2: presenter convert + 계약·검증·롤백·리스크)

**H. `flightlog_fields_presenter.js:ConvertFieldValue` RF 선두 분기** —
RF면 `ConvertFieldRfValue(...)`를 먼저 호출하고 `undefined`가 아닐 때만 반환,
그 외(공유 필드·BF)는 기존 BF switch로 fallthrough. BF switch untouched.

**I. `ConvertFieldRfValue` 신설 (decode 스케일 역산)** — `rcCommand[0..3]` /5·`[4]` /10,
`setpoint[3]` ×0.012, `mixer[0..1]` ×0.012·`[2]` ×0.024·`[3]` /10,
`axisP/I/D/F/B/O/Sum/PD` getPIDPercentage, `attitude` /10, `gyroRAW` identity,
`accADC` accRawToGs, `Vbat/Vbec/Vbus/EscV/Esc2V`·`Ibat/EscI/Esc2I` /100,
`Tmcu/Tesc/Tesc2/Tbec/EscCap/Esc2Cap/EscRPM/Esc2RPM/headspeed/tailspeed/servo[0..7]` identity,
`EscThr/EscPwm` /10, `altitude/vario` /100, `motor[0..3]` rcMotorRawToPct.
공유명(`time/gyroADC/gyroUnfilt/axisError/rcCommands/flightModeFlags/rssi/GPS/.../debug`)
은 `default: undefined`로 BF switch에 위임. `debug[0..7]`도 BF `ConvertDebugFieldValue`에
위임 (RF debug convert는 참조에도 없고 4단계 decode는 표시용이라 차트 변환 불필요).

### 동작 계약 (before → after)

- BF 로그: `firmwareType!==5` → RF 분기 3곳(estimate 상한·convert·isFieldDisabled) 전부
  스킵, `isDigitalProtocol`은 BF 테이블 조회, `getReferenceVoltageMillivolts` 기존 조건 →
  출력 이전과 동일.
- RF 로그: `rcMotorRawToPct(500)`→`50`, `isDigitalProtocol(CASTLE_LINK)`→`false`,
  `getReferenceVoltageMillivolts(vbatref=430)`→`4300`,
  `isFieldDisabled(fields_mask=MOTOR|SERVO|...)`→`MOTORS:false, SERVO:false, GPS:true`,
  `ConvertFieldRfValue(mixer[2],fwd,100)`→`2.4` / `(back,2.4)`→`100`,
  `ConvertFieldValue` 공유 필드(`time`, `gyroADC`)는 BF switch 그대로.

### 검증 (명령+결과)

- `npm run build` — 성공. `npm run lint` (eslint + typecheck) — 성공.
- 하네스 `/tmp/rfharness/verify5.mjs` 18 케이스 ALL PASS (prototype stub + presenter rewire):
  rcMotorRawToPct / isDigital RF·BF / refV RF·BF / isFieldDisabled 5종 /
  decode motor / convert setpoint·mixer2 왕복·motor 왕복·fallthrough 2종.
- 4단계 하네스 `/tmp/rfharness/verify.mjs` 13 케이스 ALL PASS 유지
  (단, fake flightLog에 `rcMotorRawToPct` stub 추가 필요 — 실코드는 FlightLog 메서드로 존재).
- 테이블·BF 불변: `FAST_PROTOCOL`·`rcMotorRawToPctPhysical`·BF switch 무수정.

### 롤백

- 5단계 커밋 하나만 revert. 부분 되돌리기:
  `isFieldDisabled` RF 블록(선두 return) + `ConvertFieldValue` RF 선두 6줄만 제거하면
  BF와 완전 동일 동작. `fields_mask` 파싱 2줄·`rcMotorRawToPct` 신설은 미참조 시 무해.

### 리스크·미결

1. `fields_mask` 미존재 구 RF 로그: `?? 0` → 전부 disabled 판정 → computed 필드
   (axisSum/rcCommands/axisError) 미생성. `H fields_mask` 없는 로그 발견 시 기본값을
   전비트 ON으로 완화할 것 (`flightlog.js:isFieldDisabled`).
2. RF ATTITUDE/MIXER/GOV 등 mask 비트는 본 뷰어 computed 로직이 소비하지 않음
   (참조도 axisSum/axisPD/axisError만 사용). GOV/VBEC 등 RF 전용 computed는 6단계 UI에서.
3. RF debug 차트 변환 미구현 (`ConvertDebugFieldValue` BF 공용 경로). RF debug 그래프
   스케일이 어긋날 수 있음 → 6단계 그래프 작업에서 RF debug convert 추가 검토.
4. RF 실로그 E2E 미수행 (샘플 `.bbl` 없음). 7단계에서 RF 실로그로
   `fields_mask` 파싱→`isFieldDisabled`→computed 필드 생성까지 E2E 검증.

### 다음 단계 인계 (6단계)

- 범위: 그래프·워크스페이스·UI. `graph_config.js` RF 기본 필드셋,
  `HeaderDialog` RF 파라미터(fields_mask·motor_poles·gov), craft 3D 헬기, GPS/WP UI 정리.
- 5단계에서 RF convert 기반이 마련되어 차트 min/max는 RF 스케일로 계산됨.

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

## 버그픽스 리스트 (전체 코드 vs 참조 /root/rfblackbox/js 검증, 2026-09-15)

검증 방법: 참조 구현을 vm으로 eval해 전역 테이블 추출, 본 뷰어 ESM export와
항목별(인덱스 단위) 프로그램 비교. 대상: flightlog_fielddefs.js /
flightlog_fields_presenter.js(FRIENDLY·RF debug 테이블·decodeFieldRf·
decodeDebugFieldRf) / flightlog.js(isFieldDisabled·rcMotorRawToPct) /

### BP-1. RATES_TYPE 인덱스 밀림 (off-by-one) — 해석 오류, 수정 필요

- 현재 `flightlog_fielddefs.js:894`:
  `["BETAFLIGHT","RACEFLIGHT","KISS","ACTUAL","QUICK","ROTORFLIGHT"]` (6개, ROTORFLIGHT=5)
- 참조 `rfblackbox/js/flightlog_fielddefs.js:927-935`:
  `["NONE","BETAFLIGHT","RACEFLIGHT","KISS","ACTUAL","QUICK","ROTORFLIGHT"]` (7개, ROTORFLIGHT=6)
- 영향: RF 로그 `H rates_type:N` 원시값을 1씩 어긋나게 해석
  (예: 실제 BETAFLIGHT(1) 로그가 NONE? 위치로, ROTORFLIGHT(6)이 QUICK(5) 위치로 표시).
  `HeaderDialog.vue:453` 표시 및 rates_type 기반 판정 전부 영향.
  `graph_config.js:602-603`의 `RATES_TYPE.indexOf("ACTUAL"/"QUICK")` 매칭도
  로그 원시값과 어긋남(BF형 rates만 쓰는 case라 실동작 영향은 없으나 의미상 오류).
- todolist 767행의 기록 오류: "RATES_TYPE에 ROTORFLIGHT append (index 5, 참조 :934 동일 위치)"
  는 틀림. 참조에는 `NONE`이 index 0에 있고 ROTORFLIGHT는 index 6이다.
  787행 "기존 5개 순서 유지 + append" 검증도 참조와의 동등성을 확인하지 못한 검증 누락.
- 수정안: 선두에 `"NONE"` 삽입해 참조와 동일 7개로 맞출 것. BF 로그가 rates_type을
  쓰지 않는지(BF에는 rates_type 헤더가 없음) 확인 후 삽입 — BF 불변 계약은 유지됨.

### BP-2. FLIGHT_LOG_FAILSAFE_PHASE_NAME 4개 → 7개 누락 — 필드 항목 불일치

- 현재 `flightlog_fielddefs.js:832`: `["IDLE","RX_LOSS_DETECTED","LANDING","LANDED"]`
- 참조 `:841`: 위 4개 + `"RX_LOSS_MONITORING","RX_LOSS_RECOVERED","GPS_RESCUE"` (7개)
- 영향: RF 로그 `failsafePhase` 값 4~6이 `presentEnum`에서 undefined로 표시
  (`flightlog_fields_presenter.js` decodeFieldRfToFriendly의 failsafePhase case가
  이 테이블을 그대로 사용). BF 로그는 값 0~3만 사용하므로 BF 불변에는 무영향.

### BP-3. RF 필드 friendly 라벨 누락 + BF 키 오염 + 라벨 해석 오류 2건

- 현황: `flightlog_fields_presenter.js:56`의 `FRIENDLY_FIELD_NAMES`가
  BF 테이블(+일부 RF 잔재) 그대로이며, 4단계 의도적 차이 3("merge하지 않음")에 따라
  RF 전용 라벨 테이블이 별도로 존재하지 않음. 그런데 `fieldNameToFriendly:1674`의
  비디버그 경로는 `FRIENDLY_FIELD_NAMES`를 유일한 소스로 사용하므로
  (graph_config 라벨·워크스페이스 표시 경로), RF 로그의 아래 필드들이 라벨 없이
  fieldName 원문으로 표시됨:
  - RF 전용: `Vbat, Vbec, Vbus, Ibat, EscI, Esc2I, Tmcu, Tesc, Tesc2, Tbec,
    EscCap, Esc2Cap, EscRPM, Esc2RPM, EscThr, EscPwm, headspeed, tailspeed,
    setpoint[0..3], mixer[0..3], servo[0..7], attitude[0..2], accADC[0..2],
    gyroRAW[0..2], axisB, axisO, axisPD, altitude, vario, rcCommand[4]`
    (참조 `flightlog_fields_presenter.js:7-163` FRIENDLY_FIELD_NAMES에는 전부 존재)
- BF 잔류 키 오염(참조에 없음, cur에만 있음): `vbatLatest, amperageLatest,
  accSmooth[0..2], eRPM[0..7], heading[0..2], baroAlt, pitot[0..2],
  GPS_*` 등 BF 전용 필드명 — RF 로그에서는 절대 나오지 않으므로 무해하지만
  RF 테이블로 교체 시 정리 대상.
- 해석 오류 2건 (cur에만 있는 잘못된 RF 라벨):
  1. `:107 rcCommand[3]: "RC Command [throttle]"` — 참조는 `"RC Command [collective]"`.
     RF에서 collective(throttle 스틱)는 `rcCommand[3]`이고 별도 `rcCommand[4]`가 throttle.
     decode 스케일(/5 vs /10)은 참조와 일치하므로 라벨만 틀림.
  2. `:141 servo[5]: "Servo Tail"` — 참조는 `"Servo [6]"`.
     참조는 servo 전 채널을 동등 취급하며 tail 특수 라벨은 없음.
- 수정안: 4단계 의도적 차이 3을 철회하고 참조 FRIENDLY_FIELD_NAMES(RF 123키)를
  그대로 이식하거나, `FRIENDLY_FIELD_NAMES_RF` 별도 테이블 + fieldNameToFriendly
  RF 분기에서 우선 참조. BF 키 오염은 BF 로그 라벨 경로와 분리된 테이블이면 자동 해소.

### BP-4. 검증에서 확인된 정상(수정 불필요) 항목 — 참고 기록

- RF 테이블 14종(modes 4.2/4.3/4.6, features 4.2/4.3, FAST_PROTOCOL_RF/4_5,
  DEBUG_MODE_RF 4.2/4.3/4.6, GOVSTATES_RF/4_6, RESCUE/AIRBORNE, FlightLogEvent
  GOV/RESCUE/AIRBORNE/CUSTOM 키, MAX_MOTOR_NUMBER_RF=4·MAX_SERVO_NUMBER_RF=8):
  참조와 1항목 오차 없이 동일 (vm 항목별 비교 PASS).
- `decodeFieldRfToFriendly` 전 케이스(101 케이스) 스케일·단위: 참조와 등가.
  `motor[0..3]`은 `FlightLog.rcMotorRawToPct`(value/10)로 참조와 동일.
- `decodeDebugFieldRfToFriendly` 전 모드(61 모드): 스케일·단위 참조와 등가.
  차이 2건은 모두 등가 치환: (a) `DEBUG_MODE[idx]`→`getRfDebugModeName(idx)`
  accessor, (b) ITERM_RELAX/YAW_PRECOMP 게이트에서
  `firmwareType===ROTORFLIGHT &&` 조건 생략 — 이 함수는 RF 로그에서만 호출되므로
  의미상 동일하나, 향후 BF 경로에서 재사용될 경우 조건 복원 필요.
- `flightlog.js` `rcMotorRawToPct`(value/10), `isFieldDisabled` RF 비트맵
  (RC_COMMAND=0 … SERVO=15, 참조 isFieldEnabled와 동일 매핑), `estimateNumMotors`
  RF 상한 4: 참조와 일치.
- features 디코드가 `FLIGHT_LOG_FEATURES`(BF) 아닌 `FLIGHT_LOG_FEATURES_RF`를
  쓰는 것: 의도된 차이(3단계)로 정상.
- FlightLogEvent에 BF 키(AUTOTUNE/GTUNE/TWITCH) 남아있음: 의도된 유지(정상).

### 검증 커맨드 재현

- 테이블 비교: vm으로 `/root/rfblackbox/js/flightlog_fielddefs.js` eval 후
  RF 테이블 17종 JSON 동등 비교 (본 기록 상단 방식).
- presenter 테이블: 두 파일에서 `{...}` 리터럴을 브레이스 카운트로 추출해 eval 비교
  (FRIENDLY: refkeys 123 / curkeys 107 / 차이 132항,
  RF debug 테이블: 61키 전부 동일 PASS).
- 디코더: 함수 바디 추출 후 정규화(`'`→`"`, 공백제거) 토큰 diff — 의미 차이는 위 BP만.


## 버그픽스 1단계 기록 — BP-1 RATES_TYPE off-by-one (2026-09-15, 커밋 eff5397)

### 변경점

- `src/blackbox-viewer/flightlog_fielddefs.js:894`: 선두에 `"NONE"` 삽입.
  이제 참조와 동일 7개: `NONE(0), BETAFLIGHT(1), RACEFLIGHT(2), KISS(3),
  ACTUAL(4), QUICK(5), ROTORFLIGHT(6)` — RF 펌웨어 rates_type enum과 1:1 대응.

### 영향 분석

- `HeaderDialog.vue:453` `selectVal(s.rates_type, RATES_TYPE)`: raw 값→이름 매핑이
  이제 RF 실제 값과 일치 (예: `H rates_type:6` → ROTORFLIGHT).
- `graph_config.js:601-603`: `RATES_TYPE.indexOf("ACTUAL")=4, "QUICK"=5` —
  RF 로그의 ACTUAL/QUICK rates가 올바른 커브 스케일을 타게 됨 (수정 전에는
  인덱스 밀림으로 default 커브가 적용될 수 있었음).
- BF 로그: BF는 `rates_type` 헤더를 출력하지 않아 영향 없음 (`flightlog_parser.js:720`
  은 헤더 파싱 목록일 뿐). RATES_TYPE을 값으로 참조하는 곳은 indexOf 2곳뿐이라
  BF 불변 계약 유지.

## 버그픽스 2단계 기록 — BP-2 FAILSAFE_PHASE 확장 (2026-09-15, 커밋 b07d675)

### 변경점

- `src/blackbox-viewer/flightlog_fielddefs.js:832-840`:
  `FLIGHT_LOG_FAILSAFE_PHASE_NAME` 4개 → 7개.
  추가: `RX_LOSS_MONITORING(4), RX_LOSS_RECOVERED(5), GPS_RESCUE(6)` — 참조
  `rfblackbox/js/flightlog_fielddefs.js:841`과 항목·순서 완전 동일.

### 영향 분석


## 버그픽스 3단계 기록 — BP-3 RF friendly 라벨 (2026-09-15, 커밋 4401198)

### 변경점

- `src/blackbox-viewer/flightlog_fields_presenter.js:198`:
  `FRIENDLY_FIELD_NAMES_RF` 신설 — 참조
  `rfblackbox/js/flightlog_fields_presenter.js:7-163`의 123키 전량 이식
  (vm으로 추출한 참조 리터럴을 키 순서 그대로 `"..."` 포맷으로 변환, 수작업 없음).
  BF 테이블(`FRIENDLY_FIELD_NAMES`)과 별도 유지 — BF 테이블 무수정.
- `flightlog_fields_presenter.js:1800-1802`: `fieldNameToFriendly`의
  비디버그 라벨 경로 선두에 RF 우선 분기 추가:
  `firmwareType===ROTORFLIGHT && FRIENDLY_FIELD_NAMES_RF[fieldName]` → RF 라벨,
  그 외는 기존 BF 경로 그대로 (미전달 호출·BF 로그 1바이트 불변).

### 해석 오류 2건 해소 (라벨 교체 아닌 테이블 우선순위로)

- `rcCommand[3]`: BF 테이블의 "RC Command [throttle]" 대신 RF 테이블의
  "RC Command [collective]"가 적용됨 (RF에서 [4]가 throttle — decode 스케일
  /5 vs /10과도 정합). BF 테이블 항목은 BF 로그용으로 그대로 유지.
- `servo[5]`: "Servo Tail" 대신 참조와 동일 "Servo [6]" 적용.
- 참조 라벨은 추출 원문 그대로 사용 (예: mixer[2]="Mixer SY [yaw]",
  headspeed="Headspeed") — 임의 의역 금지 확인.


## 버그픽스 4단계 기록 — BP-4 heli 3D yaw 반전 (2026-09-15, 커밋 20b0993)

### 증상

- Bell 헬기 모델이 원본(rfblackbox)과 yaw 방향이 반대로 움직임.

### 두 가지 가설 검증

1. **그래픽 표시 방향(카메라/미러) 문제?** — 아니오. 참조 `craft_3d.js`와
   `craft_heli_3d.js`의 카메라(`position.z=200`)·렌더러 설정이 동일하고
   미러링 요소 없음 → 배제.
2. **yaw 해석(부호·축 매핑) 문제?** — 예. 이것이 원인.

### 원인 (참조 대비)

- 참조 `rfblackbox/js/grapher.js:76-88`: 축 인덱스 맵
  `x=attitude[1](pitch), y=attitude[2](yaw), z=attitude[0](roll)`,
  `:877-881`: 세 축 모두 부호 반전 `rotateTo(-pitch, -yaw, -roll)`.
  (`craft_3d.js` rotateTo: `model.rotation.x=x, modelWrapper.rotation.y=y,
  model.rotation.z=z` — 본 뷰어와 동일 구조.)
- 수정 전 `craft_heli_3d.js`: `rotateTo(+roll, +yaw, +pitch)` —
  (a) yaw 부호 미반전 → **yaw 반대 방향** (사용자 관찰 증상),
  (b) pitch/roll이 x/z축에 서로 스왑 (참조는 model.x=pitch, model.z=roll인데
  roll/pitch가 뒤바뀜) — (a)와 함께 자세가 전반적으로 틀렸음.
- 8단계 기록 159행의 "rotateTo(roll, yaw, pitch)"도 참조와 다른 잘못된 기록이었음.

### 변경점

## 버그픽스 5단계 기록 — BP-5 craft overlay 위치 (2026-09-15, 커밋 7ca38f6)

### 증상

- 3D 헬기 overlay가 원본은 좌측 상단인데 현재 앱은 좌측 중단에 나타남.

### 원인

- 기본 user settings의 craft.top 값 차이.
  - 원본 `rfblackbox/js/user_settings_dialog.js:66-70`:
    `craft: { left:'15%', top:'25%', size:'40%' }`
  - 현재 `src/blackbox-viewer/user_settings_data.js:118`:
    `craft: { left:'15%', top:'48%', size:'40%' }` ← 유일한 차이
- 배치 계산식(`grapher.js:833-852`, `craft.left/top % − size/2`)은 원본
  `grapher.js:735-753`과 동일 → 코드 로직 문제 아님, 기본값 문제.

### 변경점

- `src/blackbox-viewer/user_settings_data.js:118`: `top: "48%"` → `"25%"`.
  left/size는 원본과 동일하므로 무수정.

### 주의 (사용자 설정 지속성)


## 버그픽스 5단계 후속 — craft 기본값 사용자 지정 (2026-09-15, 커밋 cc12a43)

### 변경점

- `src/blackbox-viewer/user_settings_data.js:118`:
  `craft: { left: "20%", top: "5%", size: "80%" }`
  (사용자 요청값: top 5 / left 20 / size 80 — 5단계의 원본 기본값 15/25/40을 대체).

### 동작

- 이 값은 기본값(초기 로드·설정 초기화 시)이며, User Settings 다이얼로그의
  Craft 위치 입력(0-100 범위)으로 언제든 조정·저장 가능 — 저장 시 localStorage에
  유지되어 다음 실행에 적용됨.
- 다이얼로그 입력 범위(0~100) 확인 완료 — 5/20/80 모두 유효.


## 버그픽스 5단계 후속 2 — 3D 모델을 heli.glb로 교체 (2026-09-15, 커밋 265db4e/eacf8ab)

### 변경점

- `src/blackbox-viewer/models/heli.glb` 추가 (237KB, glTF-binary v2, Khronos 생성).
- `craft_heli_3d.js`:
  - bell_cw.{gltf,bin,png} 3파일 import + 내부 URI 재작성(fetch→JSON→Blob) 로직
    삭제 → `heli.glb` 단일 `?url` import로 교체. GLB는 버퍼·텍스처가 내장되어
    URI 재작성이 불필요하므로 로더가 크게 단순화됨 (`loadHeliModel`).
  - 자세 매핑(rotateTo -pitch/-yaw/-roll), render/resize API, 4단계 BP-4 수정분은
    그대로 유지.
- `tests/craft_heli.test.js`: 모델 파일 검증을 heli.glb 기준으로 갱신
  (glTF-binary magic "glTF" + version 2, 크기, 구현이 heli.glb를 import하는지,
  bell_cw 잔존 부재 정적 검증).

### 검증

- `npm run build` EXIT 0 — `dist/assets/heli-*.glb` 단일 에셋 출력 확인
  (bell_cw 3파일은 import가 없어 번들에서 제외됨).
- `npm run lint` EXIT 0, `npx vitest run` 12/12 통과.

### 비고

- bell_cw.{gltf,bin,png} 원본 파일은 `src/blackbox-viewer/models/`에 그대로
  남아 있음(참조 백업). 번들에는 포함되지 않으므로 APK 용량 영향 없음.
  원본 복귀 필요 시 import 3줄 + loadBellCw로 되돌리면 됨(4단계 기록의
  bell URI 재작성 방식 참조).

### 검증

- `npm run build` EXIT 0, `npm run lint` EXIT 0, `npx vitest run` 12/12 통과.

- user settings는 localStorage에 저장되므로, 기존에 설정을 저장한 브라우저/
  WebView에서는 저장된 top:48%가 그대로 적용될 수 있음. User Settings 다이얼로그에서
  기본값 초기화(또는 top을 25로 직접 수정)하면 원본 위치로 나타남.

### 검증

- `npm run build` EXIT 0, `npm run lint` EXIT 0, `npx vitest run` 12/12 통과.


- `src/blackbox-viewer/craft_heli_3d.js:128-137`: render()의 rotateTo 호출을
  참조와 동일하게 `rotateTo(-pitch, -yaw, -roll)`로 수정 (인자 순서+부호).
  rotateTo 내부(model.x / wrapper.y / model.z)는 참조와 동일하므로 무수정.
- `tests/craft_heli.test.js`: (1) 참조 매핑(-pitch,-yaw,-roll) 값 단언으로 갱신
  (roll 90°, pitch -45°, yaw 180° → x=+45°, y=-180°, z=-90°),
  (2) 구현 소스 정적 검증(음수 매핑 존재 + 구버그 패턴 부재) 추가.

### 검증

- `npm run build` EXIT 0, `npm run lint` EXIT 0, `npx vitest run` 12/12 통과.
- BF 로그(Craft3D 경로)는 이번 변경 파일과 무관 — 무영향.

### 검증

- `tests/rf_labels.test.js` 신설 (10 케이스): RF 8건(rcCommand[3]/[4],
  servo[5], Vbat, setpoint[3], EscRPM, headspeed, mixer[2]) + BF 회귀 2건
  (vbatLatest, accSmooth[0] — 3인자 구호출 형태) 전부 통과.
- `npm run build` EXIT 0, `npm run lint` EXIT 0,
  `npx vitest run` 11/11 통과 (E2E 8 + heli 2 + labels 1... 파일 3개).

### 남은 것

- BF 테이블의 RF 잔재 키(rcCommand[3] throttle 등)는 BF 로그용 라벨이라
  유지 — RF 로그에서는 RF 테이블이 우선하므로 사용자 노출 없음.
- `graph_spectrum_calc.js:410` axisError 호출은 firmwareType 미전달(BF 경로
  fallback) — axisError는 BF/RF 공유 라벨이라 무영향, 현행 유지.

- RF 로그 `failsafePhase` 값 4~6이 `presentEnum`에서 이름으로 표시됨
  (수정 전: undefined). BF 로그는 값 0~3만 사용하므로 무영향 — BF 불변 유지.
- 이 테이블을 참조하는 곳은 presenter `decodeFieldRfToFriendly`의
  `failsafePhase` case뿐 (그 외 참조 없음 확인).

### 검증

- `npm run build` EXIT 0, `npm run lint` EXIT 0, `npx vitest run` 전체 통과.
- 테이블 동등성: 7항목 참조와 JSON 동등 (vm 비교).

- todolist 767행(3단계 기록)의 "index 5, 참조 :934 동일 위치"는 오류였음이
  버그픽스 리스트 BP-1에서 확정 — 본 수정으로 해소.

### 검증

- `npm run build` EXIT 0, `npm run lint` EXIT 0, `npx vitest run` 전체 통과.
- 테이블 동등성: RATES_TYPE 7항목 참조와 JSON 동등 (vm 비교).

