import type { NextConfig } from "next";

const approvalDeskDatabase = process.env.APPROVAL_DESK_DATABASE ?? "";

// `next dev` allows one server for each build folder. A second hub started
// from the same checkout (the browser tests start one for the decision tests)
// is given its own with HUB_BUILD_FOLDER.
const buildFolder = (process.env.HUB_BUILD_FOLDER ?? "").trim();

const nextConfig: NextConfig = {
  ...(buildFolder !== "" && { distDir: buildFolder }),
  // The page draws the house list too, and a browser can't read the server's
  // settings. Only the word "real" or "demo" is built into the page, never
  // the path itself.
  env: {
    HUB_APPROVAL_DESK_DATA: approvalDeskDatabase.trim() === "" ? "demo" : "real",
  },
};

export default nextConfig;
