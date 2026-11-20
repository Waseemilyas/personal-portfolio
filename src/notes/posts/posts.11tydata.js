// Directory data for note posts. Every Markdown file here becomes a note at
// /notes/<slug>/. Drafts are never written to disk and never appear in the
// collection or feed, so a note in progress can sit here safely alongside the
// published ones.
/** @typedef {{draft?: boolean, page: {fileSlug: string, rawInput?: string}, description?: string, summary: string}} NoteData */

// Minutes to read the note at 230 words a minute, never less than one. Counted
// from the Markdown source, so the index, the note and its Next link agree.
const WORDS_PER_MINUTE = 230;
/** @param {string} text */
const readingMinutes = (text) =>
  Math.max(1, Math.round((text.match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu) || []).length / WORDS_PER_MINUTE));

export default {
  layout: "note.njk",
  tags: "note",
  draft: false,
  eleventyComputed: {
    permalink: /** @param {NoteData} data */ (data) =>
      data.draft ? false : `/notes/${data.page.fileSlug}/`,
    eleventyExcludeFromCollections: /** @param {NoteData} data */ (data) =>
      data.draft ? true : false,
    // A note's summary is its meta description unless one is set explicitly,
    // so no post has to repeat itself to get a real <meta name="description">.
    description: /** @param {NoteData} data */ (data) => data.description || data.summary,
    readingMinutes: /** @param {NoteData} data */ (data) => readingMinutes(data.page.rawInput || ""),
  },
};
