import React from "react";
import { Card } from "@/components/ui/card";

interface PsalmCardProps {
  reference: string;
  verse: string;
  reflection: string;
}

export function PsalmCard({ reference, verse, reflection }: PsalmCardProps) {
  return (
    <Card className="bg-card border-card-border shadow-md overflow-hidden relative">
      <div className="absolute top-0 left-0 w-1 h-full bg-primary/40"></div>
      <div className="p-8 sm:p-10 space-y-6">
        <div className="space-y-4 text-center">
          <h3 className="font-serif text-primary text-lg tracking-widest uppercase font-medium">
            {reference}
          </h3>
          <p className="font-serif text-2xl sm:text-3xl leading-snug italic text-foreground text-balance">
            "{verse}"
          </p>
        </div>
        
        <div className="pt-6 border-t border-border/40">
          <p className="font-sans text-muted-foreground leading-relaxed text-sm sm:text-base">
            {reflection}
          </p>
        </div>
      </div>
    </Card>
  );
}
