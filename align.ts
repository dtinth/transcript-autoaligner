import { type Html, html, renderHtml } from "@thai/html";
import * as csv from "csv/sync";
import diffSequences from "diff-sequences";
import { mkdirSync } from "node:fs";

// Input 1: A talk’s transcript in TSV format, where each row is a subtitle.
// Each row should have just one column, however that column may contain multiple lines.
const tsv = await Bun.file("input/transcript.tsv").text();
const rows = csv.parse(tsv, {
  delimiter: "\t",
  relaxQuotes: true,
}) as string[][];

// Input 2: ASR result obtained from Speechmatics.
const asr = (await Bun.file("input/asr.json").json()) as {
  results: {
    start_time: number;
    end_time: number;
    alternatives: { content: string }[];
  }[];
};

interface TranscriptWord {
  word: string;
  index: number;
  alignment?: {
    start: number;
    end: number;
    exact: boolean;
    index: number;
  };
}

const transcriptWords: TranscriptWord[] = [];

const toWords = (text: string) =>
  Array.from(
    new Intl.Segmenter("th", { granularity: "word" }).segment(text)
  ).filter((s) => s.isWordLike);

const asrWords: { word: string; start: number; end: number; index: number }[] =
  [];
const outputRows: { words: TranscriptWord[]; text: string }[] = [];
for (const [col] of rows) {
  if (!col?.trim()) {
    continue;
  }
  const words = toWords(col);
  const wordsThisRow: TranscriptWord[] = [];
  for (const { segment: word, index } of words) {
    const transcriptWord: TranscriptWord = { word, index };
    transcriptWords.push(transcriptWord);
    wordsThisRow.push(transcriptWord);
  }
  outputRows.push({ words: wordsThisRow, text: col });
}
for (const result of asr.results) {
  const [{ content }] = result.alternatives;
  if (!content) {
    continue;
  }
  const words = toWords(content);
  for (const [i, { segment: word }] of words.entries()) {
    const start =
      result.start_time +
      (i / words.length) * (result.end_time - result.start_time);
    const end =
      result.start_time +
      ((i + 1) / words.length) * (result.end_time - result.start_time);
    asrWords.push({ word, start, end, index: asrWords.length });
  }
}

console.log("Words in transcript", transcriptWords.length);
console.log("Words in ASR", asrWords.length);

const groups: {
  aligned: boolean;
  fromTranscript: (typeof transcriptWords)[number][];
  fromAsr: (typeof asrWords)[number][];
}[] = [];

let lastTranscriptIndex = 0;
let lastAsrIndex = 0;

diffSequences(
  transcriptWords.length,
  asrWords.length,
  (i, j) => transcriptWords[i].word.localeCompare(asrWords[j].word) === 0,
  (nCommon, tIndex, aIndex) => {
    groups.push({
      aligned: false,
      fromTranscript: transcriptWords.slice(lastTranscriptIndex, tIndex),
      fromAsr: asrWords.slice(lastAsrIndex, aIndex),
    });
    groups.push({
      aligned: true,
      fromTranscript: transcriptWords.slice(tIndex, tIndex + nCommon),
      fromAsr: asrWords.slice(aIndex, aIndex + nCommon),
    });
    lastTranscriptIndex = tIndex + nCommon;
    lastAsrIndex = aIndex + nCommon;
  }
);

for (const group of groups) {
  if (!group.fromAsr.length) continue;
  const resolveTime = (t: number) => {
    // t is a fraction of the way through the group, from 0 to group.fromAsr.length
    const index = Math.min(Math.floor(t), group.fromAsr.length - 1);
    const fraction = t - index;
    return {
      time:
        group.fromAsr[index].start +
        fraction * (group.fromAsr[index].end - group.fromAsr[index].start),
      index: group.fromAsr[index].index,
    };
  };
  // Interpolate the timing from ASR into the transcript.
  for (const [i, word] of group.fromTranscript.entries()) {
    const scaledStart =
      (i * group.fromAsr.length) / group.fromTranscript.length;
    const scaledQuarter =
      ((i + 0.25) * group.fromAsr.length) / group.fromTranscript.length;
    const { time: start, index } = resolveTime(scaledStart);
    const { time: quarter } = resolveTime(scaledQuarter);
    const duration = (quarter - start) * 4;
    word.alignment = {
      start,
      end: start + duration,
      exact: group.aligned,
      index,
    };
  }
}

let lastTime = "0";
const outTsvRows: string[][] = [];
for (const row of outputRows) {
  const alignedWords = row.words.filter((word) => word.alignment);
  const start = Math.min(
    ...alignedWords.map((word) => word.alignment!.start)
  ).toFixed(1);
  const end = Math.max(
    ...alignedWords.map((word) => word.alignment!.end)
  ).toFixed(1);
  if (+start - +lastTime > 0.15) {
    outTsvRows.push([lastTime, ""]);
  }
  outTsvRows.push([start, row.text]);
  lastTime = end;
}
outTsvRows.push([lastTime, ""]);
const outTsv = csv.stringify(outTsvRows, {
  delimiter: "\t",
});

mkdirSync("output", { recursive: true });

Bun.write(
  "output/vizualization.html",
  renderHtml(html`
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8" />
        <link
          href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css"
          rel="stylesheet"
          integrity="sha384-QWTKZyjpPEjISv5WaRU9OFeRpok6YctnYmDr5pNlyT2bRjXh0JMhjY6hW+ALEwIH"
          crossorigin="anonymous"
        />

        <style>
          .aligned {
            background-color: #f0f0f0;
          }
          .alignment[data-kind="exact"] {
            color: var(--bs-green);
          }
          .alignment[data-kind="approx"] {
            color: var(--bs-orange);
          }
          .alignment[data-kind="missing"] {
            color: var(--bs-red);
          }
        </style>
      </head>
      <body class="p-4">
        <details>
          <summary>Alignment process</summary>
          <table>
            <colgroup>
              <col style="width: 50%" />
              <col style="width: 50%" />
            </colgroup>
            ${groups.map(
              (group) => html`
                <tr class="${group.aligned ? "aligned" : ""}">
                  <td class="transcript">
                    ${group.fromTranscript.map((word) => word.word).join(" ")}
                  </td>
                  <td class="asr">
                    ${group.fromAsr.map((word) => word.word).join(" ")}
                  </td>
                </tr>
              `
            )}
          </table>
        </details>
        <h1>Alignment result</h1>
        <table>
          <thead>
            <tr>
              <th>Transcript</th>
              <th nowrap align="right">Start time</th>
              <th nowrap align="right">End time</th>
              <th style="padding-left: 1ch">Aligned words</th>
            </tr>
          </thead>
          ${outputRows.map((row) => {
            const alignedWords = row.words.filter((word) => word.alignment);
            const start = Math.min(
              ...alignedWords.map((word) => word.alignment!.start)
            );
            const end = Math.max(
              ...alignedWords.map((word) => word.alignment!.end)
            );
            const startIndex = Math.min(
              ...alignedWords.map((word) => word.alignment!.index)
            );
            const endIndex = Math.max(
              ...alignedWords.map((word) => word.alignment!.index)
            );
            const usedWords = asrWords.slice(startIndex, endIndex + 1);
            const words = usedWords.map((word) => word.word).join(" ");
            const codes = [...row.text] as Html[];
            for (const word of row.words) {
              const startIndex = word.index;
              const endIndex = word.index + [...word.word].length;
              const kind = word.alignment
                ? word.alignment.exact
                  ? "exact"
                  : "approx"
                : "missing";
              // prettier-ignore
              codes[startIndex] = html`<span class="alignment" data-kind="${kind}">${codes[startIndex]}`;
              codes[endIndex - 1] = html`${codes[endIndex - 1]}</span>`;
            }
            return html`
              <tr data-words="${JSON.stringify(row.words)}">
                <td style="white-space:pre-wrap">${codes.filter((x) => x)}</td>
                <td align="right">${start.toFixed(2)}s</td>
                <td align="right">${end.toFixed(2)}s</td>
                <td style="padding-left: 1ch">${words}</td>
              </tr>
            `;
          })}
        </table>
      </body>
    </html>
  `)
);

Bun.write("output/aligned.tsv", outTsv);
console.log("done");
