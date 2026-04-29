"use strict";

const fs = require("node:fs");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "..");
const protocol = require(path.join(repoRoot, "packages/shared/dist/protocol.js"));

const SOCKET_FILE = path.join(repoRoot, "packages/client/src/network/socket.ts");
const MAIN_FILE = path.join(repoRoot, "packages/client/src/main.ts");

const socketSource = fs.readFileSync(SOCKET_FILE, "utf8");
const mainSource = fs.readFileSync(MAIN_FILE, "utf8");

const declaredEvents = Object.keys(protocol.S2C);
const bindMatches = [...socketSource.matchAll(/bindServerEvent\(S2C\.([A-Za-z0-9_]+)\)/g)].map((match) => match[1]);
const exposedMatches = [...socketSource.matchAll(/^\s{2}on([A-Z][A-Za-z0-9]+)\([^\n]*S2C\.([A-Za-z0-9_]+)/gm)];
const mainMethodMatches = [...mainSource.matchAll(/socket\.(on[A-Z][A-Za-z0-9]+)\(/g)].map((match) => match[1]);

const boundEvents = new Set(bindMatches);
if (/socket\.on\(S2C\.Kick,/.test(socketSource)) {
  boundEvents.add("Kick");
}

const eventToMethod = new Map();
for (const match of exposedMatches) {
  eventToMethod.set(match[2], `on${match[1]}`);
}
eventToMethod.set("Kick", "onKick");

const methodToEvent = new Map();
for (const [eventName, methodName] of eventToMethod.entries()) {
  methodToEvent.set(methodName, eventName);
}

const lifecycleMethods = new Set(["onDisconnect", "onConnectError"]);
const mainMethods = Array.from(new Set(mainMethodMatches));
const unknownMainMethods = mainMethods.filter((methodName) => !methodToEvent.has(methodName) && !lifecycleMethods.has(methodName));

const consumedEvents = declaredEvents.filter((eventName) => {
  const methodName = eventToMethod.get(eventName);
  return typeof methodName === "string" && mainMethods.includes(methodName);
});
const unconsumedEvents = declaredEvents.filter((eventName) => !consumedEvents.includes(eventName));

const missingBindings = declaredEvents.filter((eventName) => !boundEvents.has(eventName));
const missingPublicMethods = declaredEvents.filter((eventName) => !eventToMethod.has(eventName));
const boundNotDeclared = Array.from(boundEvents).filter((eventName) => !declaredEvents.includes(eventName));
const exposedNotDeclared = Array.from(eventToMethod.keys()).filter((eventName) => !declaredEvents.includes(eventName));

function printList(label, items) {
  if (items.length === 0) {
    process.stdout.write(`- ${label}: none\n`);
    return;
  }
  process.stdout.write(`- ${label}: ${items.join(", ")}\n`);
}

function main() {
  process.stdout.write("[client s2c consumption proof] summary\n");
  printList("declared_and_consumed", consumedEvents);
  printList("declared_but_not_consumed", unconsumedEvents);
  printList("main_depends_on_undeclared", unknownMainMethods);

  const failures = [];
  if (missingBindings.length > 0) {
    failures.push(`missing socket bindings: ${missingBindings.join(", ")}`);
  }
  if (missingPublicMethods.length > 0) {
    failures.push(`missing socket public methods: ${missingPublicMethods.join(", ")}`);
  }
  if (boundNotDeclared.length > 0) {
    failures.push(`socket binds undeclared S2C events: ${boundNotDeclared.join(", ")}`);
  }
  if (exposedNotDeclared.length > 0) {
    failures.push(`socket exposes undeclared S2C events: ${exposedNotDeclared.join(", ")}`);
  }
  if (unknownMainMethods.length > 0) {
    failures.push(`main depends on unknown socket callbacks: ${unknownMainMethods.join(", ")}`);
  }

  if (failures.length > 0) {
    process.stderr.write("[client s2c consumption proof] failed\n");
    for (const failure of failures) {
      process.stderr.write(`- ${failure}\n`);
    }
    process.exitCode = 1;
    return;
  }

  process.stdout.write("[client s2c consumption proof] passed\n");
}

main();
