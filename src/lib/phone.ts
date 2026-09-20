import twilio from "twilio";

export function validTwilioSignature(
  token: string,
  signature: string,
  url: string,
  params: Record<string, string>,
) {
  return (
    Boolean(token && signature) &&
    twilio.validateRequest(token, signature, url, params)
  );
}
export function phoneTwiml(websocketUrl: string) {
  const url = new URL(websocketUrl);
  if (
    url.protocol !== "wss:" ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  )
    throw new Error(
      "Use a public wss URL without credentials, query or fragment.",
    );
  const response = new twilio.twiml.VoiceResponse();
  response.connect().conversationRelay({
    url: url.toString(),
    language: "en-US",
    interruptible: "speech",
    preemptible: true,
    welcomeGreeting:
      "Hello, and welcome to Clinic Assistant. I'm Mira, your AI receptionist for this demo clinic. How can I help you today?",
  });
  response.say("Thank you for calling Clinic Assistant. Take care, and goodbye.");
  response.hangup();
  return response.toString();
}
