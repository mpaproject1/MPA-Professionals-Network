import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import test from "node:test";

const homePage = readFileSync(new URL("../../web/app/page.tsx", import.meta.url), "utf8");
const liveFeed = readFileSync(new URL("../../web/app/live-network-feeds.tsx", import.meta.url), "utf8");

test("homepage keeps the live network feed without a separate feed-wide CTA", () => {
  assert.match(homePage, /import LiveNetworkFeeds from "\.\/live-network-feeds";/);
  assert.match(homePage, /<LiveNetworkFeeds\s*\/>/);
  assert.match(liveFeed, /Services people can help with/);
  assert.match(liveFeed, /Work opportunities/);
  assert.match(liveFeed, /Professionals in the network/);
  assert.match(liveFeed, /Mentors and guides/);
  assert.match(liveFeed, /Needs people are talking about/);
  assert.doesNotMatch(
    liveFeed,
    /<Link\b[^>]*>\s*(?:View all|See all|Browse all|Explore all)\b/i,
    "the feed should not add a separate all-items CTA; individual feed cards remain navigable",
  );
});
