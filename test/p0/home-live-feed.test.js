import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import test from "node:test";

const homePage = readFileSync(new URL("../../web/app/page.tsx", import.meta.url), "utf8");
const liveFeed = readFileSync(new URL("../../web/app/live-network-feeds.tsx", import.meta.url), "utf8");

test("homepage keeps the hero focused and does not render the separate live-feed section", () => {
  assert.match(homePage, /Your expertise can open/);
  assert.match(homePage, /<PortalPathwaysSlider\s*\/>/);
  assert.doesNotMatch(homePage, /LiveNetworkFeeds|live-network-feeds/);
  assert.doesNotMatch(homePage, /View all updates|Explore the live network/i);
  // The live feed component remains available for other supported destinations;
  // this check deliberately does not delete or weaken the feed itself.
  assert.match(liveFeed, /Services people can help with/);
  assert.match(liveFeed, /Work opportunities/);
  assert.match(liveFeed, /Professionals in the network/);
  assert.match(liveFeed, /Mentors and guides/);
});
