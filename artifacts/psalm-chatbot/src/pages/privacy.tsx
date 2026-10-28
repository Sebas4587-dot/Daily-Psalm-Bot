import { useEffect, useState } from "react";
import { Link, useSearch } from "wouter";
import { ArrowLeft, Leaf, ShieldCheck } from "lucide-react";
import { PRIVACY_CONTENT, PRIVACY_NOTICE } from "@/lib/privacy";
import { GetPrivacyConfigurationResponse } from "@workspace/api-zod";

export default function Privacy() {
  const search = useSearch();
  const language =
    new URLSearchParams(search).get("lang") === "en" ? "en" : "es";
  const ui = PRIVACY_CONTENT[language];
  const [contact, setContact] = useState<{
    status: "loading" | "ready" | "unavailable";
    email: string | null;
  }>({ status: "loading", email: null });

  useEffect(() => {
    document.title = `${ui.title} · ${ui.brand}`;
    document.documentElement.lang = language;
  }, [language, ui]);

  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      try {
        const response = await fetch("/api/privacy/configuration", {
          credentials: "omit",
          cache: "no-store",
          signal: AbortSignal.any([
            controller.signal,
            AbortSignal.timeout(8000),
          ]),
        });
        if (!response.ok) throw new Error("CONTACT_UNAVAILABLE");
        const config = GetPrivacyConfigurationResponse.parse(
          await response.json(),
        );
        if (!controller.signal.aborted)
          setContact({ status: "ready", email: config.contactEmail });
      } catch {
        if (!controller.signal.aborted)
          setContact({ status: "unavailable", email: null });
      }
    })();
    return () => controller.abort();
  }, []);

  return (
    <main className="psalm-shell soft-grain min-h-[100dvh] px-5 py-6 text-foreground sm:px-10 sm:py-10">
      <div className="mx-auto max-w-3xl">
        <header className="flex flex-wrap items-center justify-between gap-5 border-b border-border pb-6">
          <Link
            href="/"
            className="flex items-center gap-2 rounded text-sm text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <ArrowLeft size={16} aria-hidden="true" />
            {ui.back}
          </Link>
          <nav
            aria-label={ui.language}
            className="flex gap-1 rounded-full border border-border bg-background/80 p-1"
          >
            {(["es", "en"] as const).map((lang) => (
              <Link
                key={lang}
                href={`/privacidad?lang=${lang}`}
                hrefLang={lang}
                lang={lang}
                aria-current={lang === language ? "page" : undefined}
                className={`rounded-full px-4 py-2 text-xs font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${language === lang ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}
              >
                {lang === "es" ? "Español" : "English"}
              </Link>
            ))}
          </nav>
        </header>

        <article className="py-10 sm:py-14">
          <p className="mb-5 flex items-center gap-2 text-xs font-semibold uppercase tracking-[.18em] text-primary">
            <Leaf size={17} aria-hidden="true" />
            {ui.brand}
          </p>
          <h1 className="font-serif text-4xl tracking-tight sm:text-5xl">
            {ui.title}
          </h1>
          <p className="mt-4 text-xs text-muted-foreground">
            <time dateTime="2026-10-28">{ui.updated}</time>
          </p>
          <p className="mt-7 text-base leading-8 text-muted-foreground">
            {ui.intro}
          </p>

          <aside
            aria-labelledby="privacy-notice-title"
            className="my-8 rounded-2xl border border-primary/20 bg-primary/5 p-5 sm:p-6"
          >
            <h2
              id="privacy-notice-title"
              className="flex items-center gap-2 font-semibold text-primary"
            >
              <ShieldCheck size={19} aria-hidden="true" />
              {ui.notice}
            </h2>
            <p className="mt-3 text-sm leading-7">{PRIVACY_NOTICE[language]}</p>
          </aside>

          <div className="space-y-9">
            {ui.sections.map((section) => (
              <section key={section.title}>
                <h2 className="font-serif text-2xl tracking-tight">
                  {section.title}
                </h2>
                {section.paragraphs.map((paragraph) => (
                  <p
                    key={paragraph}
                    className="mt-3 text-sm leading-7 text-muted-foreground"
                  >
                    {paragraph}
                  </p>
                ))}
              </section>
            ))}
            <section aria-labelledby="privacy-contact-title">
              <h2
                id="privacy-contact-title"
                className="font-serif text-2xl tracking-tight"
              >
                {ui.contactTitle}
              </h2>
              <p className="mt-3 text-sm leading-7 text-muted-foreground">
                {ui.contactIntro}
              </p>
              <p
                className="mt-2 text-sm leading-7 text-muted-foreground"
                role="status"
                aria-live="polite"
              >
                {contact.email ? (
                  <a
                    className="break-all font-medium text-primary underline underline-offset-4"
                    href={`mailto:${contact.email}`}
                  >
                    {contact.email}
                  </a>
                ) : contact.status === "loading" ? (
                  ui.contactLoading
                ) : contact.status === "ready" ? (
                  ui.contactMissing
                ) : (
                  ui.contactUnavailable
                )}
              </p>
            </section>
          </div>
        </article>

        <footer className="border-t border-border pb-6 pt-6">
          <h2 className="mb-3 text-sm font-semibold">{ui.providersTitle}</h2>
          <ul className="flex flex-wrap gap-x-6 gap-y-3 text-xs text-primary">
            <li>
              <a
                className="underline underline-offset-4"
                href="https://ai.google.dev/gemini-api/terms"
                target="_blank"
                rel="noopener noreferrer"
              >
                {ui.geminiTerms}
              </a>
            </li>
            <li>
              <a
                className="underline underline-offset-4"
                href="https://policies.google.com/privacy"
                target="_blank"
                rel="noopener noreferrer"
              >
                {ui.googlePrivacy}
              </a>
            </li>
            <li>
              <a
                className="underline underline-offset-4"
                href="https://supabase.com/privacy"
                target="_blank"
                rel="noopener noreferrer"
              >
                {ui.supabasePrivacy}
              </a>
            </li>
          </ul>
        </footer>
      </div>
    </main>
  );
}
