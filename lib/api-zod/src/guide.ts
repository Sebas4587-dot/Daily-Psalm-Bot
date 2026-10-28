import { z } from "zod";
import { BIBLE_BOOKS } from "./bible-books";

export { BIBLE_BOOKS };
export const RecommendationSchema = z.object({
  book: z.string(),
  chapter: z.number().int().positive(),
  verseStart: z.number().int().positive(),
  verseEnd: z.number().int().positive(),
  summary: z.string().min(1).max(1500),
  context: z.string().min(1).max(2000),
  reflection: z.string().min(1).max(2000),
}).strict().superRefine((passage, ctx) => {
  const book = BIBLE_BOOKS.find((b) => b.id === passage.book);
  const maxVerse = book?.verses[passage.chapter - 1];
  if (!maxVerse || passage.verseEnd < passage.verseStart || passage.verseEnd > maxVerse || passage.verseEnd - passage.verseStart > 15) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Invalid Bible passage" });
  }
});

export const GuideReplySchema = z.object({
  format: z.literal("bible-guide-v1"),
  message: z.string().min(1).max(3000),
  recommendations: z.array(RecommendationSchema).max(3),
}).strict();

export const StoredGuideReplySchema = GuideReplySchema.extend({
  passages: z.array(z.object({
    reference: z.string(),
    text: z.string(),
    copyright: z.string(),
  })).max(3).optional(),
});
export type GuideReply = z.infer<typeof GuideReplySchema>;
export type StoredGuideReply = z.infer<typeof StoredGuideReplySchema>;
export type BibleRecommendation = z.infer<typeof RecommendationSchema>;

export function passageReference(passage: BibleRecommendation): string {
  const book = BIBLE_BOOKS.find((b) => b.id === passage.book);
  if (!book) throw new Error("Unknown Bible book");
  return `${book.name} ${passage.chapter}:${passage.verseStart}${passage.verseEnd === passage.verseStart ? "" : `-${passage.verseEnd}`}`;
}

export function passageUrl(passage: BibleRecommendation): string {
  return `https://www.biblegateway.com/passage/?search=${encodeURIComponent(passageReference(passage))}&version=NVI`;
}
