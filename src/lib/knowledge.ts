import type { Source } from "./conversation";

// Curated fictional clinic documents. Never infer missing policies.
export const clinicKnowledge: Source[] = [
  {
    id: "hours",
    title: "Hours and scheduling",
    text: "Clinic Assistant is a fictional clinic open weekdays from 9am to 5pm, America/Chicago. Consultations last 30 minutes. Appointment availability must be checked live; these hours do not guarantee an opening.",
    href: "/clinic-guide#hours",
  },
  {
    id: "specialties",
    title: "Our specialties",
    text: "Clinic Assistant offers Cardiology for cardiovascular consultations and existing follow-ups, Dermatology for skin, hair and nails, and ENT for ear, nose, throat and hearing appointments. Other specialties require staff assistance. This receptionist cannot diagnose or assess urgency.",
    href: "/clinic-guide#specialties",
  },
  {
    id: "booking",
    title: "Booking and cancellations",
    text: "You can ask questions without registering. Use fictional details to create a demo patient account. Booking requires explicit confirmation by voice, text or a review button. A proposed time is not reserved. Signed-in patients can view and cancel their own future appointments. Rescheduling requires a confirmed replacement; never cancel an original appointment before a replacement is secured.",
    href: "/clinic-guide#booking",
  },
  {
    id: "insurance",
    title: "Insurance and fees",
    text: "Insurance verification, consultation pricing, billing and referral processing are not configured in this fictional demo. Explain this directly and offer supported scheduling help. There is no live billing team or staff transfer to initiate.",
    href: "/clinic-guide#insurance",
  },
  {
    id: "access",
    title: "Location and accessibility",
    text: "Clinic Assistant has no real street address or physical clinic. Parking, wheelchair access and interpreter availability have not been specified for this demo. Staff-handoff previews are local demonstrations, not live transfers.",
    href: "/clinic-guide#access",
  },
  {
    id: "privacy",
    title: "Demo privacy",
    text: "Use fictional patient details only. Up to 200 recent transcript messages are saved privately per user and restored for signed-in users; conversation history can be cleared in My account. Audio is sent to OpenAI for processing and is not stored in Clinic Assistant's database. Demo accounts and confirmed appointments are stored. The voice is AI-generated. Doctors can read clinic appointment notes, not another user's private chat history.",
    href: "/clinic-guide#privacy",
  },
];

export function retrieveKnowledge(ids: string[]) {
  return clinicKnowledge.filter((source) => ids.includes(source.id));
}
