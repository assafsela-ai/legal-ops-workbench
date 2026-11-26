# Legal Ops Workbench

Six workflows for in-house legal teams in one case. Compare vendor claims and contract versions, trace signed terms, and link decisions and tasks back to the wording that supports them.

**[Open the public demo](https://assafsela-ai.github.io/legal-ops-workbench/)** · **[Download fictional sample documents](public/samples/legal-ops-samples.zip)**

## Try the demo

Select **Guided tour** to review a transcription vendor and prepare a fictional product launch. The browser demo uses saved AI results and runs without an account or API key.

1. **AI Vendor Review.** Compare the vendor's training claim with its terms and open the source.
2. **Redline Replay.** Compare the signed agreement with the renewal draft. Review where the liability cap changed.
3. **Deal Desk Memory.** Look up an approved payment exception and check the condition.
4. **Contract Stack.** Switch plans from Enterprise to Standard. Hide Amendment A to see when the deadline needs review.
5. **Promise Tracker.** Add the non-renewal deadline to the task list.
6. **Launch Review.** Change recording retention to 180 days and check which approval needs a second review.

## Work with your own files

Use Node.js 24.12+ on the Node 24 line, or Node.js 26+. From a local checkout run:

```sh
npm ci
npm run build
npm start
```

Open [the local workspace](http://127.0.0.1:4173). Create a case, upload DOCX or PDF text documents, and add the rules in your playbook. The [company rule template](public/samples/company-rule-template.md) shows the fields. Open a reference to inspect the extracted text and download the original file.

- **Ollama.** Install [Ollama](https://ollama.com/download), run `ollama pull qwen3:8b`, and keep Ollama running. Choose Ollama in the analysis settings.
- **OpenAI.** Open **Model settings** and enter your own API key. With a key set, the default provider is OpenAI with GPT-6 Luna. You can still choose Ollama in the model menu. The server retains the key in memory while it runs. **Clear key** removes it. Each cloud run shows the selected text and case context and asks for approval before sending.
- **Storage.** The app listens on the loopback interface. It stores case files and results in `data/workbench.sqlite`. Use **Delete case** to remove the case and its records. Other processes with access to your computer can read the local database according to your OS permissions.

For English-language documents, the text view identifies PDF pages and extracted DOCX paragraphs. PDFs with pages lacking selectable text require a text-based copy. Each upload is limited to 10 MB and each analysis to 48,000 JSON characters. For large cases, select the versions relevant to the question. Contract deadlines and amendments outside the supported wording patterns are flagged for review. Use your legal team's judgment before acting on a finding.

## Development and verification

```sh
npm test
npx playwright install chromium
npx playwright test
npm run eval:live -- ollama
```

The tests include fixture-based checks of both the demo and local analysis and a mock OpenAI transport. The optional live evaluation uses only fictional evidence. Developers testing the OpenAI adapter from the command line can supply their own `OPENAI_API_KEY` and run `npm run eval:live -- openai`. Regular app users enter keys in the UI.

Run `npm run dev` for the browser demo. `npm run build` produces the static demo in `dist/`. The GitHub Pages workflow publishes that output. To regenerate the example files, install Python's `reportlab` and run `python scripts/samples.py`.

[MIT license](LICENSE). The bundled DM Sans font uses the [SIL Open Font License](src/dm-sans-OFL.txt).
