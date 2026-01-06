import packageJson from "../../package.json";

const currentYear = new Date().getFullYear();

export const APP_CONFIG = {
  name: "Price Monitor",
  version: packageJson.version,
  copyright: `© ${currentYear}, Price Monitor.`,
  meta: {
    title: "Price Monitor - AI-Powered Price Tracking Dashboard",
    description:
      "Monitor product prices from any URL, track price history, and receive automated email alerts when prices drop. Built with Next.js, AI extraction, and modern web technologies.",
  },
};
