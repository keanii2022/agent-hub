import type { NextConfig } from "next";

const approvalDeskDatabase = process.env.APPROVAL_DESK_DATABASE ?? "";

const nextConfig: NextConfig = {
  // The page draws the house list too, and a browser can't read the server's
  // settings. Only the word "real" or "demo" is built into the page, never
  // the path itself.
  env: {
    HUB_APPROVAL_DESK_DATA: approvalDeskDatabase.trim() === "" ? "demo" : "real",
  },
};

export default nextConfig;
