import { z } from "zod";
import { DateOnly } from "../schemas/common";
import { OnboardingChecklist } from "../schemas/tenancy";
import {
  TodayActionClick,
  TodayActionClickInput,
  TodayActions,
  TodayActionsInput,
  TodaySummary,
} from "../schemas/today";
import { base, proc } from "./_base";

export const today = base
  .prefix("/today")
  .tag("today")
  .router({
    /** The command-center summary; `date` defaults to today in the org timezone. */
    summary: proc("today.read", { auth: "floor" })
      .route({ method: "GET", path: "/" })
      .input(z.object({ date: DateOnly.optional() }))
      .output(TodaySummary),
    /** Dismisses (or restores) the onboarding checklist card on Today. */
    dismissChecklist: proc("today.read")
      .route({ method: "POST", path: "/onboarding/dismiss" })
      .input(z.object({ dismissed: z.boolean().default(true) }))
      .output(OnboardingChecklist),
    /**
     * Up to 5 ranked actions with dollar impact (AC-E2), read from the day's stored set. Every
     * action carries dollars, so it is `finance.read` (owner, admin, office; AC-E5) and
     * `auth: user`, unlike `summary`: the floor never sees it, and the web asks for it only when
     * the caller holds `finance.read`, so a refusal never breaks Today. `date` defaults to today in
     * the shop's time zone. A set not built yet answers `generatedAt: null` (see `TodayActions`).
     * Implementer: backend-engineer (today), T-A9.
     */
    actions: proc("finance.read")
      .route({ method: "GET", path: "/actions" })
      .input(TodayActionsInput)
      .output(TodayActions),
    /**
     * Records that the caller opened an action. Idempotent on (date, key, caller): the first click
     * wins and every repeat returns the same `clickedAt` (the `digest.recordClick` pattern). A key
     * that isn't in the shop's stored set for `date` is ACTION_NOT_FOUND. Implementer: T-A9.
     */
    recordActionClick: proc("finance.read")
      .route({ method: "POST", path: "/actions/clicks" })
      .input(TodayActionClickInput)
      .output(TodayActionClick)
      .errors({
        ACTION_NOT_FOUND: {
          status: 404,
          message: "That action is no longer on Today",
        },
      }),
  });
