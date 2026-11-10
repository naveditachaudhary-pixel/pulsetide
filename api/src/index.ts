import { app } from "@azure/functions";
import { parseSites, TableStore } from "@pulsetide/core";
import rawSites from "../../sites.json";
import { createStatusHandler } from "./status.js";

const sites = parseSites(rawSites);
let store: Promise<TableStore> | undefined;

function getStore(): Promise<TableStore> {
  const conn = process.env.PULSETIDE_STORAGE;
  if (!conn) return Promise.reject(new Error("PULSETIDE_STORAGE is not set"));
  return (store ??= TableStore.connect(conn).catch((err) => { store = undefined; throw err; }));
}

app.http("status", { methods: ["GET"], authLevel: "anonymous", route: "status", handler: createStatusHandler(getStore, sites) });
