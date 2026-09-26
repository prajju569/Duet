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

import { parsePlaylistLink } from "./youtubeUrl";
describe("parsePlaylistLink", () => {
  it("reads YouTube Music + YouTube playlist and album links", () => {
    expect(parsePlaylistLink("https://music.youtube.com/playlist?list=PLx7a_Hj-B2c&si=q")).toEqual({ id: "PLx7a_Hj-B2c" });
    expect(parsePlaylistLink("https://youtube.com/playlist?list=OLAK5uy_kAbc123")).toEqual({ id: "OLAK5uy_kAbc123" });
    expect(parsePlaylistLink("https://www.youtube.com/watch?v=BddP6PYo2gs&list=PLabc")).toEqual({ id: "PLabc" });
  });
  it("explains private lists, ignores mixes and plain links", () => {
    expect(parsePlaylistLink("https://music.youtube.com/playlist?list=LM")).toHaveProperty("error");
    expect(parsePlaylistLink("https://music.youtube.com/watch?v=BddP6PYo2gs&list=RDAMVM")).toBeNull();
    expect(parsePlaylistLink("https://youtu.be/BddP6PYo2gs")).toBeNull();
    expect(parsePlaylistLink("kesariya")).toBeNull();
  });
});
