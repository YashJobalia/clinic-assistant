import { z } from "zod";
import { mutationVariants } from "../workspace";
import {
  actionContracts,
  permittedActions,
  type SemanticAction,
} from "./actions";
import {
  entities,
  relationships,
  invariants,
  ontologyVersion,
  clinicTimeZone,
} from "./ontology";

// Derived from the very same Zod schemas used to validate manual and AI actions.
const inputSchemas = Object.fromEntries(
  mutationVariants.map((schema) => [
    schema.shape.action.value,
    z.toJSONSchema(schema, { io: "input", unrepresentable: "any" }),
  ]),
);

export function semanticCatalog(actor: { guest?: boolean; role?: string }) {
  return {
    version: ontologyVersion,
    timeZone: clinicTimeZone,
    entities,
    relationships,
    invariants,
    evidence: {
      directory: "Public clinic configuration; does not imply availability.",
      availability: "Fresh database snapshot; may change before confirmation.",
      appointment: "Permission-scoped current database record.",
      patientReport: "Patient-reported summary, not a verified diagnosis.",
      completion:
        "Successful server result only; errors and timeouts are not proof of completion.",
    },
    actions: permittedActions(actor).map((action) => ({
      action,
      ...actionContracts[action],
      input: inputSchemas[action],
      confirmation:
        "Prepare a signed draft, review exact details, then confirm on a subsequent explicit approval. Revalidate permissions and current facts at execution.",
    })),
    inputRules:
      "JSON schemas describe shape. Runtime validators additionally normalize phone numbers and enforce real dates and business policies. Never infer missing facts or authorization from aliases.",
  };
}

export function semanticInstructions(actor: {
  guest?: boolean;
  role?: string;
}) {
  return `Clinic Assistant domain contract ${ontologyVersion}: ${JSON.stringify(semanticCatalog(actor))}`;
}

export const toolActions = [
  "navigate",
  "start_signin",
  "lookup_account",
  "get_account",
  "get_capabilities",
  "get_ontology",
  "search_appointments",
  "list_appointments",
  "list_specialists",
  "availability",
  "prepare",
  "confirm",
  "end_call",
  "mute",
] as const;

export function actionOutcome(action: SemanticAction) {
  return {
    version: ontologyVersion,
    state: "completed" as const,
    code: actionContracts[action].outcome,
    entity: actionContracts[action].entity,
  };
}
