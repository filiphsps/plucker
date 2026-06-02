// Worker-thread entry for blocking media file operations. Runs the same
// synchronous node-id3 tag I/O and sha256 audio hashing the inline path uses, but
// on a worker thread so a whole-file ID3 rewrite (cover art included) or a hash
// pass never blocks the Electron main thread (and thus the job's progress IPC).
//
// Built as a separate main-process entry via the `?nodeWorker` import in
// media-host.ts and loaded from beside index.js at runtime.
import { parentPort } from 'node:worker_threads'
import { readTrackTags, writeTrackTags, embedCover, readCoverImage } from '../tagger'
import { hashAudioFile } from '../audio-hash'
import type { MediaWorkerRequest, MediaWorkerResponse } from './media-protocol'

if (!parentPort) throw new Error('media-worker must be run as a worker thread')
const port = parentPort

/** Dispatch one media op to its synchronous implementation. */
async function runOp(msg: MediaWorkerRequest): Promise<unknown> {
  switch (msg.op) {
    case 'hash':
      return hashAudioFile(msg.file)
    case 'readTags':
      return readTrackTags(msg.file)
    case 'writeTags':
      writeTrackTags(msg.file, msg.tags)
      return undefined
    case 'embedCover':
      embedCover(msg.file, Buffer.from(msg.image), msg.mime)
      return undefined
    case 'readCover': {
      const cover = readCoverImage(msg.file)
      // Return a plain Uint8Array so structured clone ships the bytes back.
      return cover ? { image: new Uint8Array(cover.image), mime: cover.mime } : null
    }
  }
}

port.on('message', async (msg: MediaWorkerRequest) => {
  try {
    const result = await runOp(msg)
    const res: MediaWorkerResponse = { id: msg.id, ok: true, result: result as never }
    port.postMessage(res)
  } catch (err) {
    const res: MediaWorkerResponse = { id: msg.id, ok: false, error: String(err) }
    port.postMessage(res)
  }
})
