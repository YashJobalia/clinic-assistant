import { actionContracts } from "./semantic/actions";
export type ActionActivity = {
  label: string;
  detail: string;
  status: "completed" | "review" | "failed" | "signin";
  source: "voice" | "text";
  durationMs: number;
};

const labels: Record<string, string> = {
  ...Object.fromEntries(
    Object.entries(actionContracts).map(([action, contract]) => [
      action,
      contract.label,
    ]),
  ),
  get_ontology: "Read Clinic Assistant domain definitions",
  get_capabilities: "Check account permissions",
  lookup_account: "Look up an account",
  start_signin: "Open sign-in",
  get_account: "Read account details",
  list_specialists: "Find specialists",
  list_appointments: "Load appointments",
  search_appointments: "Search appointments",
  availability: "Check available times",
  navigate: "Open a page",
  end_call: "End the call",
  mute: "Mute the microphone",
  confirm: "Apply confirmed changes",
};

// Only allowlisted labels and aggregate counts enter the activity panel.
// Never copy tool arguments, credentials, patient notes or raw error messages.
export function actionActivity(
  action: string,
  args: Record<string, unknown>,
  result: unknown,
  durationMs: number,
  source: ActionActivity["source"],
): ActionActivity {
  const data =
    result && typeof result === "object"
      ? (result as Record<string, unknown>)
      : {};
  const lookup = data.accountLookup as { status?: string } | undefined;
  const failed =
    Boolean(data.error) ||
    data.ok === false ||
    lookup?.status === "rate_limited";
  const signin =
    Boolean(data.authentication) &&
    !["lookup_account", "start_signin"].includes(action);
  const review = !failed && Boolean(data.pending);
  const operation =
    action === "prepare" && typeof args.action === "string"
      ? args.action
      : action;
  let detail = failed
    ? "Could not complete this action. See Mira's reply for the next step."
    : review
      ? "Draft ready. Waiting for your confirmation before saving."
      : "Action completed.";
  if (!failed && !review) {
    for (const [key, noun] of [
      ["appointments", "appointments"],
      ["searchResults", "appointments"],
      ["specialists", "specialists"],
      ["slots", "available times"],
    ]) {
      if (Array.isArray(data[key])) {
        detail = `${data[key].length} ${data[key].length === 1 ? noun.slice(0, -1) : noun} returned${data.truncated ? " (more results available)" : ""}.`;
        break;
      }
    }
    if (lookup?.status === "found")
      detail = "Matching account found. Sign-in is required to access it.";
    if (lookup?.status === "not_found")
      detail = "No account matched the supplied contact.";
    if (action === "start_signin")
      detail = data.authentication
        ? "Private sign-in form opened."
        : "Already signed in.";
    if (signin)
      detail =
        "Sign in to continue. No private records were accessed or changed.";
    if (action === "navigate") {
      const nav = data.navigation as Record<string, unknown> | undefined;
      const pages: Record<string, string> = {
        reception: "Voice assistant",
        appointments: "My appointments",
        specialists: "Specialists",
        account: "My account",
        doctor: "Doctor panel",
      };
      detail = `${pages[String(nav?.page)] || "Requested page"}${nav?.mode === "calendar" ? " - calendar view" : nav?.mode === "list" ? " - list view" : ""} opened.`;
    }
  }
  return {
    label:
      !failed &&
      data.receipt &&
      typeof data.receipt === "object" &&
      "action" in data.receipt
        ? labels[String(data.receipt.action)] ||
          labels[operation] ||
          "Process a request"
        : labels[operation] || "Process a request",
    detail,
    status: failed
      ? "failed"
      : signin
        ? "signin"
        : review
          ? "review"
          : "completed",
    source,
    durationMs: Math.max(0, Math.round(durationMs)),
  };
}
