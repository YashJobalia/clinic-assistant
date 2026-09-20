"use client";
import { Button } from "@/components/ui/button";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main className="error-page">
      <h1>Let’s try that again.</h1>
      <p>Clinic Assistant couldn’t load this page.</p>
      <Button onClick={reset}>Try again</Button>
      <a href="/">Return home</a>
    </main>
  );
}
