// Keep language detection automatic. Hindi/Urdu share spoken vocabulary, so
// provide a script preference for ambiguous Hindi/Hinglish without forcing hi.
export const transcriptionPrompt =
  "Transcribe the original spoken words, without translation. Conversations may switch languages on every turn. English speech must stay in English in Latin script. " +
  "For Hindi or Hinglish speech, write Hindi words in Devanagari and retain English words in Latin script. " +
  "Do not render Hindi speech in Urdu/Arabic script. For ambiguous shared Hindi/Urdu vocabulary, prefer Hindi Devanagari unless the speaker explicitly requests Urdu. " +
  "Preserve Urdu when explicitly requested and preserve all other languages in their normal scripts. " +
  "Names: Clinic Assistant, Maya Shah, Oliver Chen, Amelia Reed, Arjun Patel, Sophia Morgan, Ethan Brooks.";

export const replyLanguages = [
  "English",
  "Hindi",
  "Spanish",
  "French",
  "German",
  "Portuguese",
  "Italian",
  "Arabic",
  "Urdu",
  "Bengali",
  "Tamil",
  "Telugu",
  "Marathi",
  "Gujarati",
  "Kannada",
  "Malayalam",
  "Punjabi",
  "Nepali",
  "Chinese (Mandarin)",
  "Japanese",
  "Korean",
  "Russian",
  "Ukrainian",
  "Dutch",
  "Polish",
  "Turkish",
  "Vietnamese",
  "Thai",
  "Indonesian",
  "Malay",
  "Filipino",
  "Swedish",
  "Danish",
  "Norwegian",
  "Finnish",
  "Greek",
  "Hebrew",
  "Persian",
  "Romanian",
  "Czech",
  "Hungarian",
  "Swahili",
] as const;
export type ReplyLanguage = (typeof replyLanguages)[number];
export function replyLanguageInstructions(language: ReplyLanguage) {
  return (
    "The user selected " +
    language +
    " in the reply-language dropdown. Always speak and write your replies in " +
    language +
    ". " +
    "Understand the user's speech or text in any supported language, including mixed-language input, but do not mirror their input language. " +
    "The dropdown alone controls your output language. Saved history and spoken requests do not override this preference; if asked to change it, explain that they can use the Reply language dropdown. " +
    "Keep names, email addresses, reference codes and other exact identifiers unchanged. Hindi replies use Devanagari; Urdu replies use Urdu script. " +
    "Input transcription preserves the original spoken language, independently of the selected reply language."
  );
}
