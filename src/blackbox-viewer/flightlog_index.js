import { FlightLogParser, ParserAbortedError } from "./flightlog_parser";
import { FlightLogEvent } from "./flightlog_fielddefs";
import { IMU } from "./imu";
import { ArrayDataStream } from "./datastream";
import "./decoders";

/**
 * Drive the parser's parseLogDataGen generator asynchronously: report
 * progress at every checkpoint, give the event loop a turn so the UI can
 * paint, and abort cleanly when `shouldAbort` (memory-pressure guard) fires.
 * Aborting throws ParserAbortedError after closing the generator; the frames
 * decoded so far stay valid for a partial load.
 *
 * @param {FlightLogParser} parser  with onFrameReady already wired up
 * @param {Function} onProgress (absoluteStreamPos) => void
 * @param {Function} shouldAbort (absoluteStreamPos) => boolean
 */
async function driveParseWithGuard(parser, onProgress, shouldAbort) {
    const gen = parser.parseLogDataGen(false);
    let result = gen.next();
    while (!result.done) {
        if (onProgress) {
            onProgress(result.value);
        }
        if (shouldAbort && shouldAbort(result.value)) {
            gen.return(undefined);
            throw new ParserAbortedError();
        }
        // Macrotask: lets Vue flush the progress UI and the browser paint,
        // and gives the GC a slot to run on memory-constrained devices.
        await new Promise((resolve) => setTimeout(resolve, 0));
        result = gen.next();
    }
}

export function FlightLogIndex(logData) {
    //Private:
    const that = this;
    let logBeginOffsets = false;
    let intraframeDirectories = false;
    let prebuilding = false;

    function buildLogOffsetsIndex() {
        const stream = new ArrayDataStream(logData);
        let i;
        let logStart;

        logBeginOffsets = [];

        for (i = 0; ; i++) {
            logStart = stream.nextOffsetOf(FlightLogParser.prototype.FLIGHT_LOG_START_MARKER);

            if (logStart === -1) {
                //No more logs found in the file
                logBeginOffsets.push(stream.end);
                break;
            }

            logBeginOffsets.push(logStart);

            //Restart the search after this header
            stream.pos = logStart + FlightLogParser.prototype.FLIGHT_LOG_START_MARKER.length;
        }
    }

    /**
     * Parse every log in the file and build its intraframe directory.
     *
     * Without arguments this is the historical synchronous build (returns a
     * promise, but the body runs without awaits, so the lazy sync getters
     * below get their result immediately).
     *
     * With `asyncOpts` ({ onProgress, shouldAbort }) the data pass runs on the
     * parseLogDataGen generator: it yields to the event loop at checkpoints
     * (progress UI keeps painting) and stops cleanly on a memory-pressure
     * abort — the affected log is flagged `partial: true` and keeps everything
     * parsed up to the stop point, instead of the whole load failing.
     */
    async function buildIntraframeDirectories(asyncOpts) {
        const async = asyncOpts || null;
        const onProgress = async ? async.onProgress : null;
        const shouldAbort = async ? async.shouldAbort : null;

        const parser = new FlightLogParser(logData, that);

        const directories = [];

        for (let i = 0; i < that.getLogCount(); i++) {
            const intraIndex = {
                times: [],
                offsets: [],
                avgThrottle: [],
                collective: [],
                maxRC: [],
                maxMotorDiff: [],
                swashNoise: [],
                tailNoise: [],
                initialIMU: [],
                initialSlow: [],
                initialGPSHome: [],
                initialGPS: [],
                hasEvent: [],
                minTime: false,
                maxTime: false,
                unLoggedTime: 0,
            };
            const imu = new IMU();
            let iframeCount = 0;
            const motorFields = [];
            const maxRCFields = [];
            let throttleTotal;
            let rcTotal;
            let maxMotor;
            let minMotor;
            let parsedHeader;
            let sawEndMarker = false;

            try {
                parser.parseHeader(logBeginOffsets[i], logBeginOffsets[i + 1]);
                parsedHeader = true;
            } catch (e) {
                console.log(`Error parsing header of log #${i + 1}: ${e}`);
                intraIndex.error = e;

                parsedHeader = false;
            }

            // Only attempt to parse the log if the header wasn't corrupt
            if (parsedHeader) {
                const sysConfig = parser.sysConfig;
                const mainFrameDef = parser.frameDefs.I;
                const gyroADC = [
                    mainFrameDef.nameToIndex["gyroADC[0]"],
                    mainFrameDef.nameToIndex["gyroADC[1]"],
                    mainFrameDef.nameToIndex["gyroADC[2]"],
                ];
                const accSmooth = [
                    mainFrameDef.nameToIndex["accSmooth[0]"],
                    mainFrameDef.nameToIndex["accSmooth[1]"],
                    mainFrameDef.nameToIndex["accSmooth[2]"],
                ];
                let magADC = [
                    mainFrameDef.nameToIndex["magADC[0]"],
                    mainFrameDef.nameToIndex["magADC[1]"],
                    mainFrameDef.nameToIndex["magADC[2]"],
                ];
                let lastSlow = [];
                let lastGPSHome = [];
                let lastGPS = [];

                // Identify motor fields so they can be used to show the activity summary bar
                for (let j = 0; j < 8; j++) {
                    if (mainFrameDef.nameToIndex[`motor[${j}]`] !== undefined) {
                        motorFields.push(mainFrameDef.nameToIndex[`motor[${j}]`]);
                    }
                }

                for (let j = 0; j < 3; j++) {
                    if (mainFrameDef.nameToIndex[`rcCommand[${j}]`] === undefined) {
                        console.log("RCField not found");
                    } else {
                        maxRCFields.push(mainFrameDef.nameToIndex[`rcCommand[${j}]`]);
                    }
                }

                // Collective pitch field for the activity summary bar
                // (ref: rfblackbox/js/flightlog_index.js:96 — mixer[3] with setpoint[3] fallback)
                const collectiveIndex =
                    mainFrameDef.nameToIndex["mixer[3]"] ?? mainFrameDef.nameToIndex["setpoint[3]"];

                // Vibration summary fields: high-frequency gyro content estimated as
                // gyroRAW - gyroADC (filtered), accumulated per chunk. Falls back to the
                // frame-to-frame delta of the filtered gyro when gyroRAW is unavailable.
                const gyroRawFields = [
                    mainFrameDef.nameToIndex["gyroRAW[0]"],
                    mainFrameDef.nameToIndex["gyroRAW[1]"],
                    mainFrameDef.nameToIndex["gyroRAW[2]"],
                ];
                const hasGyroRaw = gyroRawFields[0] !== undefined && gyroRawFields[1] !== undefined && gyroRawFields[2] !== undefined;
                let noiseSquaredSum = [0, 0, 0];
                let noiseFrameCount = 0;
                let noisePrevGyroADC = null;

                // Do we have mag fields? If not mark that data as absent
                if (magADC[0] === undefined) {
                    magADC = false;
                }

                let frameTime;
                parser.onFrameReady = function (frameValid, frame, frameType, frameOffset, _frameSize) {
                    if (!frameValid) {
                        return;
                    }

                    switch (frameType) {
                        case "P":
                        case "I":
                            frameTime = frame[FlightLogParser.prototype.FLIGHT_LOG_FIELD_INDEX_TIME];
                            if (intraIndex.minTime === false) {
                                intraIndex.minTime = frameTime;
                            }

                            if (intraIndex.maxTime === false || frameTime > intraIndex.maxTime) {
                                intraIndex.maxTime = frameTime;
                            }

                            // Accumulate the high-frequency gyro content for this chunk
                            noiseFrameCount++;
                            for (let a = 0; a < 3; a++) {
                                const adc = frame[gyroADC[a]];
                                const delta = hasGyroRaw
                                    ? frame[gyroRawFields[a]] - adc
                                    : adc - (noisePrevGyroADC !== null ? noisePrevGyroADC[a] : adc);
                                noiseSquaredSum[a] += delta * delta;
                            }
                            noisePrevGyroADC = [frame[gyroADC[0]], frame[gyroADC[1]], frame[gyroADC[2]]];

                            if (frameType === "I") {
                                // Start a new chunk on every 4th I-frame
                                if (iframeCount % 4 === 0) {
                                    // Log the beginning of the new chunk
                                    intraIndex.times.push(frameTime);
                                    intraIndex.offsets.push(frameOffset);

                                    if (motorFields.length) {
                                        throttleTotal = 0;
                                        maxMotor = 0;
                                        minMotor = 2000;
                                        for (const mofo of motorFields) {
                                            maxMotor = Math.max(frame[mofo], maxMotor);
                                            minMotor = Math.min(frame[mofo], minMotor);
                                            throttleTotal += frame[mofo];
                                        }

                                        intraIndex.maxMotorDiff.push(maxMotor - minMotor);
                                        intraIndex.avgThrottle.push(Math.round(throttleTotal / motorFields.length));
                                    }
                                    if (maxRCFields.length) {
                                        rcTotal = 0;
                                        for (const rcfo of maxRCFields) {
                                            rcTotal += Math.max(rcTotal, Math.abs(frame[rcfo]));
                                        }

                                        intraIndex.maxRC.push(rcTotal);
                                    }

                                    intraIndex.collective.push(collectiveIndex !== undefined ? frame[collectiveIndex] : 0);

                                    // Chunk vibration RMS: swash = worse of roll/pitch, tail = yaw
                                    const noiseDiv = noiseFrameCount || 1;
                                    const noiseRMS = [
                                        Math.sqrt(noiseSquaredSum[0] / noiseDiv),
                                        Math.sqrt(noiseSquaredSum[1] / noiseDiv),
                                        Math.sqrt(noiseSquaredSum[2] / noiseDiv),
                                    ];
                                    intraIndex.swashNoise.push(Math.max(noiseRMS[0], noiseRMS[1]));
                                    intraIndex.tailNoise.push(noiseRMS[2]);
                                    noiseSquaredSum = [0, 0, 0];
                                    noiseFrameCount = 0;

                                    /* To enable seeking to an arbitrary point in the log without re-reading anything
                                     * that came before, we have to record the initial state of various items which aren't
                                     * logged anew every iteration.
                                     */
                                    intraIndex.initialIMU.push(new IMU(imu));
                                    intraIndex.initialSlow.push(lastSlow);
                                    intraIndex.initialGPSHome.push(lastGPSHome);
                                    intraIndex.initialGPS.push(lastGPS);
                                }

                                iframeCount++;
                            }

                            imu.updateEstimatedAttitude(
                                [frame[gyroADC[0]], frame[gyroADC[1]], frame[gyroADC[2]]],
                                [frame[accSmooth[0]], frame[accSmooth[1]], frame[accSmooth[2]]],
                                frame[FlightLogParser.prototype.FLIGHT_LOG_FIELD_INDEX_TIME],
                                sysConfig.acc_1G,
                                sysConfig.gyroScale,
                                magADC ? [frame[magADC[0]], frame[magADC[1]], frame[magADC[2]]] : false,
                            );
                            break;
                        case "G":
                            lastGPS = frame.slice(0);
                            lastGPS.shift(); // Remove the time field
                            break;
                        case "H":
                            lastGPSHome = frame.slice(0);
                            break;
                        case "E":
                            // Mark that there was an event inside the current chunk
                            if (intraIndex.times.length > 0) {
                                intraIndex.hasEvent[intraIndex.times.length - 1] = true;
                            }

                            if (frame.event === FlightLogEvent.LOG_END) {
                                sawEndMarker = true;
                            }

                            if (frame.event === FlightLogEvent.LOGGING_RESUME) {
                                if (frameTime) {
                                    intraIndex.unLoggedTime += frame.data.currentTime - frameTime;
                                }
                            }

                            break;
                        case "S":
                            lastSlow = frame.slice(0);
                            break;
                    }
                };

                try {
                    if (async) {
                        // Async mode: generator-driven pass with progress + abort.
                        // A memory-pressure abort leaves the frames parsed so far
                        // in place (partial load) rather than failing the log.
                        await driveParseWithGuard(parser, onProgress, shouldAbort);
                    } else {
                        parser.parseLogData(false);
                    }
                } catch (e) {
                    if (async && e instanceof ParserAbortedError) {
                        intraIndex.partial = true;
                    } else {
                        intraIndex.error = e;
                    }
                }

                // Don't bother including the initial (empty) states for S and H frames if we didn't have any in the source data
                if (!parser.frameDefs.S) {
                    delete intraIndex.initialSlow;
                }

                if (!parser.frameDefs.H) {
                    delete intraIndex.initialGPSHome;
                }

                intraIndex.stats = parser.stats;
            }

            // Did we not find any events in this log?
            if (intraIndex.minTime === false) {
                if (sawEndMarker) {
                    intraIndex.error = "Logging paused, no data";
                } else if (intraIndex.partial) {
                    // Memory guard fired before any frame of this log was
                    // decoded — there is nothing usable to show for it.
                    intraIndex.error = "Out of memory before any data could be parsed";
                } else {
                    intraIndex.error = "Log truncated, no data";
                }
            }

            directories.push(intraIndex);
        }

        // Assign only when complete: during an async build a sync getter
        // must keep seeing `false` (unbuilt) rather than a half-filled array.
        intraframeDirectories = directories;
    }

    //Public:
    this.loadFromJSON = function (_json) {};

    this.saveToJSON = function () {
        const intraframeDirectories = this.getIntraframeDirectories();
        let i;
        let j;
        const resultIndexes = new Array(intraframeDirectories.length);

        for (i = 0; i < intraframeDirectories.length; i++) {
            let lastTime;
            let lastLastTime;
            let lastOffset;
            let lastLastOffset;
            const sourceIndex = intraframeDirectories[i];
            const resultIndex = {
                times: new Array(sourceIndex.times.length),
                offsets: new Array(sourceIndex.offsets.length),
                minTime: sourceIndex.minTime,
                maxTime: sourceIndex.maxTime,
                avgThrottle: new Array(sourceIndex.avgThrottle.length),
                maxRC: new Array(sourceIndex.maxRC.length),
                maxMotorDiff: new Array(sourceIndex.maxMotorDiff.length),
            };

            if (sourceIndex.times.length > 0) {
                resultIndex.times[0] = sourceIndex.times[0];
                resultIndex.offsets[0] = sourceIndex.offsets[0];

                lastLastTime = lastTime = sourceIndex.times[0];
                lastLastOffset = lastOffset = sourceIndex.offsets[0];

                for (j = 1; j < sourceIndex.times.length; j++) {
                    resultIndex.times[j] = sourceIndex.times[j] - 2 * lastTime + lastLastTime;
                    resultIndex.offsets[j] = sourceIndex.offsets[j] - 2 * lastOffset + lastLastOffset;

                    lastLastTime = lastTime;
                    lastTime = sourceIndex.times[j];

                    lastLastOffset = lastOffset;
                    lastOffset = sourceIndex.offsets[j];
                }
            }

            if (sourceIndex.avgThrottle.length > 0) {
                // Assuming that avgThrottle, maxRC and maxMotorDiff Arrays are the same length
                // since they are build in the same loop. Just to get rid of a codesmell on Sonarcloud
                for (let j = 0; j < sourceIndex.avgThrottle.length; j++) {
                    resultIndex.avgThrottle[j] = sourceIndex.avgThrottle[j] - 1000;
                    resultIndex.maxRC[j] = sourceIndex.maxRC[j] * 20 - 1000;
                    resultIndex.maxMotorDiff[j] = sourceIndex.maxMotorDiff[j] * 20 - 1000;
                }
            }
            resultIndexes[i] = resultIndex;
        }

        return JSON.stringify(resultIndexes);
    };

    this.getLogBeginOffset = function (index) {
        if (!logBeginOffsets) {
            buildLogOffsetsIndex();
        }

        return logBeginOffsets[index];
    };

    this.getLogCount = function () {
        if (!logBeginOffsets) {
            buildLogOffsetsIndex();
        }

        return logBeginOffsets.length - 1;
    };

    this.getIntraframeDirectories = function () {
        if (!intraframeDirectories) {
            buildIntraframeDirectories();
        }

        return intraframeDirectories;
    };

    /* True while an async prebuild() is still parsing. Sync callers should
     * avoid forcing a duplicate synchronous build during that window; the
     * load flow awaits prebuild before touching the getters. */
    this.isPrebuilding = function () {
        return prebuilding;
    };

    /* Read one intraframe directory WITHOUT triggering the synchronous build
     * (returns undefined while unbuilt). Lets callers check flags like
     * `partial` cheaply and safely during/after an async prebuild. */
    this.peekDirectory = function (logIndex) {
        return intraframeDirectories ? intraframeDirectories[logIndex] : undefined;
    };

    /**
     * Pre-build the intraframe directories asynchronously, before any sync
     * getter triggers the blocking one-shot build. Enables a loading progress
     * display and a memory-pressure abort (partial load) on devices with
     * small heaps — see memory_guard.js and the load flow in main.js.
     *
     * @param {Object} [opts]
     * @param {Function} [opts.onProgress] (absoluteStreamPos) => void
     * @param {Function} [opts.shouldAbort] (absoluteStreamPos) => boolean
     * @returns {Promise<boolean>} true when this call performed the build,
     *          false when the index was already (being) built.
     */
    this.prebuild = function (opts) {
        if (intraframeDirectories || prebuilding) {
            return Promise.resolve(false);
        }
        prebuilding = true;
        return buildIntraframeDirectories(opts)
            .then(() => {
                prebuilding = false;
                return true;
            })
            .catch((e) => {
                prebuilding = false;
                // buildIntraframeDirectories stores per-log errors itself and
                // never rejects in practice; rethrow-shaped safety net keeps
                // the flag consistent without crashing the load flow.
                console.error("FlightLogIndex prebuild failed:", e);
                return false;
            });
    };

    this.getIntraframeDirectory = function (logIndex) {
        return this.getIntraframeDirectories()[logIndex];
    };
}
