import mammoth from 'mammoth'
import { extractDocumentText } from '../src/document-text'

export { maxUpload } from '../src/document-text'

export function extract(name: string, bytes: Buffer, id: string) {
  return extractDocumentText(name, new Uint8Array(bytes), id, {
    docx: async () => (await mammoth.extractRawText({ buffer: bytes })).value,
    pdf: async data => {
      const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs')
      return getDocument({ data, useSystemFonts: true, stopAtErrors: true })
    },
  })
}
