// Runs one custom indicator file away from the desk server's main thread, so a slow or stuck compute() cannot freeze
// the chart: the server stops this worker after a few seconds. It is not a security sandbox: the file still runs with
// this computer's permissions, which is why custom code stays off until the trader reads it and turns it on.
import { parentPort, workerData } from 'node:worker_threads';
import { pathToFileURL } from 'node:url';

const { file, bars, params } = workerData;
try {
  const mod = (await import(pathToFileURL(file).href)).default;
  if (!mod || typeof mod.compute !== 'function') throw new Error('The file must export default { compute(bars) }');
  const res = await mod.compute(bars, params || {});
  parentPort.postMessage({ ok: true, label: mod.label, pane: mod.pane, guides: mod.guides, res });
} catch (e) {
  parentPort.postMessage({ ok: false, error: e && e.message ? e.message : String(e) });
}
