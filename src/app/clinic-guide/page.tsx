import { clinicKnowledge } from "@/lib/knowledge";

export default function ClinicGuide() {
  return (
    <main className="clinic-guide">
      <a href="/">← Back to Clinic Assistant</a>
      <h1>Fictional clinic guide</h1>
      <p>The receptionist uses these documents to answer clinic questions.</p>
      {clinicKnowledge.map((source) => (
        <section id={source.id} key={source.id}>
          <h2>{source.title}</h2>
          <p>{source.text}</p>
        </section>
      ))}
    </main>
  );
}
