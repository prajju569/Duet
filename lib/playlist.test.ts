import { describe, expect, it } from "vitest";
import { toTracks } from "./playlist";

const row = (id: string, title = id, privacy = "public") => ({
  snippet: { title, videoOwnerChannelTitle: "Arijit Singh - Topic", resourceId: { videoId: id } },
  status: { privacyStatus: privacy },
});

describe("toTracks", () => {
  it("keeps playable songs in order, cleans ' - Topic', drops the rest", () => {
    const { tracks, skipped } = toTracks(
      [row("aaaaaaaaaaa", "Kesariya"), row("bbbbbbbbbbb", "Private video", "private"), row("ccccccccccc"), row("aaaaaaaaaaa"), row("ddddddddddd"), row("eeeeeeeeeee")],
      [
        { id: "aaaaaaaaaaa", contentDetails: { duration: "PT4M28S" }, status: { embeddable: true } },
        { id: "ccccccccccc", contentDetails: { duration: "PT3M" }, status: { embeddable: false } },
        { id: "ddddddddddd", contentDetails: { duration: "P0D" }, status: { embeddable: true } },
      ],
    );
    expect(tracks.map((t) => t.videoId)).toEqual(["aaaaaaaaaaa"]);
    expect(tracks[0]).toMatchObject({ title: "Kesariya", channel: "Arijit Singh", durationSec: 268 });
    expect(skipped).toBe(4); // private, not embeddable, live, deleted (no details)
  });
});
