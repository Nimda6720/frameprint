import { importLetterboxd } from './import';

self.onmessage = async (event: MessageEvent<File>) => {
  try { self.postMessage({ result: await importLetterboxd(event.data) }); }
  catch (error) { self.postMessage({ error: error instanceof Error ? error.message : 'Could not read this export.' }); }
};
