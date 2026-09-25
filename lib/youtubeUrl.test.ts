import { describe, expect, it } from "vitest";
import { parseYouTubeId } from "./youtubeUrl";

describe("parseYouTubeId", () => {
  it("handles every common link shape", () => {
    expect(parseYouTubeId("https://www.youtube.com/watch?v=BddP6PYo2gs")).toBe("BddP6PYo2gs");
    expect(parseYouTubeId("https://youtu.be/BddP6PYo2gs?si=abc")).toBe("BddP6PYo2gs");
    expect(parseYouTubeId("https://m.youtube.com/watch?feature=share&v=BddP6PYo2gs")).toBe("BddP6PYo2gs");
    expect(parseYouTubeId("https://youtube.com/shorts/BddP6PYo2gs")).toBe("BddP6PYo2gs");
    expect(parseYouTubeId("https://music.youtube.com/watch?v=BddP6PYo2gs&list=RD")).toBe("BddP6PYo2gs");
    expect(parseYouTubeId("check this https://youtu.be/BddP6PYo2gs 😍")).toBe("BddP6PYo2gs");
  });
  it("ignores normal searches", () => {
    expect(parseYouTubeId("kesariya arijit")).toBeNull();
    expect(parseYouTubeId("https://example.com/watch?v=BddP6PYo2gs")).toBeNull();
  });
});
