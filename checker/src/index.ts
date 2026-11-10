import { app } from "@azure/functions";
import { parseSites, TableStore } from "@pulsetide/core";
import rawSites from "../../sites.json";
import { createChecker } from "./checker.js";

const sites = parseSites(rawSites);
let store: Promise<TableStore> | undefined;

function getStore(): Promise<TableStore> {
  const conn = process.env.PULSETIDE_STORAGE;
  if (!conn) throw new Error("PULSETIDE_STORAGE is not set. Add the storage connection string in the function app's settings.");
  return (store ??= TableStore.connect(conn));
}

// Every 5 minutes, on the minute (seconds, minutes, hours, day, month, weekday).
app.timer("check-sites", { schedule: "0 */5 * * * *", handler: createChecker(getStore, sites) });
