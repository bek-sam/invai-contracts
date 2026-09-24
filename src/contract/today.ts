import { z } from "zod";
import { DateOnly } from "../schemas/common";
import { TodaySummary } from "../schemas/today";
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
  });
