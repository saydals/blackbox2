import { useLogStore } from "./stores/log.js";

// Adapts the currently loaded FlightLog (from the blackbox viewer) into the
// shape that the 3D replay expects from a parsed CSV. This replaces the HTML
// prototype's parseCSV() which read raw CSV text — here we pull the same named
// fields directly out of the FlightLog object so no CSV round-trip is needed.
//
// Returns the same contract as the prototype's parseCSV():
//   { out, headers, wpLat, wpLon, wpAlt, iALat, iALon, iAAlt, iBLat, iBLon, iBAlt, iAlt, iMode }
// where each `out` row is { _raw, t, lat, lon, roll, pitch, yaw, throttle, alt,
// baroAlt, gpsAlt, velN, velE } and `_raw` is the raw numeric frame array
// (used by buildMarkers/buildFrames for WP and A/B rescue altitudes).

const WP_COUNT = 15;

function fieldIndexOrNeg(log, name) {
    const i = log.getMainFieldIndexByName(name);
    return i === undefined || i === null ? -1 : i;
}

export function buildReplayDataFromFlightLog(log) {
    const logStore = useLogStore();
    // blackbox2 replays the already-open log only (no local "Load BBL").
    const resolved = log || logStore.flightLog;
    if (!resolved) {
        throw new Error("No blackbox log is loaded");
    }

    // The viewer (main.js selectLog) already ran openLog + buildFieldNames.
    // Only open here when field names are missing (e.g. unit tests building
    // FlightLog directly) — never re-open an active viewer log.
    if (
        typeof resolved.getMainFieldNames !== "function" ||
        resolved.getMainFieldNames().length === 0
    ) {
        const index = logStore.activeLogIndex ?? 0;
        if (typeof resolved.openLog === "function") {
            resolved.openLog(index);
        }
    }

    const names = resolved.getMainFieldNames();

    const idx = (name) => fieldIndexOrNeg(resolved, name);
    const iLat = idx("GPS_coord[0]");
    const iLon = idx("GPS_coord[1]");
    // Graph-panel parity: the heli preview (craft_heli_3d.js render) reads
    // attitude[0..2] (roll/pitch/yaw, decidegrees) — NOT heading[0..2], which
    // RF logs don't carry. Convert decideg → rad here so applyFrame() can use
    // the same radian values as rotateTo(-pitch, -yaw, -roll).
    const iRoll = idx("attitude[0]");
    const iPitch = idx("attitude[1]");
    const iYaw = idx("attitude[2]");
    const iThr = idx("throttle");
    const iRcThr = idx("rcCommands[3]"); // betaflight field name (HTML used rcCommand[3])
    const iVelN = idx("GPS_velned[0]");
    const iVelE = idx("GPS_velned[1]");
    const iAlt = idx("GPS_altitude");
    const iBaroAlt = idx("baroAlt");
    const iTime = idx("time");
    const iLoop = idx("loopIteration");
    const iMode = idx("flightModeFlags");

    const wpLat = [],
        wpLon = [],
        wpAlt = [];
    for (let i = 0; i < WP_COUNT; i++) {
        wpLat.push(idx(`GPS_wp_${i}_lat`));
        wpLon.push(idx(`GPS_wp_${i}_lon`));
        wpAlt.push(idx(`GPS_wp_${i}_alt`));
    }
    const iALat = idx("GPS_A_lat"),
        iALon = idx("GPS_A_lon"),
        iAAlt = idx("GPS_A_alt");
    const iBLat = idx("GPS_B_lat"),
        iBLon = idx("GPS_B_lon"),
        iBAlt = idx("GPS_B_alt");

    const num = (vals, k) => {
        if (k < 0 || vals == null || k >= vals.length) return null;
        const v = parseFloat(vals[k]);
        return Number.isNaN(v) ? null : v;
    };

    const degToRad = Math.PI / 1800; // attitude[] is decidegrees → radians
    const minTime = resolved.getMinTime();
    const maxTime = resolved.getMaxTime();
    const out = [];
    // Walk the parsed frames directly via chunk enumeration (loop-iteration
    // granularity, matching the prototype's per-CSV-row sampling) instead of
    // doing a getFrameAtTime() lookup per millisecond.
    const chunks = resolved.getChunksInTimeRange(minTime, maxTime);
    for (const chunk of chunks) {
        for (const row of chunk.frames) {
            const loopIter = iLoop >= 0 ? num(row, iLoop) : -1;
            if (loopIter === 0) continue; // skip first frame (often NaN)
            const tt = iTime >= 0 ? num(row, iTime) : iLoop >= 0 ? num(row, iLoop) : out.length;
            if (tt == null) continue;
            out.push({
                _raw: row,
                t: tt,
                lat: iLat >= 0 ? num(row, iLat) : null,
                lon: iLon >= 0 ? num(row, iLon) : null,
                roll: iRoll >= 0 ? num(row, iRoll) * degToRad : 0,
                pitch: iPitch >= 0 ? num(row, iPitch) * degToRad : 0,
                yaw: iYaw >= 0 ? num(row, iYaw) * degToRad : 0,
                throttle: (iThr >= 0 ? num(row, iThr) : iRcThr >= 0 ? num(row, iRcThr) : 0) || 0,
                alt: iAlt >= 0 ? num(row, iAlt) : 0,
                baroAlt: iBaroAlt >= 0 ? num(row, iBaroAlt) : 0,
                gpsAlt: iAlt >= 0 ? num(row, iAlt) : 0,
                velN: iVelN >= 0 ? num(row, iVelN) : 0,
                velE: iVelE >= 0 ? num(row, iVelE) : 0,
            });
        }
    }

    // Fallback: if the log doesn't carry GPS velocity (GPS_velned[*]), derive
    // ground speed from the displacement between consecutive GPS fixes. Velocities
    // are in m/s: North = d(Lat)/dt, East = d(Lon*cos(Lat))/dt.
    if (iVelN < 0 || iVelE < 0) {
        const toRad = (deg) => (deg * Math.PI) / 180;
        for (let i = 0; i < out.length; i++) {
            const cur = out[i];
            if (cur.lat == null || cur.lon == null) continue;
            let prev = null,
                next = null;
            for (let j = i - 1; j >= 0; j--) {
                if (out[j].lat != null && out[j].lon != null && out[j].t !== cur.t) {
                    prev = out[j];
                    break;
                }
            }
            for (let j = i + 1; j < out.length; j++) {
                if (out[j].lat != null && out[j].lon != null && out[j].t !== cur.t) {
                    next = out[j];
                    break;
                }
            }
            const ref = next || prev;
            if (!ref) continue;
            const dt = (cur.t - ref.t) / 1e6; // us -> s
            if (dt === 0) continue;
            const latM = (cur.lat - ref.lat) * 111320;
            const lonM = (cur.lon - ref.lon) * 111320 * Math.cos(toRad((cur.lat + ref.lat) / 2 / 1e7));
            const sign = next ? 1 : -1; // prev yields velocity reversed in time
            cur.velN = (sign * latM) / dt;
            cur.velE = (sign * lonM) / dt;
        }
    }

    return {
        out,
        headers: names,
        wpLat,
        wpLon,
        wpAlt,
        iALat,
        iALon,
        iAAlt,
        iBLat,
        iBLon,
        iBAlt,
        iAlt,
        iMode,
    };
}
