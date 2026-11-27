import type { PDFPageProxy } from 'pdfjs-dist'
import { createWorker, OEM, type Worker } from 'tesseract.js'
import corePath from 'tesseract.js-core/tesseract-core-lstm.wasm.js?url'
import workerPath from 'tesseract.js/dist/worker.min.js?url'

function cancelable<T>(work: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const abort = () => reject(signal.reason)
    if (signal.aborted) abort()
    else signal.addEventListener('abort', abort, { once: true })
    void work.then(resolve, reject).finally(() => signal.removeEventListener('abort', abort))
  })
}

export function createPdfOcr(signal: AbortSignal) {
  let worker: Promise<Worker> | undefined

  async function startWorker() {
    const startup = AbortSignal.any([signal, AbortSignal.timeout(45_000)])
    startup.throwIfAborted()
    let rejectStartup!: (error: Error) => void
    const failed = new Promise<never>((_, reject) => { rejectStartup = reject })
    const initial = createWorker('eng+heb', OEM.LSTM_ONLY, {
      corePath,
      workerPath,
      langPath: new URL('./ocr-data/', window.location.href).href,
      workerBlobURL: false,
      cacheMethod: 'none',
      errorHandler: () => rejectStartup(new Error('This PDF could not start local OCR. Try again.')),
    })
    try {
      return await cancelable(Promise.race([initial, failed]), startup)
    } catch (error) {
      void initial.then(worker => worker.terminate()).catch(() => {})
      throw error
    }
  }

  return {
    async recognize(page: PDFPageProxy) {
      signal.throwIfAborted()
      const engine = await (worker ??= startWorker())
      const original = page.getViewport({ scale: 1 })
      const scale = Math.min(2.65, 2400 / Math.max(original.width, original.height))
      const viewport = page.getViewport({ scale })
      const canvas = document.createElement('canvas')
      canvas.width = Math.ceil(viewport.width)
      canvas.height = Math.ceil(viewport.height)
      const render = page.render({ canvas, viewport, background: '#ffffff' })
      const abort = () => render.cancel()
      signal.addEventListener('abort', abort, { once: true })
      try {
        await render.promise
        signal.throwIfAborted()
        const { data } = await cancelable(engine.recognize(canvas), signal)
        return data.text.trim()
      } catch {
        signal.throwIfAborted()
        throw new Error('This PDF could not finish local OCR. Try a clearer or shorter scan.')
      } finally {
        signal.removeEventListener('abort', abort)
        canvas.width = canvas.height = 0
      }
    },
    async terminate() {
      await worker?.then(engine => engine.terminate()).catch(() => {})
    },
  }
}
