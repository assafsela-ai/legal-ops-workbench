import { extractDocumentText, maxUpload } from './document-text'

export async function extractBrowserDocument(file: File, id: string) {
  if (file.size > maxUpload) throw new Error('Choose a document under 10 MB.')
  const bytes = new Uint8Array(await file.arrayBuffer())
  return extractDocumentText(file.name, bytes, id, {
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
  })
}
