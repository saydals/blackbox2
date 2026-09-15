import { describe, it, expect } from "vitest";
import { FlightLogFieldPresenter } from "../src/blackbox-viewer/flightlog_fields_presenter.js";
const P = FlightLogFieldPresenter;
const RF = 5, BF = 3;
const cases = [
  ["rcCommand[3]", null, null, RF, "4.6.0", "RC Command [collective]"],
  ["rcCommand[4]", null, null, RF, "4.6.0", "RC Command [throttle]"],
  ["servo[5]", null, null, RF, "4.6.0", "Servo [6]"],
  ["Vbat", null, null, RF, "4.6.0", "Battery Voltage"],
  ["setpoint[3]", null, null, RF, "4.6.0", "Setpoint [collective]"],
  ["EscRPM", null, null, RF, "4.6.0", "ESC eRPM"],
  ["headspeed", null, null, RF, "4.6.0", "Headspeed"],
  ["mixer[2]", null, null, RF, "4.6.0", "Mixer SY [yaw]"],
  ["vbatLatest", null, "1.44", undefined, undefined, "Battery volt."],
  ["accSmooth[0]", null, "1.44", undefined, undefined, "Accel. [X]"],
];
describe("BP-3 RF friendly labels", () => {
  it("RF logs use RF table, BF unchanged", () => {
    for (const [f, d, a, t, v, exp] of cases) {
      expect(P.fieldNameToFriendly(f, d, a, t, v)).toBe(exp);
    }
  });
});
