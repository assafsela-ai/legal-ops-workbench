import type { PDFDocumentLoadingTask, PDFPageProxy } from 'pdfjs-dist'
import type { Source } from './domain'

export const maxUpload = 10 * 1024 * 1024
export const maxBrowserDocuments = 20

type Bytes = Uint8Array<ArrayBuffer>
type Readers = {
  docx: (bytes: Bytes) => Promise<string>
  pdf: (bytes: Bytes) => Promise<PDFDocumentLoadingTask>
  ocr?: (page: PDFPageProxy, number: number, total: number) => Promise<string>
  signal?: AbortSignal
}

export async function extractDocumentText(name: string, bytes: Bytes, id: string, readers: Readers): Promise<Source[]> {
  if (bytes.byteLength > maxUpload) throw new Error('Choose a document under 10 MB.')
  let parts: Omit<Source, 'id'>[]
  try {
    if (/\.docx$/i.test(name)) {
      if (bytes[0] !== 0x50 || bytes[1] !== 0x4b) throw new Error('Invalid document')
      const text = await readers.docx(bytes)
      parts = text.split(/\n\s*\n/).map((part, index) => ({ label: 'Paragraph ' + (index + 1), text: part }))
    } else if (/\.pdf$/i.test(name)) {
      if (!new TextDecoder().decode(bytes.subarray(0, 1024)).includes('%PDF-')) throw new Error('Invalid document')
      const job = await readers.pdf(bytes)
      try {
        const pdf = await job.promise
        if (pdf.numPages > 250) throw new Error('This PDF exceeds the 250-page limit.')
        parts = []
        for (let page = 1; page <= pdf.numPages; page++) {
          readers.signal?.throwIfAborted()
          const pdfPage = await pdf.getPage(page)
          const content = await pdfPage.getTextContent()
          const text = content.items.map(item => 'str' in item ? item.str + (item.hasEOL ? '\n' : ' ') : '').join('')
          if (!text.trim() && readers.ocr) {
            const recognized = await readers.ocr(pdfPage, page, pdf.numPages)
            parts.push({ label: 'Page ' + page + ' · OCR', text: recognized, ocr: true })
          } else {
            parts.push({ label: 'Page ' + page, text })
          }
          pdfPage.cleanup()
        }
        if (!readers.ocr && parts.some(part => !part.text.trim())) throw new Error('This PDF contains a page without selectable text.')
      } finally {
        await job.destroy()
      }
    } else {
      throw new Error('Choose a DOCX or a PDF with selectable text.')
    }
  } catch (error) {
    readers.signal?.throwIfAborted()
    if (error instanceof Error && error.name === 'PasswordException') throw new Error('This PDF is locked. Upload an unlocked copy.')
    if (error instanceof Error && /^(This PDF|Choose a DOCX)/.test(error.message)) throw error
    throw new Error('The file could not be read. Check that it is a valid, unlocked DOCX or PDF.')
  }
  const clean = parts.map((part, index) => ({ ...part, id: id + ':' + (index + 1), text: part.text.trim() })).filter(part => part.text)
  if (!clean.length) throw new Error(parts.some(part => part.ocr)
    ? 'OCR found no readable text. Try a clearer scan.'
    : 'No selectable text was found in this document.')
  if (clean.reduce((size, part) => size + part.text.length, 0) > 200_000) throw new Error('The document exceeds 200,000 extracted characters.')
  return clean
}
