import { BookOpen, ExternalLink } from "lucide-react";
import { passageReference, passageUrl, type BibleRecommendation } from "@workspace/api-zod";
import { Card } from "@/components/ui/card";
import type { Language } from "@/hooks/use-chat-session";

export function ScriptureCard({ recommendation, passage, language }: {
  recommendation: BibleRecommendation;
  passage?: { reference: string; text: string; copyright: string };
  language: Language;
}) {
  const es = language === "es";
  const reference = passageReference(recommendation);
  const verified = passage?.reference === reference ? passage : undefined;
  return (
    <Card className="relative overflow-hidden rounded-[26px] border border-[hsl(169_24%_76%/.7)] bg-[linear-gradient(145deg,hsl(163_28%_91%),hsl(43_42%_94%)_74%)] text-foreground shadow-[0_14px_40px_hsl(169_25%_25%/.08)]" data-testid="scripture-card">
      <div className="relative p-6 sm:p-9">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <span className="inline-flex items-center gap-2 rounded-full border border-primary/10 bg-background/55 px-3 py-1.5 text-xs font-bold text-primary">
            <BookOpen className="h-4 w-4" aria-hidden="true" />{reference}
          </span>
          <span className="text-xs font-semibold tracking-widest text-primary/75">NVI</span>
        </div>
        {verified && (
          <div className="mb-6">
            <blockquote className="whitespace-pre-line font-serif text-xl leading-relaxed sm:text-2xl">{verified.text}</blockquote>
            {verified.copyright && <p className="mt-3 text-xs text-muted-foreground">{verified.copyright}</p>}
          </div>
        )}
        <div className="space-y-5 text-sm leading-7">
          <div><p className="mb-1 text-xs font-bold uppercase tracking-wider text-primary">{es ? "Idea central" : "Central idea"}</p><p>{recommendation.summary}</p></div>
          <div><p className="mb-1 text-xs font-bold uppercase tracking-wider text-primary">{es ? "Contexto del pasaje" : "Passage context"}</p><p>{recommendation.context}</p></div>
          <div><p className="mb-1 text-xs font-bold uppercase tracking-wider text-primary">{es ? "Para lo que estás viviendo" : "For what you are experiencing"}</p><p>{recommendation.reflection}</p></div>
        </div>
        <div className="mt-6 border-t border-primary/10 pt-5">
          <a href={passageUrl(recommendation)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 rounded text-sm font-semibold text-primary underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary" data-testid="read-nvi">
            {es ? "Leer el pasaje completo en NVI" : "Read the full passage in NVI"}<ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
          </a>
          <p className="mt-2 text-xs leading-5 text-muted-foreground">{es ? "El resumen, contexto y reflexión son orientativos; consulta el texto bíblico en la fuente." : "The summary, context, and reflection are guidance; consult the source for the Bible text."}</p>
        </div>
      </div>
    </Card>
  );
}
