import wsRf from "./ws_rf.json";

/**
 * Workspace 슬롯 구성 (원본 rfblackbox/js/workspace_selection.js와 동일 체계).
 *
 * - 0~9 (USER_SLOT_COUNT=10): 편집·저장 가능한 사용자 슬롯. 기본값 null(=빈 슬롯).
 * - 10~15 (PRESET_BASE~): 읽기 전용 프리셋 6개. 숫자 라벨 없이 이름만 표시,
 *   저장/이름바꾸기 불가. ws_rf.json(원본 default_workspaces.js 이식)을 그대로 쓴다.
 * - 총 WORKSPACE_COUNT = 16.
 */

export const USER_SLOT_COUNT = 10;
export const PRESET_BASE = 10;
export const PRESET_COUNT = wsRf.length;
export const WORKSPACE_COUNT = USER_SLOT_COUNT + PRESET_COUNT;

export function isPresetId(id) {
    return Number.isInteger(id) && id >= PRESET_BASE && id < PRESET_BASE + PRESET_COUNT;
}

export function isUserSlotId(id) {
    return Number.isInteger(id) && id >= 0 && id < USER_SLOT_COUNT;
}

/** 프리셋 원본 반환 (읽기 전용 — 호출자가 structuredClone 해서 쓸 것) */
export function getPresetSource(index) {
    return wsRf[index] ?? null;
}

/**
 * 초기 workspace 배열 생성: [null×10, ...presets].
 * localStorage에 저장된 값이 없을 때 사용한다.
 * 프리셋은 구조 공유 방지를 위해 deep clone 한다.
 */
export function createInitialWorkspaces() {
    const slots = new Array(USER_SLOT_COUNT).fill(null);
    for (const preset of wsRf) {
        slots.push(structuredClone(preset));
    }
    return slots;
}

/**
 * 구형(10슬롯 또는 6슬롯 프리셋 단독) 배열을 16슬롯 체계로 정규화한다.
 * - 길이가 16이고 10번 이후에 title이 있으면 이미 신형으로 간주하고 그대로 둔다.
 * - 저장된 배열이 구 프리셋(ws_rf.json)과 완전히 동일하면 사용자 데이터가 없는 것으로
 *   보고 초기값으로 만든다.
 * - 그 외: 앞 10칸을 사용자 슬롯으로 유지(기존 데이터 보존)하고 뒤에 프리셋 6개를 채운다.
 */
export function normalizeWorkspaces(saved) {
    if (Array.isArray(saved) && saved.length === WORKSPACE_COUNT && saved.slice(PRESET_BASE).some((s) => s?.title)) {
        return saved;
    }
    if (
        Array.isArray(saved) &&
        saved.length === PRESET_COUNT &&
        saved.every((s, i) => s?.title === wsRf[i]?.title)
    ) {
        return createInitialWorkspaces();
    }
    const fresh = createInitialWorkspaces();
    if (Array.isArray(saved)) {
        const limit = Math.min(USER_SLOT_COUNT, saved.length);
        for (let i = 0; i < limit; i++) {
            // 구형에 사용자 데이터가 있으면 보존 (null/undefined는 빈 슬롯 유지)
            if (saved[i] != null) {
                fresh[i] = saved[i];
            }
        }
    }
    return fresh;
}
