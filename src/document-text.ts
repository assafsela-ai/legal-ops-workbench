import type { PDFDocumentLoadingTask } from 'pdfjs-dist'
import type { Source } from './domain'

export const maxUpload = 10 * 1024 * 1024
export const maxBrowserDocuments = 20

type Bytes = Uint8Array<ArrayBuffer>
type Readers = {
  docx: (bytes: Bytes) => Promise<string>
  pdf: (bytes: Bytes) => Promise<PDFDocumentLoadingTask>
}

export async function extractDocumentText(name: string, bytes: Bytes, id: string, readers: Readers): Promise<Source[]> {
  if (bytes.byteLength > maxUpload) throw new Error('Choose a document under 10 MB.')
  let parts: { label: string; text: string }[]
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
          const content = await (await pdf.getPage(page)).getTextContent()
          const text = content.items.map(item => 'str' in item ? item.str + (item.hasEOL ? '\n' : ' ') : '').join('')
          parts.push({ label: 'Page ' + page, text })
        }
        if (parts.some(part => !part.text.trim())) throw new Error('This PDF contains a page without selectable text.')
      } finally {
        await job.destroy()
      }
    } else {
      throw new Error('Choose a DOCX or a PDF with selectable text.')
    }
  } catch (error) {
    if (error instanceof Error && error.name === 'PasswordException') throw new Error('This PDF is locked. Upload an unlocked copy.')
    if (error instanceof Error && /^(This PDF|Choose a DOCX)/.test(error.message)) throw error
    throw new Error('The file could not be read. Check that it is a valid, unlocked DOCX or PDF.')
  }
  const clean = parts.map((part, index) => ({ ...part, id: id + ':' + (index + 1), text: part.text.trim() })).filter(part => part.text)
  if (!clean.length) throw new Error('No selectable text was found in this document.')
  if (clean.reduce((size, part) => size + part.text.length, 0) > 200_000) throw new Error('The document exceeds 200,000 extracted characters.')
  return clean
}
