import { extractDocumentText, maxUpload } from './document-text'

const maxScannedPages = 25

export async function extractBrowserDocument(file: File, id: string, signal: AbortSignal, progress: (message: string) => void) {
  if (file.size > maxUpload) throw new Error('Choose a document under 10 MB.')
  const bytes = new Uint8Array(await file.arrayBuffer())
  signal.throwIfAborted()
  let ocr: ReturnType<typeof import('./pdf-ocr').createPdfOcr> | undefined
  let scannedPages = 0
  const unreadablePages: number[] = []
  try {
    const sources = await extractDocumentText(file.name, bytes, id, {
      signal,
      docx: async data => {
        const { default: mammoth } = await import('mammoth')
        return (await mammoth.extractRawText({ arrayBuffer: data.buffer })).value
      },
      pdf: async data => {
        const [{ getDocument, GlobalWorkerOptions }, { default: worker }] = await Promise.all([
          import('pdfjs-dist/legacy/build/pdf.mjs'),
          import('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url'),
        ])
        GlobalWorkerOptions.workerSrc = worker
        return getDocument({ data, useSystemFonts: true, stopAtErrors: true, useWasm: false })
      },
      ocr: async (page, number, total) => {
        if (++scannedPages > maxScannedPages) throw new Error('This PDF exceeds the 25 scanned-page limit. Split it into smaller files.')
        if (!ocr) {
          progress('Loading local OCR for English and Hebrew…')
          const { createPdfOcr } = await import('./pdf-ocr')
          ocr = createPdfOcr(signal)
        }
        progress(`Reading scanned page ${number} of ${total}…`)
        const text = await ocr.recognize(page)
        if (!text.trim()) unreadablePages.push(number)
        return text
      },
    })
    return { sources, unreadablePages }
  } finally {
    await ocr?.terminate()
  }
}
