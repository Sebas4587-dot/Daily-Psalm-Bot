import { BookOpen, Quote } from "lucide-react";
import { Card } from "@/components/ui/card";

interface PsalmCardProps {
  reference: string;
  verse: string;
  reflection: string;
}

export function PsalmCard({ reference, verse, reflection }: PsalmCardProps) {
  return (
    <Card className="relative isolate overflow-hidden rounded-[26px] border border-[hsl(169_24%_76%/.7)] bg-[linear-gradient(145deg,hsl(163_28%_91%),hsl(43_42%_94%)_74%)] text-foreground shadow-[0_14px_40px_hsl(169_25%_25%/.08)]">
      <div className="absolute -right-12 -top-16 h-48 w-48 rounded-full border border-primary/10" aria-hidden="true" />
      <div className="absolute -right-5 -top-9 h-32 w-32 rounded-full border border-primary/10" aria-hidden="true" />
      <div className="relative p-6 sm:p-9">
        <div className="mb-6 flex items-center justify-between">
          <span className="inline-flex items-center gap-2 rounded-full border border-primary/10 bg-background/55 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[.17em] text-primary">
            <BookOpen className="h-3.5 w-3.5" aria-hidden="true" />
            {reference}
          </span>
          <Quote className="h-6 w-6 text-primary/30" strokeWidth={1.5} aria-hidden="true" />
        </div>
        <blockquote className="max-w-[620px] font-serif text-[clamp(1.5rem,4vw,2.2rem)] leading-[1.32] tracking-[-.025em] text-foreground">
          “{verse}”
        </blockquote>
        {reflection && (
          <div className="mt-7 border-t border-primary/10 pt-5">
            <p className="max-w-[640px] text-[13px] leading-[1.8] text-foreground/75 sm:text-sm">{reflection}</p>
          </div>
        )}
      </div>
    </Card>
  );
}
