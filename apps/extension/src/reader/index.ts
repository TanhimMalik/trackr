import { readJob } from "./read-job";

// Injected into open tabs only when the person triages them, never on its
// own. It reads the page and sends nothing; the service worker calls it.
(globalThis as { __trackrReadJob?: () => unknown }).__trackrReadJob = () =>
  readJob(document, new URL(location.href));
