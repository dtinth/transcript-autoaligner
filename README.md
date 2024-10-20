# transcript-autoaligner

**transcript-autoaligner** is a tool for aligning a manually edited transcript (without timing information) with the results of Automatic Speech Recognition (ASR) from Speechmatics to generate accurate, timed subtitles.

![](https://im.dt.in.th/ipfs/bafybeigqnjl7ix5s6rtu7nppglzixl24h2reyswinjixjwcis3tq4vl2a4/image.webp)

## Overview

This project takes two inputs:

1. A manually-edited transcript in TSV format
2. ASR results from Speechmatics

It then aligns these inputs to produce:

1. A visualization of the alignment process (HTML)
2. An aligned TSV file that can be converted into subtitles

## Prerequisites

- [Bun](https://bun.sh/) runtime
- A Speechmatics account for ASR

## Input Preparation

### Transcript (TSV)

1. Create your transcript in Google Sheets
   - Use only the first column
   - Each row represents a caption segment
   - You can use multiple lines within a cell (Shift + Enter)
2. Copy the whole table (you will have some text in your clipboard as TSV format), then save as `input/transcript.tsv`

### ASR Results (JSON)

1. Upload your audio file to [Speechmatics](https://www.speechmatics.com/)
2. Download the JSON result
3. Save it as `input/asr.json`

## Usage

1. Prepare your input files as described above

2. Run the script:

   ```
   bun run align.ts
   ```

3. Check the `output` directory for results

## Output

The script generates two output files:

1. `output/visualization.html`: A visual representation of the alignment process
2. `output/aligned.tsv`: The aligned transcript with timing information

## Converting to Subtitles

The `output/aligned.tsv` file can be converted into actual subtitles using [vttsvtt](https://github.com/dtinth/vttsvtt).

## How it Works

1. Parses the transcript and ASR results
2. Segments text into words
3. Aligns transcript words with ASR words using [diff](https://www.npmjs.com/package/diff-sequences) algorithm
4. Interpolates timing information from ASR to transcript
5. Generates output files

## Note

This tool is designed to work with Thai language content. Adjustments may be needed for other languages.
